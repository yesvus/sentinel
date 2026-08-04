import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import type { useActiveSession } from "@/lib/active-session-context";
import { ApiError, type PlannedSession } from "@/lib/api";
import { combineLocalDateAndTime, formatDuration, timeInputValue } from "@/lib/date";

type ActiveSession = ReturnType<typeof useActiveSession>;

type HomeSessionOptions = {
  active: ActiveSession;
  defaultProductionPercentage: number;
  trackProductionSplit: boolean;
  loadSidebars: () => Promise<unknown>;
};

export function useHomeSession({ active, defaultProductionPercentage, trackProductionSplit, loadSidebars }: HomeSessionOptions) {
  const { activeSession, now, startSession, startPlannedSession, updateSession, stopSession, pauseSession, resumeSession } = active;
  const [projectId, setProjectId] = useState<number | null>(() => activeSession?.project_id ?? null);
  const [description, setDescription] = useState(() => activeSession?.description ?? "");
  const [descriptionStatus, setDescriptionStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [productionPercentage, setProductionPercentage] = useState(defaultProductionPercentage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [editStartOpen, setEditStartOpen] = useState(false);
  const [editStartTime, setEditStartTime] = useState("");
  const [editStartError, setEditStartError] = useState<string | null>(null);
  const [editStartBusy, setEditStartBusy] = useState(false);
  const descriptionSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionRef = useRef(description);
  const descriptionDirtyRef = useRef(false);
  const previousSessionIdRef = useRef(activeSession?.id ?? null);
  const previousRunningRef = useRef(activeSession !== null);
  const updateSessionRef = useRef(updateSession);

  const sessionId = activeSession?.id ?? null;
  const startedAt = activeSession ? new Date(activeSession.started_at).getTime() : null;
  const isRunning = activeSession !== null;
  const isPaused = activeSession?.paused_at != null;

  useEffect(() => {
    updateSessionRef.current = updateSession;
  }, [updateSession]);

  useEffect(() => {
    const sessionWasRunning = previousRunningRef.current;
    const previousSessionId = previousSessionIdRef.current;
    previousRunningRef.current = isRunning;
    previousSessionIdRef.current = activeSession?.id ?? null;
    const timer = window.setTimeout(() => {
      if (activeSession) {
        setProjectId(activeSession.project_id);
        if (!descriptionDirtyRef.current) {
          const nextDescription = activeSession.description ?? "";
          descriptionRef.current = nextDescription;
          setDescription(nextDescription);
        }
        if (activeSession.id > 0 && previousSessionId !== null && previousSessionId < 0 && descriptionDirtyRef.current) {
          const pendingDescription = descriptionRef.current;
          setDescriptionStatus("saving");
          void updateSessionRef.current(activeSession.id, {
            projectId: activeSession.project_id,
            description: pendingDescription,
          }).then(() => {
            if (descriptionRef.current === pendingDescription) descriptionDirtyRef.current = false;
            setDescriptionStatus("saved");
            window.setTimeout(() => setDescriptionStatus((status) => status === "saved" ? "idle" : status), 1500);
          }).catch(() => setDescriptionStatus("idle"));
        }
        if (!sessionWasRunning) void loadSidebars();
      } else if (sessionWasRunning) {
        const optimisticRollback = previousSessionId !== null && previousSessionId < 0;
        if (!optimisticRollback) {
          descriptionRef.current = "";
          descriptionDirtyRef.current = false;
          setDescription("");
          setProductionPercentage(defaultProductionPercentage);
          setStopOpen(false);
          void loadSidebars();
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeSession, defaultProductionPercentage, isRunning, loadSidebars]);

  useEffect(() => () => {
    if (descriptionSaveTimeout.current) clearTimeout(descriptionSaveTimeout.current);
  }, []);

  async function changeDetails(next: { projectId?: number | null; description?: string }) {
    const nextProjectId = next.projectId !== undefined ? next.projectId : projectId;
    const nextDescription = next.description !== undefined ? next.description : description;
    if (next.projectId !== undefined) setProjectId(next.projectId);
    if (next.description !== undefined) {
      setDescription(next.description);
      descriptionRef.current = next.description;
      if (sessionId !== null) descriptionDirtyRef.current = true;
    }
    if (sessionId === null) return;

    if (next.description !== undefined && sessionId < 0) {
      if (descriptionSaveTimeout.current) clearTimeout(descriptionSaveTimeout.current);
      setDescriptionStatus("saving");
      return;
    }

    const save = () => updateSession(sessionId, { projectId: nextProjectId, description: nextDescription })
      .then(() => {
        if (next.description !== undefined) {
          if (descriptionRef.current === nextDescription) descriptionDirtyRef.current = false;
          setDescriptionStatus("saved");
          setTimeout(() => setDescriptionStatus((status) => status === "saved" ? "idle" : status), 1500);
        }
      })
      .catch(() => {
        if (next.description !== undefined) setDescriptionStatus("idle");
      });
    if (next.description !== undefined) {
      if (descriptionSaveTimeout.current) clearTimeout(descriptionSaveTimeout.current);
      descriptionSaveTimeout.current = setTimeout(() => {
        setDescriptionStatus("saving");
        void save();
      }, 600);
    } else {
      await save();
    }
  }

  async function start(taskIds: number[]) {
    setError(null);
    setBusy(true);
    descriptionDirtyRef.current = false;
    try {
      await startSession({ projectId, description: description || null, taskIds });
      void loadSidebars();
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function startPlanned(plan: PlannedSession) {
    setError(null);
    setBusy(true);
    descriptionDirtyRef.current = false;
    try {
      await startPlannedSession(plan);
      void loadSidebars();
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not start this planned session.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (sessionId === null) return false;
    setError(null);
    setBusy(true);
    try {
      const result = await stopSession(sessionId, description || null, trackProductionSplit ? productionPercentage : null);
      setDescription("");
      setProductionPercentage(defaultProductionPercentage);
      setStopOpen(false);
      void loadSidebars();
      toast.add({ type: "success", title: "Session recorded", description: `${formatDuration(result.durationSeconds)} logged.` });
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    if (sessionId === null) return;
    setBusy(true);
    setError(null);
    try {
      if (isPaused) await resumeSession(sessionId);
      else await pauseSession(sessionId);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update the session pause.");
    } finally {
      setBusy(false);
    }
  }

  function openEditStart() {
    if (startedAt === null) return;
    setEditStartTime(timeInputValue(new Date(startedAt)));
    setEditStartError(null);
    setEditStartOpen(true);
  }

  async function editStart() {
    if (sessionId === null || startedAt === null) return;
    setEditStartError(null);
    const nextStartedAt = combineLocalDateAndTime(startedAt, editStartTime).getTime();
    if (Number.isNaN(nextStartedAt)) {
      setEditStartError("Enter a valid start time");
      return;
    }
    if (nextStartedAt > now) {
      setEditStartError("Start time can't be in the future");
      return;
    }
    setEditStartBusy(true);
    try {
      await updateSession(sessionId, { startedAt: new Date(nextStartedAt).toISOString() });
      setEditStartOpen(false);
    } catch (caught) {
      setEditStartError(caught instanceof ApiError ? caught.message : "Something went wrong");
    } finally {
      setEditStartBusy(false);
    }
  }

  function requestStop() {
    setProductionPercentage(defaultProductionPercentage);
    setStopOpen(true);
  }

  return {
    sessionId, startedAt, isRunning, isPaused,
    projectId, description, descriptionStatus, productionPercentage,
    busy, error, stopOpen, editStartOpen, editStartTime, editStartError, editStartBusy,
    setError, setStopOpen, setProductionPercentage, setEditStartOpen, setEditStartTime,
    changeDetails, start, startPlanned, stop, togglePause, openEditStart, editStart, requestStop,
  };
}
