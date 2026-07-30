"use client";

import { useEffect, useRef, useState } from "react";
import { Info, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { sessions, projects as projectsApi, ApiError, Project, StudySession } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { NOISE_SESSION_EVENT } from "@/lib/noise-player";
import { ProjectIconPicker } from "@/components/project-icon-picker";
import { ProjectSelector } from "@/components/project-selector";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  }, []);

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
        .catch(() => {});
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") refetchActive();
    }

    window.addEventListener("focus", refetchActive);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refetchActive);
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
      const session = await sessions.start({ projectId, description: description || null });
      setSessionId(session.id);
      setStartedAt(new Date(session.startedAt).getTime());
      setElapsedMs(0);
      setLastDuration(null);
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
      const result = await sessions.stop(sessionId, description || null, productionPercentage);
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

    if (next.projectId !== undefined) setProjectId(next.projectId);
    if (next.description !== undefined) setDescription(next.description);

    if (sessionId === null) return;

    const save = () =>
      sessions
        .update(sessionId, { projectId: nextProjectId, description: nextDescription })
        .then(() => {
          broadcast({ type: "updated", projectId: nextProjectId, description: nextDescription });
        })
        .catch(() => {
          // best-effort save, not worth surfacing to the user mid-session
        });

    if (next.description !== undefined) {
      // Debounce so we're not firing a request on every keystroke.
      if (descriptionSaveTimeout.current) clearTimeout(descriptionSaveTimeout.current);
      descriptionSaveTimeout.current = setTimeout(save, 600);
    } else {
      await save();
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4">
      <div className="text-center">
        <p className="text-sm font-medium">
          {greeting()}
          {user?.name ? `, ${user.name}` : user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </p>
      </div>

      <div className="flex flex-col items-center gap-5">
        <p className="font-mono text-7xl font-medium tracking-tight tabular-nums">
          {formatElapsed(elapsedMs)}
        </p>

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

      <Dialog open={stopOpen} onOpenChange={(open) => !busy && setStopOpen(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Finish session</DialogTitle>
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
            </div>
            <DialogDescription>Adjust the split, then finish.</DialogDescription>
          </DialogHeader>
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

          <Textarea
            placeholder="What are you working on? (optional)"
            value={description}
            onChange={(e) => handleDetailsChange({ description: e.target.value })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
