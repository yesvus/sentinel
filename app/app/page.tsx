"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clock3, Info, ListTodo, Pause, Pencil, Play, Square, SquareCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { sessions, projects as projectsApi, tasks as tasksApi, notes as notesApi, ApiError, Note, Project, StudySession, Task } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { NOISE_SESSION_EVENT } from "@/lib/noise-player";
import { ProjectCreatorPopover } from "@/components/project-creator-popover";
import { ProjectSelector } from "@/components/project-selector";
import { TaskCreatorPopover } from "@/components/task-creator-popover";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { LinkifiedText } from "@/components/linkified-text";
import { ProjectIcon, NoProjectIcon } from "@/lib/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDuration, pad, dayKey } from "@/lib/date";
import { sessionDurationSeconds } from "@/lib/session-stats";
import { useSidebar } from "@/components/ui/sidebar";
import { ScrollFade } from "@/components/scroll-fade";
import { useInitialActiveSession } from "@/lib/active-session-context";
import { BROADCAST_CHANNEL_NAME, SessionBroadcastMessage } from "@/lib/session-sync";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

function activeElapsedMs(startedAt: number, at: number, pausedAt: number | null, pausedSeconds: number) {
  const effectiveEnd = pausedAt ?? at;
  return Math.max(0, effectiveEnd - startedAt - pausedSeconds * 1000);
}

