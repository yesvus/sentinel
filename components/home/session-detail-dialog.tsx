import { RotateCw, Square, SquareCheck } from "lucide-react";
import type { HomeDataLoadStatus } from "@/hooks/use-home-data";
import type { StudySession, Task } from "@/lib/api";
import { formatDuration } from "@/lib/date";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { LinkifiedText } from "@/components/linkified-text";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type SessionDetailDialogProps = {
  session: StudySession | null;
  tasks: Task[];
  tasksStatus: HomeDataLoadStatus;
  onRetryTasks: () => void;
  onClose: () => void;
};

export function SessionDetailDialog({ session, tasks, tasksStatus, onRetryTasks, onClose }: SessionDetailDialogProps) {
  return (
    <Dialog open={session !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        {session && (
          <>
            <DialogHeader>
              <DialogTitle>
                {session.project_id ? <ProjectIcon icon={session.project_icon} /> : <NoProjectIcon />}
                <span className="min-w-0 truncate">{session.project_name ?? "No project"}</span>
              </DialogTitle>
              <DialogDescription>{new Date(session.started_at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Detail label="Duration"><span className="font-mono">{formatDuration(session.duration_seconds ?? 0)}</span></Detail>
              <Detail label="Started">{new Date(session.started_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Detail>
              {session.ended_at && <Detail label="Ended">{new Date(session.ended_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Detail>}
              {session.production_percentage != null && <Detail label="Learning / Producing">{100 - session.production_percentage}% / {session.production_percentage}%</Detail>}
              {tasksStatus === "loading" && <p className="text-muted-foreground animate-in fade-in text-sm duration-200" role="status">Loading tasks...</p>}
              {tasksStatus === "error" && (
                <div className="border-destructive/30 bg-destructive/5 animate-in fade-in flex items-center justify-between gap-3 rounded-md border p-3 duration-200" role="alert">
                  <p className="text-sm">Could not load this session&apos;s tasks.</p>
                  <Button type="button" variant="outline" size="sm" onClick={onRetryTasks}><RotateCw data-icon="inline-start" />Retry</Button>
                </div>
              )}
              {tasksStatus === "loaded" && tasks.length > 0 && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium">Tasks</p>
                  <div className="space-y-1">
                    {tasks.map((task) => (
                      <div key={task.id} className="flex items-start gap-1.5 text-sm">
                        {task.completed_at ? <SquareCheck className="text-muted-foreground/50 mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : <Square className="text-muted-foreground/40 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
                        <span className={`min-w-0 flex-1 break-words ${task.completed_at ? "text-muted-foreground/70 line-through" : ""}`}>
                          {task.title}{task.completed_at && <span className="sr-only"> (done)</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {session.description && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium">Notes</p>
                  <LinkifiedText text={session.description} as="p" className="text-sm" />
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{label}</span><span>{children}</span></div>;
}
