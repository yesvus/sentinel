import Link from "next/link";
import { ListTodo } from "lucide-react";
import type { Note, Project, Task } from "@/lib/api";
import type { HomeTaskGroup } from "@/lib/home-model";
import { formatDuration } from "@/lib/date";
import { ProjectIcon, NoProjectIcon } from "@/lib/icons";
import { LinkifiedText } from "@/components/linkified-text";
import { LongContentFade } from "@/components/long-content-fade";
import { TaskCreatorPopover } from "@/components/task-creator-popover";
import { HomeTaskRow } from "@/components/home/home-task-row";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpTooltip } from "@/components/help-tooltip";

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
  onProjectSelect: (projectId: number | null, tasks: Task[]) => void;
  onTaskSelect: (task: Task, selected: boolean) => void;
  onTaskUpdated: (task: Task) => void;
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
  onTaskUpdated,
  onTaskCreated,
}: TodayRailProps) {
  const openGroups = groups
    .map((group) => ({ ...group, tasks: group.tasks.filter((task) => task.completed_at === null) }))
    .filter((group) => group.tasks.length > 0);
  const hasOpenTasks = todayTasks.some((task) => task.completed_at === null);

  return (
    <aside className={`${exiting ? "animate-out fade-out slide-out-to-left-2 animation-duration-120 fill-mode-forwards" : "animate-in fade-in slide-in-from-left-1 animation-duration-180 fill-mode-both"} order-2 flex max-h-[min(32rem,calc(100vh-8rem))] min-h-0 flex-col space-y-3 overflow-hidden motion-reduce:transition-none lg:order-1`}>
      <div className="flex items-center justify-between px-1">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <ListTodo className="size-3.5" /> Today
          {selectedTaskIds.length > 0 && (
            <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-mono text-[10px] tracking-normal normal-case">
              {selectedTaskIds.length} selected
            </span>
          )}
          <HelpTooltip label="About session task selection">
            Select the tasks you intend to work on during the next session. Selecting a task does not mark it complete.
          </HelpTooltip>
        </div>
        <div className="flex items-center gap-1.5">
          {trackedSeconds > 0 && <span className="text-muted-foreground font-mono text-xs">{formatDuration(trackedSeconds)}</span>}
          {loaded && (
            <TaskCreatorPopover
              periodStart={todayKey}
              projects={projects}
              defaultProjectId={projectId}
              backlogSuggestions={backlogSuggestions}
              onCreated={onTaskCreated}
              trigger="icon"
            />
          )}
        </div>
      </div>
      <div className="min-h-0">
        <LongContentFade
          wrapperClassName="min-h-0"
          fadeColor="from-background"
          className={`${todayNote?.content ? "max-h-[min(17rem,calc(100vh-23rem))]" : "max-h-[min(22rem,calc(100vh-18rem))]"} space-y-3 overflow-y-auto px-1`}
        >
          {!loaded && (
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {loaded && openGroups.map(({ project, tasks }) => (
            <div key={project?.id ?? "none"} className="-mx-1 flex w-[calc(100%+0.5rem)] flex-col rounded px-1 py-0.5">
              <button
                type="button"
                disabled={isRunning || refreshingActive}
                onClick={() => onProjectSelect(project?.id ?? null, tasks)}
                className="text-muted-foreground/80 hover:text-foreground mb-1 flex items-center gap-1.5 rounded text-left text-xs transition-colors duration-150 disabled:cursor-default"
              >
                {project ? <ProjectIcon icon={project.icon} className="size-3" /> : <NoProjectIcon className="size-3" />}
                <span className="truncate" title={project?.path}>{project?.name ?? "No project"}</span>
              </button>
              <div className="flex flex-col gap-0">
              {tasks.map((task) => {
                const completed = task.completed_at !== null;
                const selected = !completed && selectedTaskIds.includes(task.id);
                return (
                  <HomeTaskRow
                    key={task.id}
                    task={task}
                    checked={selected}
                    mode="select"
                    selected={selected}
                    onCheckedChange={() => onTaskSelect(task, selected)}
                    onUpdated={onTaskUpdated}
                  />
                );
              })}
              </div>
            </div>
          ))}
          {loaded && !hasOpenTasks && <p className="text-muted-foreground text-sm">Nothing planned for today.</p>}
        </LongContentFade>
      </div>
      {loaded && todayNote?.content && (
        <div className="max-h-40 overflow-y-auto border-t px-1 pt-2 pr-1.5">
          <LinkifiedText text={todayNote.content} as="p" className="text-muted-foreground text-xs" />
        </div>
      )}
      <Link href={`/app/calendar/${todayKey}`} className="text-primary block px-1 pt-1 text-xs font-medium hover:underline">
        Open today in Calendar →
      </Link>
    </aside>
  );
}