function toTimeInput(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Combines a "HH:mm" time with the calendar date of `base`, so overnight sessions keep their original day. */
function combineDateAndTime(base: number, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(base);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function conflictSession(err: unknown): StudySession | null | undefined {
  if (!(err instanceof ApiError) || err.status !== 409) return undefined;
  const body = err.body as { session?: StudySession | null } | undefined;
  return body?.session;
}

export default function AppHomePage() {
  const { user } = useAuth();
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const initialActiveSession = useInitialActiveSession();
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(() => initialActiveSession?.project_id ?? null);
  const [description, setDescription] = useState(() => initialActiveSession?.description ?? "");
  const [descriptionStatus, setDescriptionStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [refreshingActive, setRefreshingActive] = useState(false);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [todaySessions, setTodaySessions] = useState<StudySession[]>([]);
  const [recentSessions, setRecentSessions] = useState<StudySession[]>([]);
  const [sidebarDataLoaded, setSidebarDataLoaded] = useState(false);
  const [sidebarsVisible, setSidebarsVisible] = useState(false);
  const [sidebarsExiting, setSidebarsExiting] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [deletingTaskIds, setDeletingTaskIds] = useState<number[]>([]);
  const [recentTaskIds, setRecentTaskIds] = useState<number[]>([]);

  const [sessionId, setSessionId] = useState<number | null>(() => initialActiveSession?.id ?? null);
  const [startedAt, setStartedAt] = useState<number | null>(() =>
    initialActiveSession ? new Date(initialActiveSession.started_at).getTime() : null,
  );
  const [elapsedMs, setElapsedMs] = useState(() =>
    initialActiveSession
      ? activeElapsedMs(
          new Date(initialActiveSession.started_at).getTime(),
          Date.now(),
          initialActiveSession.paused_at ? new Date(initialActiveSession.paused_at).getTime() : null,
          initialActiveSession.paused_seconds ?? 0,
        )
      : 0,
  );
  const [pausedAt, setPausedAt] = useState<number | null>(() =>
    initialActiveSession?.paused_at ? new Date(initialActiveSession.paused_at).getTime() : null,
  );
  const [pausedSeconds, setPausedSeconds] = useState(() => initialActiveSession?.paused_seconds ?? 0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [viewingSession, setViewingSession] = useState<StudySession | null>(null);
  const [viewingSessionTasks, setViewingSessionTasks] = useState<Task[]>([]);
  const [editStartOpen, setEditStartOpen] = useState(false);
  const [editStartTime, setEditStartTime] = useState("");
  const [editStartError, setEditStartError] = useState<string | null>(null);
  const [editStartBusy, setEditStartBusy] = useState(false);
  const trackProductionSplit = user?.trackProductionSplit ?? true;
  const defaultProductionPercentage = user?.defaultSessionType === "producing" ? 100 : 0;
  const [productionPercentage, setProductionPercentage] = useState(defaultProductionPercentage);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const descriptionSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRunning = sessionId !== null && lastDuration === null;
  const isPaused = isRunning && pausedAt !== null;
  const wasRunningRef = useRef(isRunning);

  useEffect(() => {
    if (!isRunning || startedAt === null) return;
    const interval = setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      setElapsedMs(activeElapsedMs(startedAt, currentTime, pausedAt, pausedSeconds));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, pausedAt, pausedSeconds, startedAt]);

  useEffect(() => {
    if (!isRunning) {
      wasRunningRef.current = false;
      const showTimer = window.setTimeout(() => {
        setSidebarsVisible(true);
        setSidebarsExiting(false);
      }, 0);
      return () => window.clearTimeout(showTimer);
    }
    // Only force the sidebar shut at the moment a session actually starts — not every time this
    // page is revisited while a session that was already running keeps running.
    const justStarted = !wasRunningRef.current;
    wasRunningRef.current = true;
    if (justStarted) {
      if (isMobile) setOpenMobile(false);
      else setOpen(false);
    }
    if (!sidebarsVisible) return; // never shown yet (e.g. loaded straight into a running session) — nothing to animate out
    let hideTimer: number | null = null;
    const exitTimer = window.setTimeout(() => {
      setSidebarsExiting(true);
      hideTimer = window.setTimeout(() => setSidebarsVisible(false), 260);
    }, 0);
    return () => {
      window.clearTimeout(exitTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
    // setOpen/setOpenMobile intentionally excluded: their identity changes whenever the sidebar's
    // open state changes, which would re-fire this effect and force it shut again right after the
    // user manually reopens it mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, isRunning]);

  function applyActiveSession(active: StudySession) {
    const nextStartedAt = new Date(active.started_at).getTime();
    const nextPausedAt = active.paused_at ? new Date(active.paused_at).getTime() : null;
    const nextPausedSeconds = active.paused_seconds ?? 0;
    setSessionId(active.id);
    setStartedAt(nextStartedAt);
    setPausedAt(nextPausedAt);
    setPausedSeconds(nextPausedSeconds);
    setElapsedMs(activeElapsedMs(nextStartedAt, Date.now(), nextPausedAt, nextPausedSeconds));
    setProjectId(active.project_id);
    setDescription(active.description ?? "");
    setLastDuration(null);
  }

  function broadcast(message: SessionBroadcastMessage) {
    channelRef.current?.postMessage(message);
  }

  function loadSidebars() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Promise.all([
      sessions.list({ from: today.toISOString() }).then(setTodaySessions).catch(() => {}),
      // The active session is included first, so fetch one extra item to keep four completed sessions visible.
      sessions.page(null, 5).then((page) => setRecentSessions(page.items.filter((session) => session.ended_at !== null).slice(0, 4))).catch(() => {}),
    ]);
  }

  useEffect(() => {
    Promise.all([
      projectsApi.list().then(setProjectList).catch(() => {}),
      tasksApi.list().then(setTaskList).catch(() => {}),
      notesApi.list().then(setNoteList).catch(() => {}),
      loadSidebars(),
    ]).finally(() => setSidebarDataLoaded(true));
  }, []);

  function toggleTask(id: number) {
    setSelectedTaskIds((current) => (current.includes(id) ? current.filter((t) => t !== id) : [...current, id]));
  }

  async function toggleTaskCompletion(task: Task) {
    try {
      const updated = await tasksApi.update(task.id, { completed: task.completed_at === null });
      setTaskList((list) => list.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      // best-effort toggle, not worth surfacing an error for
    }
  }

  function handleTaskUpdated(updated: Task) {
    setTaskList((list) => list.map((task) => task.id === updated.id ? updated : task));
  }

  async function deleteTask(task: Task) {
    setDeletingTaskIds((ids) => [...ids, task.id]);
    try {
      await tasksApi.remove(task.id);
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      setTaskList((list) => list.filter((item) => item.id !== task.id));
      setSelectedTaskIds((ids) => ids.filter((id) => id !== task.id));
    } catch {
      setError("Could not delete this task.");
    } finally {
      setDeletingTaskIds((ids) => ids.filter((id) => id !== task.id));
    }
  }

  function handleTaskCreated(created: Task) {
    setTaskList((list) => [...list, created]);
    setRecentTaskIds((ids) => [...ids, created.id]);
    if (!isRunning) setSelectedTaskIds((ids) => [...ids, created.id]);
    window.setTimeout(() => {
      setRecentTaskIds((ids) => ids.filter((id) => id !== created.id));
    }, 500);
  }

  // Same-tab-group sync: other tabs of this browser pick up our mutations instantly.
  useEffect(() => {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channelRef.current = channel;

    function handleMessage(event: MessageEvent<SessionBroadcastMessage>) {
      const message = event.data;
      if (message.type === "started") {
        setSessionId(message.id);
        setStartedAt(new Date(message.startedAt).getTime());
        setElapsedMs(0);
        setPausedAt(null);
        setPausedSeconds(0);
        setLastDuration(null);
        setProjectId(message.projectId);
        setDescription(message.description ?? "");
        setSelectedTaskIds([]);
      } else if (message.type === "stopped") {
        setLastDuration(message.durationSeconds);
        setSessionId(null);
        setStartedAt(null);
        setElapsedMs(0);
        setPausedAt(null);
        setPausedSeconds(0);
        setDescription("");
        setProductionPercentage(defaultProductionPercentage);
        setStopOpen(false);
      } else if (message.type === "paused") {
        setPausedAt(new Date(message.pausedAt).getTime());
        setPausedSeconds(message.pausedSeconds);
      } else if (message.type === "resumed") {
        setPausedAt(null);
        setPausedSeconds(message.pausedSeconds);
      } else if (message.type === "updated") {
        setProjectId(message.projectId);
        setDescription(message.description ?? "");
        if (message.startedAt) {
          const nextStartedAt = new Date(message.startedAt).getTime();
          setStartedAt(nextStartedAt);
          setElapsedMs(activeElapsedMs(nextStartedAt, Date.now(), pausedAt, pausedSeconds));
        }
      }
    }

    channel.addEventListener("message", handleMessage);
    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
      channelRef.current = null;
    };
  }, [defaultProductionPercentage, pausedAt, pausedSeconds]);

  // Cross-device sync: catch up with whatever happened elsewhere when we come back to this tab.
  useEffect(() => {
    function refetchActive() {
      setRefreshingActive(true);
      sessions
        .getActive()
        .then((active) => {
          if (active) {
            applyActiveSession(active);
            return;
          }
          setSessionId((current) => (current !== null ? null : current));
          setLastDuration(null);
          setStartedAt(null);
          setElapsedMs(0);
          setPausedAt(null);
          setPausedSeconds(0);
        })
        .catch(() => {})
        .finally(() => setRefreshingActive(false));
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") refetchActive();
    }

    // Also reconcile once on mount: the initial state comes from a session snapshot fetched by the
    // app shell before this page rendered, which can be stale if a session started or stopped on
    // another tab/device while the user was navigating around within this one.
    refetchActive();

    window.addEventListener("focus", refetchActive);
    window.addEventListener("online", refetchActive);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refetchActive);
      window.removeEventListener("online", refetchActive);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  async function handleStart() {
    setError(null);
    setBusy(true);
    try {
      const session = await sessions.start({ projectId, description: description || null, taskIds: selectedTaskIds });
      setSessionId(session.id);
      setStartedAt(new Date(session.startedAt).getTime());
      setElapsedMs(0);
      setPausedAt(null);
      setPausedSeconds(0);
      setLastDuration(null);
      setSelectedTaskIds([]);
      broadcast({
        type: "started",
        id: session.id,
        startedAt: session.startedAt,
        projectId,
        description: description || null,
      });
      window.dispatchEvent(new CustomEvent(NOISE_SESSION_EVENT, { detail: "started" }));
      loadSidebars();
    } catch (err) {
      const active = conflictSession(err);
      if (active !== undefined) {
        // A session was already running (e.g. started from another device); adopt it
        // instead of showing an error, same as resuming one on load.
        if (active) applyActiveSession(active);
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (sessionId === null) return;
    setError(null);
    setBusy(true);
    try {
      const result = await sessions.stop(sessionId, description || null, trackProductionSplit ? productionPercentage : null);
      setLastDuration(result.durationSeconds);
      setSessionId(null);
      setStartedAt(null);
      setElapsedMs(0);
      setPausedAt(null);
      setPausedSeconds(0);
      setDescription("");
      setProductionPercentage(defaultProductionPercentage);
      setStopOpen(false);
      broadcast({ type: "stopped", durationSeconds: result.durationSeconds });
      window.dispatchEvent(new CustomEvent(NOISE_SESSION_EVENT, { detail: "stopped" }));
      loadSidebars();
      toast.add({
        type: "success",
        title: "Session recorded",
        description: `${formatDuration(result.durationSeconds)} logged.`,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handlePauseToggle() {
    if (sessionId === null) return;
    setBusy(true);
    setError(null);
    try {
      if (isPaused) {
        const result = await sessions.resume(sessionId);
        setPausedAt(null);
        setPausedSeconds(result.pausedSeconds);
        broadcast({ type: "resumed", pausedSeconds: result.pausedSeconds });
        window.dispatchEvent(new CustomEvent(NOISE_SESSION_EVENT, { detail: "resumed" }));
      } else {
        const result = await sessions.pause(sessionId);
        setPausedAt(new Date(result.pausedAt).getTime());
        setPausedSeconds(result.pausedSeconds);
        broadcast({ type: "paused", pausedAt: result.pausedAt, pausedSeconds: result.pausedSeconds });
        window.dispatchEvent(new CustomEvent(NOISE_SESSION_EVENT, { detail: "paused" }));
      }
    } catch (err) {
      const active = await sessions.getActive().catch(() => null);
      if (active) applyActiveSession(active);
      else {
        setSessionId(null);
        setStartedAt(null);
        setPausedAt(null);
        setPausedSeconds(0);
        setElapsedMs(0);
      }
      setError(err instanceof ApiError ? err.message : "Could not update the session pause.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!isPaused || pausedAt === null || sessionId === null) return;
    const timeoutMinutes = user?.sessionPauseTimeoutMinutes ?? 30;
    const delay = Math.max(0, pausedAt + timeoutMinutes * 60_000 - Date.now());
    const timer = window.setTimeout(async () => {
      try {
        const result = await sessions.expirePause(sessionId);
        if (!result.ended) return;
        const durationSeconds = result.durationSeconds ?? Math.floor(elapsedMs / 1000);
        setLastDuration(durationSeconds);
        setSessionId(null);
        setStartedAt(null);
        setPausedAt(null);
        setPausedSeconds(0);
        setElapsedMs(0);
        broadcast({ type: "stopped", durationSeconds });
        window.dispatchEvent(new CustomEvent(NOISE_SESSION_EVENT, { detail: "stopped" }));
        loadSidebars();
        toast.add({
          type: "info",
          title: "Session ended after a long pause",
          description: `${formatDuration(durationSeconds)} logged. The interruption was excluded.`,
        });
      } catch {
        // Reconciled on the next focus/active-session request if the device is offline at the deadline.
      }
    }, Math.min(delay + 50, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [elapsedMs, isPaused, pausedAt, sessionId, user?.sessionPauseTimeoutMinutes]);

  useEffect(() => {
    if (!viewingSession) return;
    let cancelled = false;
    sessions
      .tasks(viewingSession.id)
      .then((result) => {
        if (!cancelled) setViewingSessionTasks(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      setViewingSessionTasks([]);
    };
  }, [viewingSession]);

  function openEditStart() {
    if (startedAt === null) return;
    setEditStartTime(toTimeInput(new Date(startedAt)));
    setEditStartError(null);
    setEditStartOpen(true);
  }

  async function handleEditStart() {
    if (sessionId === null || startedAt === null) return;
    setEditStartError(null);
    const nextStartedAt = combineDateAndTime(startedAt, editStartTime);
    if (nextStartedAt > now) {
      setEditStartError("Start time can't be in the future");
      return;
    }
    setEditStartBusy(true);
    try {
      await sessions.update(sessionId, { startedAt: new Date(nextStartedAt).toISOString() });
      setStartedAt(nextStartedAt);
      setElapsedMs(activeElapsedMs(nextStartedAt, now, pausedAt, pausedSeconds));
      broadcast({
        type: "updated",
        projectId,
        description: description || null,
        startedAt: new Date(nextStartedAt).toISOString(),
      });
      setEditStartOpen(false);
    } catch (err) {
      setEditStartError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setEditStartBusy(false);
    }
  }

  async function handleDetailsChange(next: { projectId?: number | null; description?: string }) {
    const nextProjectId = next.projectId !== undefined ? next.projectId : projectId;
    const nextDescription = next.description !== undefined ? next.description : description;

    if (next.projectId !== undefined) {
      setProjectId(next.projectId);
      if (sessionId === null) setSelectedTaskIds([]);
    }
    if (next.description !== undefined) setDescription(next.description);

    if (sessionId === null) return;

    const save = () =>
      sessions
        .update(sessionId, { projectId: nextProjectId, description: nextDescription })
        .then(() => {
          broadcast({ type: "updated", projectId: nextProjectId, description: nextDescription });
          if (next.description !== undefined) {
            setDescriptionStatus("saved");
            setTimeout(() => setDescriptionStatus((s) => (s === "saved" ? "idle" : s)), 1500);
          }
        })
        .catch(() => {
          // best-effort save, not worth surfacing to the user mid-session
          if (next.description !== undefined) setDescriptionStatus("idle");
        });

    if (next.description !== undefined) {
      // Debounce so we're not firing a request on every keystroke.
      if (descriptionSaveTimeout.current) clearTimeout(descriptionSaveTimeout.current);
      descriptionSaveTimeout.current = setTimeout(() => {
        setDescriptionStatus("saving");
        save();
      }, 600);
    } else {
      await save();
    }
  }

  const todayKey = dayKey(new Date());
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const todayNote = noteList.find((note) => note.scope === "day" && note.date_key === todayKey);
  const todayProjectTasks = taskList.filter((task) => task.period_start === todayKey && task.project_id === projectId);
  const availableTasks = todayProjectTasks.filter((task) => task.completed_at === null);
  const activeProject = projectList.find((project) => project.id === projectId) ?? null;
  const todayTasks = taskList.filter((task) => task.period_start === todayKey);
  const todayTaskGroups = new Map<string, { project: Project | null; tasks: Task[] }>();
  for (const task of todayTasks) {
    const project = projectList.find((item) => item.id === task.project_id) ?? null;
    const key = project ? String(project.id) : "none";
    const group = todayTaskGroups.get(key) ?? { project, tasks: [] };
    group.tasks.push(task);
    todayTaskGroups.set(key, group);
  }
  const orderedTodayTaskGroups = Array.from(todayTaskGroups.values()).sort((a, b) => {
    if (!a.project) return 1;
    if (!b.project) return -1;
    return a.project.path.localeCompare(b.project.path);
  });
  const todayTrackedSeconds = todaySessions.reduce((total, session) => total + sessionDurationSeconds(session, now), 0);

  return (
    <div className="mx-auto grid min-h-full w-full max-w-6xl items-center justify-center gap-8 px-4 py-8 lg:grid-cols-[minmax(13rem,15rem)_minmax(24rem,30rem)_minmax(13rem,15rem)] lg:gap-10">
      {sidebarsVisible && <aside className={`${sidebarsExiting ? "animate-out fade-out slide-out-to-left-2 animation-duration-250 fill-mode-forwards" : "animate-in fade-in slide-in-from-left-2 animation-duration-500 fill-mode-both"} order-2 space-y-3 motion-reduce:transition-none lg:order-1`}>
        <div className="flex items-center justify-between px-1">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            <ListTodo className="size-3.5" />
            Today
          </div>
          {todayTrackedSeconds > 0 && <span className="text-muted-foreground font-mono text-xs">{formatDuration(todayTrackedSeconds)}</span>}
        </div>
        <div className="space-y-3 px-1">
          {!sidebarDataLoaded && (
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {sidebarDataLoaded && orderedTodayTaskGroups.map(({ project, tasks }) => (
            <div
              key={project?.id ?? "none"}
              className="-mx-1 flex w-[calc(100%+0.5rem)] flex-col gap-1 rounded px-1 py-0.5"
            >
              <button
                type="button"
                disabled={isRunning || refreshingActive}
                onClick={() => handleDetailsChange({ projectId: project?.id ?? null })}
                className="text-muted-foreground/80 hover:text-foreground flex items-center gap-1.5 rounded text-left text-xs transition-colors duration-150 disabled:cursor-default"
              >
                {project ? (
                  <ProjectIcon icon={project.icon} className="size-3" />
                ) : (
                  <NoProjectIcon className="size-3" />
                )}
                <span className="truncate" title={project?.path}>{project?.name ?? "No project"}</span>
              </button>
              {tasks.map((task) => (
                <div key={task.id} className="flex items-start gap-1.5 rounded py-0.5 text-sm transition-colors duration-150 hover:bg-muted/50">
                  {task.completed_at ? (
                    <SquareCheck className="text-muted-foreground/50 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Square className="text-muted-foreground/40 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`break-words ${task.completed_at ? "text-muted-foreground/70 line-through" : "text-foreground/90"}`}>
                      {task.title}
                      {task.completed_at && <span className="sr-only"> (done)</span>}
                    </span>
                    {task.description && (
                      <LinkifiedText text={task.description} className="text-muted-foreground line-clamp-2 text-xs leading-relaxed" />
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
          {sidebarDataLoaded && todayTasks.length === 0 && (
            <p className="text-muted-foreground text-sm">Nothing planned for today.</p>
          )}
          {sidebarDataLoaded && todayNote?.content && (
            <LinkifiedText text={todayNote.content} as="p" className="text-muted-foreground border-t pt-2 text-xs" />
          )}
          <Link href={`/app/calendar/${todayKey}`} className="text-primary block pt-1 text-xs font-medium hover:underline">
            Open today in Calendar →
          </Link>
        </div>
      </aside>}

      <main className={`animate-in fade-in fill-mode-both animation-duration-500 delay-75 order-1 flex flex-col items-center gap-6 ${!sidebarsVisible ? "lg:col-start-2" : "lg:order-2"}`}>
      <div className="w-full max-w-sm">
        {isRunning ? (
          <p className="text-muted-foreground text-sm font-medium">{todayLabel}</p>
        ) : (
          <p className="text-2xl font-semibold tracking-tight">
            {greeting()}
            {user?.name ? `, ${user.name}` : user?.email ? `, ${user.email.split("@")[0]}` : ""}
          </p>
        )}
      </div>

      <Dialog open={editStartOpen} onOpenChange={(open) => !editStartBusy && setEditStartOpen(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Edit start time</DialogTitle>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="About editing start time"
                    />
                  }
                >
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-72">
                  Use this when you forgot to start the timer, or started it partway through your
                  work. It&apos;s an estimate — the elapsed time updates to match.
                </TooltipContent>
              </Tooltip>
            </div>
            <DialogDescription>Adjust when this session actually began.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-start-time">Start time</Label>
              <Input
                id="edit-start-time"
                type="time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
              />
            </div>
            {editStartTime && startedAt !== null && (
              <p className="text-center text-sm font-medium" aria-live="polite">
                New elapsed time: {formatElapsed(Math.max(0, now - combineDateAndTime(startedAt, editStartTime)))}
              </p>
            )}
            {editStartError && <p className="text-destructive text-sm">{editStartError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditStartOpen(false)} disabled={editStartBusy}>
              Cancel
            </Button>
            <Button type="button" onClick={handleEditStart} disabled={editStartBusy}>
              {editStartBusy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stopOpen} onOpenChange={(open) => !busy && setStopOpen(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Finish session</DialogTitle>
              {trackProductionSplit && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="About Learning and Producing"
                      />
                    }
                  >
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72">
                    Learning builds capability for later. Producing creates or delivers something
                    usable now. This is your estimate, not a productivity score.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <DialogDescription>
              {trackProductionSplit ? "Adjust the split, then finish." : "Finish this session."}
            </DialogDescription>
          </DialogHeader>
          {trackProductionSplit && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm font-medium">
                <span>Learning</span>
                <span>Producing</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={productionPercentage}
                onChange={(event) => setProductionPercentage(Number(event.target.value))}
                aria-label="Learning and Producing allocation"
                aria-valuetext={`Learning ${100 - productionPercentage} percent, Producing ${productionPercentage} percent`}
                className="accent-primary w-full cursor-pointer"
              />
              <p className="text-center text-sm font-medium" aria-live="polite">
                Learning {100 - productionPercentage}% · Producing {productionPercentage}%
              </p>
              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
          )}
          {!trackProductionSplit && error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setStopOpen(false)} disabled={busy}>
              Keep running
            </Button>
            <Button type="button" onClick={handleStop} disabled={busy}>
              {busy ? "Saving..." : "Finish session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewingSession !== null} onOpenChange={(open) => !open && setViewingSession(null)}>
        <DialogContent className="max-w-sm">
          {viewingSession && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {viewingSession.project_id ? (
                    <ProjectIcon icon={viewingSession.project_icon} />
                  ) : (
                    <NoProjectIcon />
                  )}
                  <span className="min-w-0 truncate">{viewingSession.project_name ?? "No project"}</span>
                </DialogTitle>
                <DialogDescription>
                  {new Date(viewingSession.started_at).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-mono">{formatDuration(viewingSession.duration_seconds ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Started</span>
                  <span>
                    {new Date(viewingSession.started_at).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {viewingSession.ended_at && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Ended</span>
                    <span>
                      {new Date(viewingSession.ended_at).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}
                {viewingSession.production_percentage != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Learning / Producing</span>
                    <span>
                      {100 - viewingSession.production_percentage}% / {viewingSession.production_percentage}%
                    </span>
                  </div>
                )}
                {viewingSessionTasks.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">Tasks</p>
                    <div className="space-y-1">
                      {viewingSessionTasks.map((task) => (
                        <div key={task.id} className="flex items-start gap-1.5 text-sm">
                          {task.completed_at ? (
                            <SquareCheck className="text-muted-foreground/50 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <Square className="text-muted-foreground/40 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          )}
                          <span className={`min-w-0 flex-1 break-words ${task.completed_at ? "text-muted-foreground/70 line-through" : ""}`}>
                            {task.title}
                            {task.completed_at && <span className="sr-only"> (done)</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {viewingSession.description && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">Notes</p>
                    <LinkifiedText text={viewingSession.description} as="p" className="text-sm" />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center gap-5 border-b pt-4 pb-4">
            {isRunning && (
              <div className="animate-in fade-in slide-in-from-top-1 flex max-w-full flex-wrap items-center justify-center gap-2 duration-300">
                <div
                  className="bg-muted/60 text-muted-foreground flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                  title={activeProject?.path ?? "No project"}
                >
                  {activeProject ? (
                    <ProjectIcon icon={activeProject.icon} className="size-3.5 shrink-0" />
                  ) : (
                    <NoProjectIcon className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{activeProject?.path ?? "No project"}</span>
                </div>
                {isPaused && (
                  <span className="border-amber-500/30 bg-amber-500/10 text-amber-700 animate-in fade-in zoom-in-95 rounded-full border px-2.5 py-1 text-xs font-medium duration-200 dark:text-amber-300">
                    Paused · time excluded
                  </span>
                )}
              </div>
            )}
            <p className="font-mono text-7xl font-medium tracking-tight tabular-nums">
              {formatElapsed(elapsedMs)}
            </p>

            <div className="flex items-center gap-3">
              {isRunning ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={cn(
                    "size-10 shrink-0 rounded-full transition-[color,background-color,border-color,transform] duration-150 active:scale-95",
                    isPaused && "border-primary/40 bg-primary/10 text-primary",
                  )}
                  aria-label={isPaused ? "Resume session" : "Pause for an interruption"}
                  onClick={handlePauseToggle}
                  disabled={busy}
                >
                  {isPaused ? <Play className="ml-0.5 size-4 fill-current" /> : <Pause className="size-4 fill-current" />}
                </Button>
              ) : (
                <div className="size-10 shrink-0" aria-hidden="true" />
              )}

              <Button
                size="icon"
                disabled={busy}
                onClick={
                  isRunning
                    ? () => {
                        setProductionPercentage(defaultProductionPercentage);
                        setStopOpen(true);
                      }
                    : handleStart
                }
                aria-label={isRunning ? "Stop session" : "Start session"}
                className={`size-16 shrink-0 rounded-full shadow-sm transition-colors ${
                  isRunning ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""
                }`}
              >
                {isRunning ? (
                  <Square className="size-5 fill-current" />
                ) : (
                  <Play className="ml-0.5 size-6 fill-current" />
                )}
              </Button>

              {isRunning ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="text-muted-foreground size-10 shrink-0 rounded-full transition-transform duration-150 active:scale-95"
                  aria-label="Edit start time"
                  onClick={openEditStart}
                >
                  <Pencil className="size-3.5" />
                </Button>
              ) : (
                <div className="size-10 shrink-0" aria-hidden="true" />
              )}
            </div>

            {!isRunning && (
              <p className="text-muted-foreground -mt-2 text-xs">Tap to start focusing</p>
            )}

            {error && !stopOpen && <p className="text-destructive text-sm">{error}</p>}
          </div>

          {!isRunning && (
            <div className="animate-in fade-in slide-in-from-top-1 space-y-1.5 duration-300">
              <p className="text-muted-foreground text-xs font-medium">Project</p>
              <ProjectSelector
                projects={projectList}
                value={projectId}
                onChange={(nextProjectId) => handleDetailsChange({ projectId: nextProjectId })}
                disabled={refreshingActive}
              />
              <ProjectCreatorPopover
                compact
                disabled={refreshingActive}
                onCreated={(project) => {
                  setProjectList((list) => [...list, project].sort((a, b) => a.name.localeCompare(b.name)));
                  void handleDetailsChange({ projectId: project.id });
                }}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-medium">{isRunning ? "Tasks" : "Working on"}</p>
              {isRunning && sessionId !== null && (
                <TaskCreatorPopover
                  periodStart={todayKey}
                  projects={projectList}
                  defaultProjectId={projectId}
                  sessionId={sessionId}
                  onCreated={handleTaskCreated}
                />
              )}
            </div>
            {!isRunning && (
              <ScrollFade className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {availableTasks.map((task) => {
                  const selected = selectedTaskIds.includes(task.id);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      aria-pressed={selected}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      {task.title}
                    </button>
                  );
                })}
                <TaskCreatorPopover
                  periodStart={todayKey}
                  projects={projectList}
                  defaultProjectId={projectId}
                  onCreated={handleTaskCreated}
                  trigger="chip"
                />
              </ScrollFade>
            )}
            {isRunning && todayProjectTasks.length > 0 && (
              <ScrollFade className="flex max-h-28 flex-col gap-1 overflow-y-auto pr-1">
                {todayProjectTasks.map((task) => (
                  <div
                    key={task.id}
                    className={cn(
                      "group/task flex min-w-0 items-start gap-1 rounded-md px-1 py-0.5 transition-[background-color,opacity,transform] duration-150 hover:bg-muted/50",
                      recentTaskIds.includes(task.id) && "animate-in fade-in slide-in-from-top-1 duration-300",
                      deletingTaskIds.includes(task.id) && "animate-out fade-out slide-out-to-right-2 pointer-events-none fill-mode-forwards",
                    )}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={task.completed_at !== null}
                        onChange={() => toggleTaskCompletion(task)}
                        className="accent-primary mt-0.5 size-4 shrink-0"
                      />
                      <span className={task.completed_at ? "text-muted-foreground line-through" : ""}>
                        {task.title}
                      </span>
                    </label>
                    <div className="flex gap-0.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover/task:opacity-100 sm:group-focus-within/task:opacity-100">
                      <TaskEditorPopover task={task} onUpdated={handleTaskUpdated} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Delete ${task.title}`}
                        onClick={() => deleteTask(task)}
                        disabled={deletingTaskIds.includes(task.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
              </ScrollFade>
            )}
          </div>

          <div className="space-y-1">
            <Textarea
              placeholder="Include more details about your session (optional)"
              value={description}
              onChange={(e) => handleDetailsChange({ description: e.target.value })}
              disabled={refreshingActive}
            />
            <p className={`text-muted-foreground h-4 text-xs ${descriptionStatus === "idle" ? "invisible" : "visible"}`}>
              {descriptionStatus === "saving" ? "Saving..." : "Saved"}
            </p>
          </div>
        </CardContent>
      </Card>
      </main>

      {sidebarsVisible && <aside className={`${sidebarsExiting ? "animate-out fade-out slide-out-to-right-2 animation-duration-250 fill-mode-forwards" : "animate-in fade-in slide-in-from-right-2 animation-duration-500 delay-150 fill-mode-both"} order-3 space-y-3 motion-reduce:transition-none`}>
        <div className="flex items-center justify-between px-1">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            <Clock3 className="size-3.5" />
            Recent
          </div>
        </div>
        <div className="space-y-3 px-1">
          {!sidebarDataLoaded && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-3 w-8 shrink-0" />
                </div>
              ))}
            </div>
          )}
          {sidebarDataLoaded && recentSessions.map((session) => (
            <div
              key={session.id}
              className="hover:bg-muted/50 -mx-1 flex w-[calc(100%+0.5rem)] min-w-0 flex-col gap-0.5 rounded px-1 py-0.5 text-sm transition-colors duration-150"
            >
              <button
                type="button"
                onClick={() => setViewingSession(session)}
                className="flex min-w-0 cursor-pointer items-start justify-between gap-2 text-left"
              >
                <p className="text-foreground/90 flex items-center gap-1.5 truncate">
                  {session.project_id ? (
                    <ProjectIcon icon={session.project_icon} className="text-muted-foreground size-3.5 shrink-0" />
                  ) : (
                    <NoProjectIcon className="text-muted-foreground size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{session.project_name ?? "No project"}</span>
                </p>
                <span className="text-muted-foreground shrink-0 font-mono text-xs">{formatDuration(session.duration_seconds ?? 0)}</span>
              </button>
              {session.description ? (
                <LinkifiedText text={session.description} as="p" className="text-muted-foreground line-clamp-1 text-xs" />
              ) : (
                <p className="text-muted-foreground truncate text-xs">
                  {new Date(session.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              )}
            </div>
          ))}
          {sidebarDataLoaded && recentSessions.length === 0 && <p className="text-muted-foreground text-sm">Your completed sessions will show here.</p>}
          <Link href="/app/calendar/history" className="text-primary block pt-1 text-xs font-medium hover:underline">
            View all activity →
          </Link>
        </div>
      </aside>}
    </div>
  );
}
