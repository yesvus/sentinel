import { ListTodo, RotateCw, Trash2 } from "lucide-react";
import type { SessionTasksLoadStatus } from "@/hooks/use-home-tasks";
import type { Project, Task } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LinkifiedText } from "@/components/linkified-text";
import { LongContentFade } from "@/components/long-content-fade";
import { TaskCreatorPopover } from "@/components/task-creator-popover";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { Button } from "@/components/ui/button";

type ActiveTaskRailProps = {
  tasks: Task[];
  projects: Project[];
  todayKey: string;
  projectId: number | null;
  sessionId: number;
  todaySuggestions: Task[];
  backlogSuggestions: Task[];
  recentTaskIds: number[];
  deletingTaskIds: number[];
  loadStatus: SessionTasksLoadStatus;
  onRetry: () => void;
  onTaskCreated: (task: Task) => void;
  onTaskUpdated: (task: Task) => void;
  onToggleTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
};

export function ActiveTaskRail({
  tasks,
  projects,
  todayKey,
  projectId,
  sessionId,
  todaySuggestions,
  backlogSuggestions,
  recentTaskIds,
  deletingTaskIds,
  loadStatus,
  onRetry,
  onTaskCreated,
  onTaskUpdated,
  onToggleTask,
  onDeleteTask,
}: ActiveTaskRailProps) {
  return (
    <aside className={cn(
      "animate-in fade-in slide-in-from-left-2 animation-duration-500 fill-mode-both order-2 flex h-[min(32rem,calc(100vh-8rem))] min-h-0 flex-col space-y-3 overflow-hidden motion-reduce:transition-none lg:order-1 lg:h-full lg:max-h-[32rem]",
      (loadStatus !== "loaded" || tasks.length === 0) && "justify-center",
    )}>
      <div className="flex items-center justify-between px-1">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <ListTodo className="size-3.5" /> Tasks
          {tasks.length > 0 && <span className="font-mono">{tasks.length}</span>}
        </div>
        {loadStatus === "loaded" && <TaskCreatorPopover
          periodStart={todayKey}
          projects={projects}
          defaultProjectId={projectId}
          sessionId={sessionId}
          todaySuggestions={todaySuggestions}
          backlogSuggestions={backlogSuggestions}
          onCreated={onTaskCreated}
        />}
      </div>
      <div className={cn("min-h-0", tasks.length > 0 && "flex-1")}>
        <LongContentFade wrapperClassName="h-full" fadeColor="from-background" className="flex h-full flex-col gap-1 overflow-y-auto px-1">
          {loadStatus === "loading" ? (
            <div className="animate-in fade-in flex flex-1 items-center justify-center px-2 py-6 text-center duration-200" role="status">
              <p className="text-muted-foreground text-sm">Loading session tasks...</p>
            </div>
          ) : loadStatus === "error" ? (
            <div className="animate-in fade-in flex flex-1 flex-col items-center justify-center gap-3 px-2 py-6 text-center duration-200" role="alert">
              <p className="text-sm font-medium">Could not load session tasks.</p>
              <p className="text-muted-foreground max-w-52 text-xs">Task membership is unknown until the session can be loaded.</p>
              <Button type="button" variant="outline" size="sm" onClick={onRetry}><RotateCw data-icon="inline-start" />Retry</Button>
            </div>
          ) : tasks.length > 0 ? tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                "group/task flex min-w-0 items-start gap-1 rounded-md px-1 py-0.5 transition-[background-color,opacity,transform] duration-150 hover:bg-muted/50",
                recentTaskIds.includes(task.id) && "animate-in fade-in slide-in-from-top-1 duration-300",
                deletingTaskIds.includes(task.id) && "animate-out fade-out slide-out-to-right-2 pointer-events-none fill-mode-forwards",
              )}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" checked={task.completed_at !== null} onChange={() => onToggleTask(task)} className="accent-primary mt-0.5 size-4 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={task.completed_at ? "text-muted-foreground line-through" : ""}>{task.title}</span>
                  {task.description && (
                    <div className="mt-0.5 max-h-16 overflow-y-auto pr-0.5">
                      <LinkifiedText text={task.description} className="text-muted-foreground text-xs leading-relaxed" />
                    </div>
                  )}
                </span>
              </label>
              <div className="flex gap-0.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover/task:opacity-100 sm:group-focus-within/task:opacity-100">
                <TaskEditorPopover task={task} onUpdated={onTaskUpdated} />
                <Button type="button" variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive" aria-label={`Delete ${task.title}`} onClick={() => onDeleteTask(task)} disabled={deletingTaskIds.includes(task.id)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          )) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 py-2 text-center">
              <span className="bg-muted/60 border-border/60 flex size-10 items-center justify-center rounded-full border border-dashed">
                <ListTodo className="text-muted-foreground size-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium">Select tasks to work on first</p>
              <p className="text-muted-foreground max-w-52 text-xs leading-relaxed">Pick today&apos;s tasks before starting the session, or add them mid-session with the + button above.</p>
            </div>
          )}
        </LongContentFade>
      </div>
    </aside>
  );
}
