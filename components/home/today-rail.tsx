import Link from "next/link";
import { Check, ListTodo, Square, SquareCheck } from "lucide-react";
import type { Note, Project, Task } from "@/lib/api";
import type { HomeTaskGroup } from "@/lib/home-model";
import { formatDuration } from "@/lib/date";
import { ProjectIcon, NoProjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { LinkifiedText } from "@/components/linkified-text";
import { LongContentFade } from "@/components/long-content-fade";
import { TaskCreatorPopover } from "@/components/task-creator-popover";
import { Skeleton } from "@/components/ui/skeleton";

type TodayRailProps = {
  exiting: boolean;
  loaded: boolean;
  isRunning: boolean;
  refreshingActive: boolean;
  todayKey: string;
  trackedSeconds: number;
  groups: HomeTaskGroup[];
  todayTasks: Task[];
  todayNote?: Note;
  projects: Project[];
  projectId: number | null;
  selectedTaskIds: number[];
  backlogSuggestions: Task[];
  onProjectSelect: (projectId: number | null) => void;
  onTaskSelect: (task: Task, selected: boolean) => void;
  onTaskCreated: (task: Task) => void;
};

export function TodayRail({
  exiting,
  loaded,
  isRunning,
  refreshingActive,
  todayKey,
  trackedSeconds,
  groups,
  todayTasks,
  todayNote,
  projects,
  projectId,
  selectedTaskIds,
  backlogSuggestions,
  onProjectSelect,
  onTaskSelect,
  onTaskCreated,
}: TodayRailProps) {
  return (
    <aside className={`${exiting ? "animate-out fade-out slide-out-to-left-2 animation-duration-250 fill-mode-forwards" : "animate-in fade-in slide-in-from-left-2 animation-duration-500 fill-mode-both"} order-2 flex h-[min(32rem,calc(100vh-8rem))] min-h-0 flex-col space-y-3 overflow-hidden motion-reduce:transition-none lg:order-1 lg:h-full lg:max-h-[32rem]`}>
      <div className="flex items-center justify-between px-1">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <ListTodo className="size-3.5" /> Today
        </div>
        {trackedSeconds > 0 && <span className="text-muted-foreground font-mono text-xs">{formatDuration(trackedSeconds)}</span>}
      </div>
      <div className="min-h-0 flex-1">
        <LongContentFade wrapperClassName="h-full" fadeColor="from-background" className="h-full space-y-3 overflow-y-auto px-1">
          {!loaded && (
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {loaded && groups.map(({ project, tasks }) => (
            <div key={project?.id ?? "none"} className="-mx-1 flex w-[calc(100%+0.5rem)] flex-col gap-1 rounded px-1 py-0.5">
              <button
                type="button"
                disabled={isRunning || refreshingActive}
                onClick={() => onProjectSelect(project?.id ?? null)}
                className="text-muted-foreground/80 hover:text-foreground flex items-center gap-1.5 rounded text-left text-xs transition-colors duration-150 disabled:cursor-default"
              >
                {project ? <ProjectIcon icon={project.icon} className="size-3" /> : <NoProjectIcon className="size-3" />}
                <span className="truncate" title={project?.path}>{project?.name ?? "No project"}</span>
              </button>
              {tasks.map((task) => {
                const completed = task.completed_at !== null;
                const selected = !completed && selectedTaskIds.includes(task.id);
                return (
                  <div key={task.id} className="rounded py-0.5 text-sm">
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onTaskSelect(task, selected)}
                      className={cn(
                        "flex w-full items-start gap-1.5 rounded text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        selected && "bg-primary/10",
                      )}
                    >
                      {completed ? <SquareCheck className="text-muted-foreground/50 mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : <Square className="text-muted-foreground/40 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn("break-words", completed ? "text-muted-foreground/70 line-through" : selected ? "text-primary" : "text-foreground/90")}>
                          {task.title}{completed && <span className="sr-only"> (done)</span>}
                        </span>
                      </span>
                      {selected && <Check className="text-primary mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
                    </button>
                    {task.description && (
                      <div className="ml-5 max-h-20 overflow-y-auto pr-0.5">
                        <LinkifiedText text={task.description} className="text-muted-foreground text-xs leading-relaxed" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {loaded && todayTasks.length === 0 && <p className="text-muted-foreground text-sm">Nothing planned for today.</p>}
          {loaded && (
            <TaskCreatorPopover
              periodStart={todayKey}
              projects={projects}
              defaultProjectId={projectId}
              backlogSuggestions={backlogSuggestions}
              onCreated={onTaskCreated}
              trigger="chip"
            />
          )}
        </LongContentFade>
      </div>
      {loaded && todayNote?.content && (
        <div className="max-h-24 overflow-y-auto border-t px-1 pt-2 pr-1.5">
          <LinkifiedText text={todayNote.content} as="p" className="text-muted-foreground text-xs" />
        </div>
      )}
      <Link href={`/app/calendar/${todayKey}`} className="text-primary block px-1 pt-1 text-xs font-medium hover:underline">
        Open today in Calendar →
      </Link>
    </aside>
  );
}
