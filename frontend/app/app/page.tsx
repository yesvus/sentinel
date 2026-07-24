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
import { sessions, projects as projectsApi, ApiError, Project } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ProjectIcon } from "@/lib/icons";

const NEW_PROJECT_VALUE = "__new__";
const NO_PROJECT_VALUE = "__none__";

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = sessionId !== null && lastDuration === null;

  useEffect(() => {
    projectsApi.list().then(setProjectList).catch(() => {});
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
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
      setStartedAt(null);
      setElapsedMs(0);
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
    if (next.projectId !== undefined) setProjectId(next.projectId);
    if (next.description !== undefined) setDescription(next.description);

    if (sessionId === null) return;

    try {
      await sessions.update(sessionId, {
        projectId: next.projectId !== undefined ? next.projectId : projectId,
        description: next.description !== undefined ? next.description : description,
      });
    } catch {
      // best-effort save, not worth surfacing to the user mid-session
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4">
      <div className="text-center">
        <p className="text-sm font-medium">
          {greeting()}
          {user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </p>
      </div>

      <div className="flex flex-col items-center gap-5">
        <p className="font-mono text-7xl font-medium tracking-tight tabular-nums">
          {formatElapsed(elapsedMs)}
        </p>

        <Button
          size="icon"
          disabled={busy}
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
