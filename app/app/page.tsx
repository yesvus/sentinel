"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sessions, projects as projectsApi, ApiError, Project, StudySession } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ProjectIcon } from "@/lib/icons";
import { NOISE_SESSION_EVENT } from "@/lib/noise-player";

const NEW_PROJECT_VALUE = "__new__";
const NO_PROJECT_VALUE = "__none__";
const BROADCAST_CHANNEL_NAME = "sentinel-session-sync";

type SessionBroadcastMessage =
  | { type: "started"; id: number; startedAt: string; projectId: number | null; description: string | null }
  | { type: "stopped"; durationSeconds: number }
  | { type: "updated"; projectId: number | null; description: string | null };

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

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const [resuming, setResuming] = useState(true);
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
      } else if (message.type === "updated") {
        setProjectId(message.projectId);
        setDescription(message.description ?? "");
      }
    }

    channel.addEventListener("message", handleMessage);
    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
      channelRef.current = null;
    };
  }, []);

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
      const result = await sessions.stop(sessionId);
      setLastDuration(result.durationSeconds);
      setSessionId(null);
      setStartedAt(null);
      setElapsedMs(0);
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
      const project = await projectsApi.create(newProjectName.trim());
      setProjectList((list) => [...list, project].sort((a, b) => a.name.localeCompare(b.name)));
      setNewProjectName("");
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
          onClick={isRunning ? handleStop : handleStart}
          className="size-16 rounded-full shadow-sm"
        >
          {isRunning ? (
            <Square className="size-5 fill-current" />
          ) : (
            <Play className="ml-0.5 size-6 fill-current" />
          )}
        </Button>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {!isRunning && lastDuration !== null && (
          <p className="text-muted-foreground text-sm">
            Last session: {formatElapsed(lastDuration * 1000)}
          </p>
        )}
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="space-y-3">
          <Select
            value={projectId !== null ? String(projectId) : NO_PROJECT_VALUE}
            onValueChange={(value) => {
              if (value === NEW_PROJECT_VALUE) {
                setCreatingProject(true);
                return;
              }
              if (value === NO_PROJECT_VALUE) {
                handleDetailsChange({ projectId: null });
                return;
              }
              handleDetailsChange({ projectId: Number(value) });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(value: string) => {
                  const project = projectList.find((p) => String(p.id) === value);
                  return (
                    <span className="flex items-center gap-2">
                      <ProjectIcon icon={project?.icon ?? null} className="size-4" />
                      {project?.name ?? "No project"}
                    </span>
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT_VALUE}>
                <ProjectIcon icon={null} className="size-4" />
                No project
              </SelectItem>
              {projectList.map((project) => (
                <SelectItem key={project.id} value={String(project.id)}>
                  <ProjectIcon icon={project.icon} className="size-4" />
                  {project.name}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value={NEW_PROJECT_VALUE}>+ New project</SelectItem>
            </SelectContent>
          </Select>

          {creatingProject && (
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
                }}
              >
                Cancel
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
