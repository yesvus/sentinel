import { Pause, Pencil, Play, Square } from "lucide-react";
import type { Project } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ProjectSelector } from "@/components/project-selector";
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
    <div
      className={cn(
        "relative w-full max-w-sm overflow-hidden rounded-3xl border bg-card transition-shadow duration-700 ease-out",
        isRunning && "shadow-[0_0_80px_-16px_var(--primary)]"
      )}
    >
      <div className="px-6 py-6">
        <div className={cn("transition-opacity duration-200", isRunning && "opacity-50 pointer-events-none")}>
          <ProjectSelector
            projects={projects}
            value={projectId}
            onChange={onProjectChange}
            onProjectCreated={onProjectCreated}
            disabled={isRunning || refreshingActive}
          />
        </div>
      </div>
      <div className="border-t" />

      <div className="flex flex-col items-center gap-6 px-6 pt-9 pb-6">
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums sm:text-5xl md:text-6xl select-none">
          {formatElapsed(elapsedMs)}
        </p>

        <div className="flex items-center gap-4">
          {isRunning ? (
            <button
              type="button"
              onClick={onPauseToggle}
              disabled={busy}
              aria-label={isPaused ? "Resume session" : "Pause session"}
              className={cn(
                "inline-flex size-11 shrink-0 items-center justify-center rounded-full border transition-all duration-200 active:scale-95",
                isPaused
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                  : "border-border bg-background text-foreground hover:bg-muted"
              )}
            >
              {isPaused ? (
                <Play className="ml-0.5 size-4 fill-current" />
              ) : (
                <Pause className="size-4 fill-current" />
              )}
            </button>
          ) : (
            <div className="size-11 shrink-0" aria-hidden="true" />
          )}

          <button
            type="button"
            disabled={busy}
            onClick={isRunning ? onRequestStop : onStart}
            aria-label={isRunning ? "Stop session" : busy ? "Starting session" : "Start session"}
            className={cn(
              "inline-flex size-[4.5rem] shrink-0 items-center justify-center rounded-full shadow-sm transition-all duration-200 active:scale-95",
              isRunning
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/80"
            )}
          >
            {busy && !isRunning ? (
              <Spinner className="size-7" />
            ) : isRunning ? (
              <Square className="size-5 fill-current" />
            ) : (
              <Play className="ml-0.5 size-6 fill-current" />
            )}
          </button>

          {isRunning ? (
            <button
              type="button"
              onClick={onEditStart}
              aria-label="Edit start time"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-all duration-200 hover:text-foreground active:scale-95"
            >
              <Pencil className="size-4" />
            </button>
          ) : (
            <div className="size-11 shrink-0" aria-hidden="true" />
          )}
        </div>

        <div
          className={cn(
            "grid transition-all duration-300 ease-out",
            isRunning ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <p className="text-muted-foreground text-xs font-medium">
              {busy ? "Starting..." : "Tap to start focusing"}
            </p>
          </div>
        </div>

        {error && !stopOpen && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="border-t bg-muted/30 px-6 py-6">
        <div className="space-y-2">
          <Textarea
            placeholder="Include more details about your session (optional)"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            className="min-h-10 border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-0"
          />
          <p
            className={cn(
              "h-4 text-xs text-muted-foreground transition-opacity duration-200",
              descriptionStatus === "idle" ? "invisible" : "visible"
            )}
          >
            {descriptionStatus === "saving" ? "Saving..." : "Saved"}
          </p>
        </div>
      </div>
    </div>
  );
}