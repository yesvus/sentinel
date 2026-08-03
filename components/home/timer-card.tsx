import { Pause, Pencil, Play, Square } from "lucide-react";
import type { Project } from "@/lib/api";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ProjectSelector } from "@/components/project-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

type TimerCardProps = {
  isRunning: boolean;
  isPaused: boolean;
  busy: boolean;
  refreshingActive: boolean;
  elapsedMs: number;
  projects: Project[];
  projectId: number | null;
  activeProject: Project | null;
  description: string;
  descriptionStatus: "idle" | "saving" | "saved";
  error: string | null;
  stopOpen: boolean;
  onProjectChange: (projectId: number | null) => void;
  onProjectCreated: (project: Project) => void;
  onDescriptionChange: (description: string) => void;
  onStart: () => void;
  onPauseToggle: () => void;
  onRequestStop: () => void;
  onEditStart: () => void;
};

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function TimerCard({
  isRunning,
  isPaused,
  busy,
  refreshingActive,
  elapsedMs,
  projects,
  projectId,
  activeProject,
  description,
  descriptionStatus,
  error,
  stopOpen,
  onProjectChange,
  onProjectCreated,
  onDescriptionChange,
  onStart,
  onPauseToggle,
  onRequestStop,
  onEditStart,
}: TimerCardProps) {
  return (
    <Card
      className={cn(
        "w-full max-w-sm transition-shadow duration-1000",
        isRunning && "shadow-[0_0_60px_-12px_var(--primary)]"
      )}
    >
      <CardContent className="space-y-4">
        <div className={cn("transition-opacity duration-200", isRunning && "cursor-not-allowed")}>
            <ProjectSelector
              projects={projects}
              value={projectId}
              onChange={onProjectChange}
              onProjectCreated={onProjectCreated}
              disabled={isRunning || refreshingActive}
            />
          </div>
        <div className="flex flex-col items-center gap-5 border-b pt-4 pb-4">
          <p className="font-mono text-5xl font-medium tracking-tight tabular-nums sm:text-6xl md:text-7xl">{formatElapsed(elapsedMs)}</p>
          <div className="flex items-center gap-3">
            {isRunning ? (
              <Button type="button" size="icon" variant="outline" className={cn("size-10 shrink-0 rounded-full transition-[color,background-color,border-color,transform] duration-150 active:scale-95", isPaused && "border-primary/40 bg-primary/10 text-primary")} aria-label={isPaused ? "Resume session" : "Pause for an interruption"} onClick={onPauseToggle} disabled={busy}>
                {isPaused ? <Play className="ml-0.5 size-4 fill-current" /> : <Pause className="size-4 fill-current" />}
              </Button>
            ) : <div className="size-10 shrink-0" aria-hidden="true" />}
            <Button size="icon" disabled={busy} onClick={isRunning ? onRequestStop : onStart} aria-label={isRunning ? "Stop session" : busy ? "Starting session" : "Start session"} className={`size-16 shrink-0 rounded-full shadow-sm transition-[color,background-color,transform,opacity] duration-150 active:scale-95 ${isRunning ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}>
              {busy && !isRunning ? <Spinner className="size-6" /> : isRunning ? <Square className="size-5 fill-current" /> : <Play className="ml-0.5 size-6 fill-current" />}
            </Button>
            {isRunning ? (
              <Button type="button" size="icon" variant="outline" className="text-muted-foreground size-10 shrink-0 rounded-full transition-transform duration-150 active:scale-95" aria-label="Edit start time" onClick={onEditStart}>
                <Pencil className="size-3.5" />
              </Button>
            ) : <div className="size-10 shrink-0" aria-hidden="true" />}
          </div>
          <div
            className={cn(
              "grid transition-all duration-300 ease-out",
              isRunning ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <p className="text-muted-foreground text-xs">
                {busy ? "Starting..." : "Tap to start focusing"}
              </p>
            </div>
          </div>
          {error && !stopOpen && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <div className="space-y-1">
          <Textarea placeholder="Include more details about your session (optional)" value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
          <p className={`text-muted-foreground h-4 text-xs ${descriptionStatus === "idle" ? "invisible" : "visible"}`}>{descriptionStatus === "saving" ? "Saving..." : "Saved"}</p>
        </div>
      </CardContent>
    </Card>
  );
}
