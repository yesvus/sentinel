"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import Link from "next/link";
import { Clock3, Info, ListTodo, Pencil, Plus, Play, Square, SquareCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { sessions, projects as projectsApi, tasks as tasksApi, ApiError, Project, StudySession, Task } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { NOISE_SESSION_EVENT } from "@/lib/noise-player";
import { ProjectIconPicker } from "@/components/project-icon-picker";
import { ProjectSelector } from "@/components/project-selector";
import { ProjectIcon, NoProjectIcon } from "@/lib/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDuration, pad, dayKey } from "@/lib/date";
import { sessionDurationSeconds } from "@/lib/session-stats";
import { useSidebar } from "@/components/ui/sidebar";
import { ScrollFade } from "@/components/scroll-fade";
import { useInitialActiveSession } from "@/lib/active-session-context";
import { BROADCAST_CHANNEL_NAME, SessionBroadcastMessage } from "@/lib/session-sync";
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
  const [todaySessions, setTodaySessions] = useState<StudySession[]>([]);
  const [recentSessions, setRecentSessions] = useState<StudySession[]>([]);
  const [sidebarsVisible, setSidebarsVisible] = useState(false);
  const [sidebarsExiting, setSidebarsExiting] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectIcon, setNewProjectIcon] = useState<string | null>(null);
  const [newProjectParentId, setNewProjectParentId] = useState<number | null>(null);
  const [newProjectPinned, setNewProjectPinned] = useState(false);

  const [sessionId, setSessionId] = useState<number | null>(() => initialActiveSession?.id ?? null);
  const [startedAt, setStartedAt] = useState<number | null>(() =>
    initialActiveSession ? new Date(initialActiveSession.started_at).getTime() : null,
  );
  const [elapsedMs, setElapsedMs] = useState(() =>
    initialActiveSession ? Math.max(0, Date.now() - new Date(initialActiveSession.started_at).getTime()) : 0,
  );
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const descriptionSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRunning = sessionId !== null && lastDuration === null;
  const wasRunningRef = useRef(isRunning);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

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
    setSessionId(active.id);
    setStartedAt(new Date(active.started_at).getTime());
    setElapsedMs(Date.now() - new Date(active.started_at).getTime());
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
    sessions.list({ from: today.toISOString() }).then(setTodaySessions).catch(() => {});
    // The active session is included first, so fetch one extra item to keep four completed sessions visible.
    sessions.page(null, 5).then((page) => setRecentSessions(page.items.filter((session) => session.ended_at !== null).slice(0, 4))).catch(() => {});
  }

  useEffect(() => {
    projectsApi.list().then(setProjectList).catch(() => {});
    tasksApi.list().then(setTaskList).catch(() => {});
    loadSidebars();
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

  async function handleAddTask(e: FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setTaskSubmitting(true);
    try {
      const created = await tasksApi.create(todayKey, newTaskTitle.trim(), projectId);
      setTaskList((list) => [...list, created]);
      if (!isRunning) setSelectedTaskIds((ids) => [...ids, created.id]);
      setNewTaskTitle("");
      setTaskFormOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add task");
    } finally {
      setTaskSubmitting(false);
    }
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
        setLastDuration(null);
        setProjectId(message.projectId);
        setDescription(message.description ?? "");
        setSelectedTaskIds([]);
      } else if (message.type === "stopped") {
        setLastDuration(message.durationSeconds);
        setSessionId(null);
        setStartedAt(null);
        setElapsedMs(0);
        setDescription("");
        setProductionPercentage(defaultProductionPercentage);
        setStopOpen(false);
      } else if (message.type === "updated") {
        setProjectId(message.projectId);
        setDescription(message.description ?? "");
        if (message.startedAt) {
          const nextStartedAt = new Date(message.startedAt).getTime();
          setStartedAt(nextStartedAt);
          setElapsedMs(Math.max(0, Date.now() - nextStartedAt));
        }
      }
    }

    channel.addEventListener("message", handleMessage);
    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
      channelRef.current = null;
    };
  }, [defaultProductionPercentage]);

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

  useEffect(() => {
    if (isRunning && startedAt !== null) {
      intervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAt);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, startedAt]);

  async function handleStart() {
    setError(null);
    setBusy(true);
    try {
      const session = await sessions.start({ projectId, description: description || null, taskIds: selectedTaskIds });
      setSessionId(session.id);
      setStartedAt(new Date(session.startedAt).getTime());
      setElapsedMs(0);
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
      setElapsedMs(Math.max(0, now - nextStartedAt));
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

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;

    try {
      const project = await projectsApi.create(
        newProjectName.trim(),
        newProjectIcon,
        null,
        newProjectParentId,
        newProjectPinned,
      );
      setProjectList((list) => [...list, project].sort((a, b) => a.name.localeCompare(b.name)));
      setNewProjectName("");
      setNewProjectIcon(null);
      setNewProjectParentId(null);
      setNewProjectPinned(false);
      setCreatingProject(false);
      await handleDetailsChange({ projectId: project.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
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
  const todayProjectTasks = taskList.filter((task) => task.period_start === todayKey && task.project_id === projectId);
  const availableTasks = todayProjectTasks.filter((task) => task.completed_at === null);
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
          {orderedTodayTaskGroups.map(({ project, tasks }) => (
            <button
              key={project?.id ?? "none"}
              type="button"
              disabled={isRunning || refreshingActive}
              onClick={() => handleDetailsChange({ projectId: project?.id ?? null })}
              className="hover:bg-muted/50 -mx-1 block w-[calc(100%+0.5rem)] cursor-pointer space-y-1 rounded px-1 py-0.5 text-left disabled:cursor-default disabled:hover:bg-transparent"
            >
              <p className="text-muted-foreground/80 flex items-center gap-1.5 text-xs">
                {project ? (
                  <ProjectIcon icon={project.icon} className="size-3" />
                ) : (
                  <NoProjectIcon className="size-3" />
                )}
                {project?.path ?? "No project"}
              </p>
              {tasks.map((task) => (
                <div key={task.id} className="flex items-start gap-1.5 text-sm">
                  {task.completed_at ? (
                    <SquareCheck className="text-muted-foreground/50 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Square className="text-muted-foreground/40 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className={`min-w-0 flex-1 break-words ${task.completed_at ? "text-muted-foreground/70 line-through" : "text-foreground/90"}`}>
                    {task.title}
                    {task.completed_at && <span className="sr-only"> (done)</span>}
                  </span>
                </div>
              ))}
            </button>
          ))}
          {todayTasks.length === 0 && (
            <p className="text-muted-foreground text-sm">Nothing planned for today.</p>
          )}
          <Link href={`/app/plan?day=${todayKey}`} className="text-primary block pt-1 text-xs font-medium hover:underline">
            Open today&apos;s plan →
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
                    <p className="text-sm whitespace-pre-wrap">{viewingSession.description}</p>
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
            <p className="font-mono text-7xl font-medium tracking-tight tabular-nums">
              {formatElapsed(elapsedMs)}
            </p>

            <div className="flex items-center gap-3">
              <div className="size-7 shrink-0" aria-hidden="true" />

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
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground shrink-0"
                  aria-label="Edit start time"
                  onClick={openEditStart}
                >
                  <Pencil className="size-3.5" />
                </Button>
              ) : (
                <div className="size-7 shrink-0" aria-hidden="true" />
              )}
            </div>

            {!isRunning && (
              <p className="text-muted-foreground -mt-2 text-xs">Tap to start focusing</p>
            )}

            {error && !stopOpen && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">Project</p>
            <ProjectSelector
              projects={projectList}
              value={projectId}
              onChange={(nextProjectId) => handleDetailsChange({ projectId: nextProjectId })}
              onCreate={() => setCreatingProject(true)}
              disabled={isRunning || refreshingActive}
            />
          </div>

          {creatingProject && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="Project name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateProject();
                    }
                  }}
                />
                <Button onClick={handleCreateProject}>Add</Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCreatingProject(false);
                    setNewProjectName("");
                    setNewProjectIcon(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
              <ProjectIconPicker value={newProjectIcon} onChange={setNewProjectIcon} />
              <select
                value={newProjectParentId ?? ""}
                onChange={(event) => setNewProjectParentId(event.target.value ? Number(event.target.value) : null)}
                aria-label="Parent project"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="">Root project</option>
                {projectList.filter((project) => !project.archived && project.depth < 3).map((project) => (
                  <option key={project.id} value={project.id}>{project.path}</option>
                ))}
              </select>
              <Button type="button" variant={newProjectPinned ? "default" : "outline"} onClick={() => setNewProjectPinned((value) => !value)}>
                {newProjectPinned ? "Pinned" : "Pin project"}
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-medium">{isRunning ? "Tasks" : "Working on"}</p>
              {isRunning && !taskFormOpen && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground -my-1"
                  aria-label="Add a task"
                  onClick={() => setTaskFormOpen(true)}
                >
                  <Plus className="size-4" />
                </Button>
              )}
            </div>
            {taskFormOpen && (
              <form className="flex gap-2" onSubmit={handleAddTask}>
                <Input
                  autoFocus
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Add a task"
                  className="h-8 flex-1 text-sm"
                />
                <Button type="submit" size="sm" disabled={taskSubmitting}>
                  {taskSubmitting ? "Adding..." : "Add"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTaskFormOpen(false);
                    setNewTaskTitle("");
                  }}
                >
                  Cancel
                </Button>
              </form>
            )}
            {!isRunning && !taskFormOpen && (
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
                <button
                  type="button"
                  onClick={() => setTaskFormOpen(true)}
                  aria-label="Add a task"
                  className="border-border text-muted-foreground hover:bg-muted/50 rounded-full border border-dashed px-3 py-1 text-sm"
                >
                  <Plus className="size-3.5" />
                </button>
              </ScrollFade>
            )}
            {isRunning && todayProjectTasks.length > 0 && (
              <ScrollFade className="flex max-h-28 flex-col gap-1 overflow-y-auto pr-1">
                {todayProjectTasks.map((task) => (
                  <label key={task.id} className="flex cursor-pointer items-start gap-2 text-sm">
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
            {descriptionStatus !== "idle" && (
              <p className="text-muted-foreground text-xs">
                {descriptionStatus === "saving" ? "Saving..." : "Saved"}
              </p>
            )}
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
          {recentSessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setViewingSession(session)}
              className="hover:bg-muted/50 -mx-1 flex w-[calc(100%+0.5rem)] min-w-0 cursor-pointer items-start justify-between gap-2 rounded px-1 py-0.5 text-left text-sm"
            >
              <div className="min-w-0">
                <p className="text-foreground/90 flex items-center gap-1.5 truncate">
                  {session.project_id ? (
                    <ProjectIcon icon={session.project_icon} className="text-muted-foreground size-3.5 shrink-0" />
                  ) : (
                    <NoProjectIcon className="text-muted-foreground size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{session.project_name ?? "No project"}</span>
                </p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {session.description || new Date(session.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              </div>
              <span className="text-muted-foreground shrink-0 font-mono text-xs">{formatDuration(session.duration_seconds ?? 0)}</span>
            </button>
          ))}
          {recentSessions.length === 0 && <p className="text-muted-foreground text-sm">Your completed sessions will show here.</p>}
          <Link href="/app/stats" className="text-primary block pt-1 text-xs font-medium hover:underline">
            View all activity →
          </Link>
        </div>
      </aside>}
    </div>
  );
}
