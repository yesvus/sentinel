"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { Info, Pencil, Plus, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { sessions, projects as projectsApi, tasks as tasksApi, ApiError, Project, StudySession, Task } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { NOISE_SESSION_EVENT } from "@/lib/noise-player";
import { ProjectIconPicker } from "@/components/project-icon-picker";
import { ProjectSelector } from "@/components/project-selector";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { pad, dayKey } from "@/lib/date";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const BROADCAST_CHANNEL_NAME = "sentinel-session-sync";

type SessionBroadcastMessage =
  | { type: "started"; id: number; startedAt: string; projectId: number | null; description: string | null }
  | { type: "stopped"; durationSeconds: number }
  | { type: "updated"; projectId: number | null; description: string | null; startedAt?: string };

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
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [descriptionStatus, setDescriptionStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [refreshingActive, setRefreshingActive] = useState(false);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectIcon, setNewProjectIcon] = useState<string | null>(null);
  const [newProjectParentId, setNewProjectParentId] = useState<number | null>(null);
  const [newProjectPinned, setNewProjectPinned] = useState(false);

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const [resuming, setResuming] = useState(true);
  const [stopOpen, setStopOpen] = useState(false);
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

  useEffect(() => {
    projectsApi.list().then(setProjectList).catch(() => {});
    tasksApi.list().then(setTaskList).catch(() => {});
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

  useEffect(() => {
    sessions
      .getActive()
      .then((active) => {
        if (active) applyActiveSession(active);
      })
      .catch(() => {})
      .finally(() => setResuming(false));
  }, []);

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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

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
    if (nextStartedAt > Date.now()) {
      setEditStartError("Start time can't be in the future");
      return;
    }
    setEditStartBusy(true);
    try {
      await sessions.update(sessionId, { startedAt: new Date(nextStartedAt).toISOString() });
      setStartedAt(nextStartedAt);
      setElapsedMs(Math.max(0, Date.now() - nextStartedAt));
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
  const todayProjectTasks = taskList.filter((task) => task.period_start === todayKey && task.project_id === projectId);
  const availableTasks = todayProjectTasks.filter((task) => task.completed_at === null);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4">
      <div className="text-center">
        <p className="text-sm font-medium">
          {greeting()}
          {user?.name ? `, ${user.name}` : user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </p>
      </div>

      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <p className="font-mono text-7xl font-medium tracking-tight tabular-nums">
            {formatElapsed(elapsedMs)}
          </p>
          {isRunning && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground absolute top-1 -right-9"
              aria-label="Edit start time"
              onClick={openEditStart}
            >
              <Pencil className="size-4" />
            </Button>
          )}
        </div>

        <Button
          size="icon"
          disabled={busy || resuming}
          onClick={
            isRunning
              ? () => {
                  setProductionPercentage(defaultProductionPercentage);
                  setStopOpen(true);
                }
              : handleStart
          }
          aria-label={isRunning ? "Stop session" : "Start session"}
          className="size-16 rounded-full shadow-sm"
        >
          {isRunning ? (
            <Square className="size-5 fill-current" />
          ) : (
            <Play className="ml-0.5 size-6 fill-current" />
          )}
        </Button>

        {error && !stopOpen && <p className="text-destructive text-sm">{error}</p>}

        {!isRunning && lastDuration !== null && (
          <p className="text-muted-foreground text-sm">
            Last session: {formatElapsed(lastDuration * 1000)}
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
                New elapsed time: {formatElapsed(Math.max(0, Date.now() - combineDateAndTime(startedAt, editStartTime)))}
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

      <Card className="w-full max-w-sm">
        <CardContent className="space-y-3">
          <ProjectSelector
            projects={projectList}
            value={projectId}
            onChange={(nextProjectId) => handleDetailsChange({ projectId: nextProjectId })}
            onCreate={() => setCreatingProject(true)}
            disabled={isRunning || refreshingActive}
          />

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
              <div className="flex flex-wrap gap-1.5">
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
              </div>
            )}
            {isRunning && todayProjectTasks.length > 0 && (
              <div className="flex flex-col gap-1">
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
              </div>
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
    </div>
  );
}
