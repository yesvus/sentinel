import { Pause, Pencil, Play, Square } from "lucide-react";
import type { Project } from "@/lib/api";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ProjectSelector } from "@/components/project-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

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
  onDescriptionChange,
  onStart,
  onPauseToggle,
  onRequestStop,
  onEditStart,
}: TimerCardProps) {
  return (
    <Card className="w-full max-w-sm">
      <CardContent className="space-y-4">
        {!isRunning && (
          <div className="animate-in fade-in slide-in-from-top-1 space-y-1.5 pt-4 duration-300">
            <ProjectSelector projects={projects} value={projectId} onChange={onProjectChange} disabled={refreshingActive} />
          </div>
        )}
        <div className="flex flex-col items-center gap-5 border-b pt-4 pb-4">
          {isRunning && (
            <div className="animate-in fade-in slide-in-from-top-1 flex max-w-full flex-wrap items-center justify-center gap-2 duration-300">
              <div className="bg-muted/60 text-muted-foreground flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium" title={activeProject?.path ?? "No project"}>
                {activeProject ? <ProjectIcon icon={activeProject.icon} className="size-3.5 shrink-0" /> : <NoProjectIcon className="size-3.5 shrink-0" />}
                <span className="truncate">{activeProject?.path ?? "No project"}</span>
              </div>
              {isPaused && <span className="border-amber-500/30 bg-amber-500/10 text-amber-700 animate-in fade-in zoom-in-95 rounded-full border px-2.5 py-1 text-xs font-medium duration-200 dark:text-amber-300">Paused · time excluded</span>}
            </div>
          )}
          <p className="font-mono text-7xl font-medium tracking-tight tabular-nums">{formatElapsed(elapsedMs)}</p>
          <div className="flex items-center gap-3">
            {isRunning ? (
              <Button type="button" size="icon" variant="outline" className={cn("size-10 shrink-0 rounded-full transition-[color,background-color,border-color,transform] duration-150 active:scale-95", isPaused && "border-primary/40 bg-primary/10 text-primary")} aria-label={isPaused ? "Resume session" : "Pause for an interruption"} onClick={onPauseToggle} disabled={busy}>
                {isPaused ? <Play className="ml-0.5 size-4 fill-current" /> : <Pause className="size-4 fill-current" />}
              </Button>
            ) : <div className="size-10 shrink-0" aria-hidden="true" />}
            <Button size="icon" disabled={busy} onClick={isRunning ? onRequestStop : onStart} aria-label={isRunning ? "Stop session" : "Start session"} className={`size-16 shrink-0 rounded-full shadow-sm transition-colors ${isRunning ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}>
              {isRunning ? <Square className="size-5 fill-current" /> : <Play className="ml-0.5 size-6 fill-current" />}
            </Button>
            {isRunning ? (
              <Button type="button" size="icon" variant="outline" className="text-muted-foreground size-10 shrink-0 rounded-full transition-transform duration-150 active:scale-95" aria-label="Edit start time" onClick={onEditStart}>
                <Pencil className="size-3.5" />
              </Button>
            ) : <div className="size-10 shrink-0" aria-hidden="true" />}
          </div>
          {!isRunning && <p className="text-muted-foreground -mt-2 text-xs">Tap to start focusing</p>}
          {error && !stopOpen && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <div className="space-y-1">
          <Textarea placeholder="Include more details about your session (optional)" value={description} onChange={(event) => onDescriptionChange(event.target.value)} disabled={refreshingActive} />
          <p className={`text-muted-foreground h-4 text-xs ${descriptionStatus === "idle" ? "invisible" : "visible"}`}>{descriptionStatus === "saving" ? "Saving..." : "Saved"}</p>
        </div>
      </CardContent>
    </Card>
  );
}
