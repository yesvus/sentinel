"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sessions, projects as projectsApi, ApiError, Project } from "@/lib/api";

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function AppHomePage() {
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [description, setDescription] = useState("");

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
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <p className="font-mono text-6xl tabular-nums">{formatElapsed(elapsedMs)}</p>

      <Button size="lg" disabled={busy} onClick={isRunning ? handleStop : handleStart}>
        {isRunning ? "Stop" : "Start"}
      </Button>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {!isRunning && lastDuration !== null && (
        <p className="text-muted-foreground text-sm">
          Last session: {formatElapsed(lastDuration * 1000)}
        </p>
      )}

      <div className="w-full max-w-sm space-y-3">
        <Select
          value={projectId ? String(projectId) : undefined}
          onValueChange={(value) => handleDetailsChange({ projectId: Number(value) })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="No project" />
          </SelectTrigger>
          <SelectContent>
            {projectList.map((project) => (
              <SelectItem key={project.id} value={String(project.id)}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {projectList.length === 0 && (
          <p className="text-muted-foreground text-xs">
            No projects yet, add one in Settings.
          </p>
        )}

        <Textarea
          placeholder="What are you working on? (optional)"
          value={description}
          onChange={(e) => handleDetailsChange({ description: e.target.value })}
        />
      </div>
    </div>
  );
}
