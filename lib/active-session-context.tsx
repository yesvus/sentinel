"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { ApiError, clearApiCache, sessions, type SessionUpdateResult, type StudySession } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDuration } from "@/lib/date";
import { NOISE_SESSION_EVENT } from "@/lib/noise-player";
import { BROADCAST_CHANNEL_NAME, type SessionBroadcastMessage } from "@/lib/session-sync";

type StartDetails = { projectId?: number | null; description?: string | null; taskIds?: number[] };
type UpdateDetails = {
  projectId?: number | null;
  description?: string | null;
  startedAt?: string;
  endedAt?: string | null;
  productionPercentage?: number | null;
  taskIds?: number[];
  taskPeriodStart?: string;
};

type ActiveSessionContextValue = {
  activeSession: StudySession | null;
  elapsedMs: number;
  now: number;
  sessionRevision: number;
  loading: boolean;
  reconciling: boolean;
  reconcile: () => Promise<StudySession | null>;
  notifySessionChanged: () => Promise<StudySession | null>;
  startSession: (details: StartDetails) => Promise<StudySession>;
  updateSession: (id: number, details: UpdateDetails) => Promise<SessionUpdateResult>;
  createManualSession: (details: Parameters<typeof sessions.createManual>[0]) => ReturnType<typeof sessions.createManual>;
  deleteSession: (id: number) => Promise<void>;
  stopSession: (id: number, description?: string | null, productionPercentage?: number | null) => ReturnType<typeof sessions.stop>;
  pauseSession: (id: number) => ReturnType<typeof sessions.pause>;
  resumeSession: (id: number) => ReturnType<typeof sessions.resume>;
};

const ActiveSessionContext = createContext<ActiveSessionContextValue | null>(null);

function elapsedFor(session: StudySession | null, now = Date.now()) {
  if (!session) return 0;
  const end = session.paused_at ? new Date(session.paused_at).getTime() : now;
  return Math.max(0, end - new Date(session.started_at).getTime() - (session.paused_seconds ?? 0) * 1000);
}

function localNoise(action: "started" | "stopped" | "paused" | "resumed") {
  window.dispatchEvent(new CustomEvent(NOISE_SESSION_EVENT, { detail: action }));
}

export function ActiveSessionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeSession, setActiveSession] = useState<StudySession | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [sessionRevision, setSessionRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const requestRef = useRef(0);
  const activeRef = useRef<StudySession | null>(null);
  const hasReconciledRef = useRef(false);

  const applyActive = useCallback((session: StudySession | null) => {
    setNow(Date.now());
    activeRef.current = session;
    setActiveSession(session);
    setElapsedMs(elapsedFor(session));
  }, []);

  const runReconcile = useCallback(async (signalDetectedChange: boolean) => {
    const request = ++requestRef.current;
    setReconciling(true);
    try {
      const session = await sessions.getActive();
      if (request !== requestRef.current) return activeRef.current;
      const changed = hasReconciledRef.current && JSON.stringify(session) !== JSON.stringify(activeRef.current);
      applyActive(session);
      hasReconciledRef.current = true;
      if (changed && signalDetectedChange) {
        clearApiCache();
        setSessionRevision((revision) => revision + 1);
      }
      return session;
    } finally {
      if (request === requestRef.current) {
        setReconciling(false);
        setLoading(false);
      }
    }
  }, [applyActive]);

  const reconcile = useCallback(() => runReconcile(true), [runReconcile]);

  const invalidateReconciliation = useCallback(() => {
    // A GET started before the mutation must not be allowed to apply afterward.
    requestRef.current += 1;
    setReconciling(false);
    setLoading(false);
  }, []);

  const applyMutation = useCallback((session: StudySession | null) => {
    invalidateReconciliation();
    applyActive(session);
    hasReconciledRef.current = true;
    setSessionRevision((revision) => revision + 1);
  }, [applyActive, invalidateReconciliation]);

  const post = useCallback((message: SessionBroadcastMessage) => {
    channelRef.current?.postMessage(message);
  }, []);

  const notifySessionChanged = useCallback(async () => {
    const previous = activeRef.current;
    clearApiCache();
    const next = await runReconcile(false);
    setSessionRevision((revision) => revision + 1);
    post({ type: "changed" });
    if (previous && !next) localNoise("stopped");
    if (!previous && next) localNoise("started");
    return next;
  }, [post, runReconcile]);

  const reconcileAllSessionData = useCallback(() => {
    clearApiCache();
    setSessionRevision((revision) => revision + 1);
    return runReconcile(false);
  }, [runReconcile]);

  useEffect(() => {
    const timer = window.setTimeout(() => reconcile().catch(() => setLoading(false)), 0);
    return () => window.clearTimeout(timer);
  }, [reconcile]);

  useEffect(() => {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channelRef.current = channel;
    const handleMessage = (event: MessageEvent<SessionBroadcastMessage>) => {
      const previous = activeRef.current;
      clearApiCache();
      setSessionRevision((revision) => revision + 1);
      runReconcile(false)
        .then((next) => {
          if (event.data.type !== "changed") return;
          if (previous && !next) localNoise("stopped");
          if (!previous && next) localNoise("started");
        })
        .catch(() => {});
    };
    channel.addEventListener("message", handleMessage);
    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
      channelRef.current = null;
    };
  }, [runReconcile]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") reconcileAllSessionData().catch(() => {});
    };
    const handleReconcile = () => {
      reconcileAllSessionData().catch(() => {});
    };
    window.addEventListener("focus", handleReconcile);
    window.addEventListener("online", handleReconcile);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleReconcile);
      window.removeEventListener("online", handleReconcile);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [reconcileAllSessionData]);

  useEffect(() => {
    if (!activeSession) return;
    const interval = window.setInterval(() => {
      setNow(Date.now());
      if (!activeSession.paused_at) setElapsedMs(elapsedFor(activeSession));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession?.paused_at) return;
    const sessionId = activeSession.id;
    const deadline = new Date(activeSession.paused_at).getTime() + (user?.sessionPauseTimeoutMinutes ?? 30) * 60_000;
    const timer = window.setTimeout(async () => {
      try {
        const result = await sessions.expirePause(sessionId);
        if (!result.ended) {
          await reconcile();
          return;
        }
        const durationSeconds = result.durationSeconds ?? Math.floor(elapsedFor(activeSession) / 1000);
        applyMutation(null);
        post({ type: "stopped" });
        localNoise("stopped");
        toast.add({
          type: "info",
          title: "Session ended after a long pause",
          description: `${formatDuration(durationSeconds)} logged. The interruption was excluded.`,
        });
      } catch {
        // Focus, visibility, or online reconciliation retries after an offline deadline.
      }
    }, Math.min(Math.max(0, deadline - Date.now()) + 50, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [activeSession, applyMutation, post, reconcile, user?.sessionPauseTimeoutMinutes]);

  async function startSession(details: StartDetails) {
    try {
      const started = await sessions.start(details);
      const provisional: StudySession = {
        id: started.id,
        started_at: started.startedAt,
        ended_at: null,
        duration_seconds: null,
        description: details.description ?? null,
        project_id: details.projectId ?? null,
        project_name: null,
        project_icon: null,
        paused_at: null,
        paused_seconds: 0,
      };
      applyMutation(provisional);
      post({ type: "started" });
      localNoise("started");
      reconcile().catch(() => {});
      return provisional;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const conflict = (error.body as { session?: StudySession | null } | undefined)?.session;
        if (conflict) {
          applyMutation(conflict);
          return conflict;
        }
      }
      throw error;
    }
  }

  async function updateSession(id: number, details: UpdateDetails) {
    const previous = activeRef.current;
    const result = await sessions.update(id, details);
    applyMutation(result.activeSession);
    post({ type: "changed" });
    if (previous && !result.activeSession) localNoise("stopped");
    if (!previous && result.activeSession) localNoise("started");
    return result;
  }

  async function createManualSession(details: Parameters<typeof sessions.createManual>[0]) {
    const result = await sessions.createManual(details);
    invalidateReconciliation();
    setSessionRevision((revision) => revision + 1);
    post({ type: "changed" });
    return result;
  }

  async function deleteSession(id: number) {
    const deletingActive = activeRef.current?.id === id;
    await sessions.remove(id);
    if (deletingActive) {
      applyMutation(null);
      localNoise("stopped");
    } else {
      invalidateReconciliation();
      setSessionRevision((revision) => revision + 1);
    }
    post({ type: "changed" });
  }

  async function stopSession(id: number, description?: string | null, productionPercentage?: number | null) {
    try {
      const result = await sessions.stop(id, description, productionPercentage);
      applyMutation(null);
      post({ type: "stopped" });
      localNoise("stopped");
      return result;
    } catch (error) {
      reconcile().catch(() => {});
      throw error;
    }
  }

  async function pauseSession(id: number) {
    try {
      const result = await sessions.pause(id);
      const current = activeRef.current;
      if (current?.id === id) applyMutation({ ...current, paused_at: result.pausedAt, paused_seconds: result.pausedSeconds });
      else {
        invalidateReconciliation();
        setSessionRevision((revision) => revision + 1);
      }
      post({ type: "paused" });
      localNoise("paused");
      return result;
    } catch (error) {
      reconcile().catch(() => {});
      throw error;
    }
  }

  async function resumeSession(id: number) {
    try {
      const result = await sessions.resume(id);
      const current = activeRef.current;
      if (current?.id === id) applyMutation({ ...current, paused_at: null, paused_seconds: result.pausedSeconds });
      else {
        invalidateReconciliation();
        setSessionRevision((revision) => revision + 1);
      }
      post({ type: "resumed" });
      localNoise("resumed");
      return result;
    } catch (error) {
      reconcile().catch(() => {});
      throw error;
    }
  }

  return (
    <ActiveSessionContext.Provider
      value={{ activeSession, elapsedMs, now, sessionRevision, loading, reconciling, reconcile, notifySessionChanged, startSession, updateSession, createManualSession, deleteSession, stopSession, pauseSession, resumeSession }}
    >
      {children}
    </ActiveSessionContext.Provider>
  );
}

export function useActiveSession() {
  const context = useContext(ActiveSessionContext);
  if (!context) throw new Error("useActiveSession must be used within ActiveSessionProvider");
  return context;
}
