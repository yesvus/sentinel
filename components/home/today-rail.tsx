import { useState } from "react";
import Link from "next/link";
import { ListTodo } from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Note, Project, Task } from "@/lib/api";
import { tasks as tasksApi, projects as projectsApi } from "@/lib/api";
import type { HomeTaskGroup } from "@/lib/home-model";
import { formatDuration } from "@/lib/date";
import { ProjectIcon, NoProjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { LinkifiedText } from "@/components/linkified-text";
import { LongContentFade } from "@/components/long-content-fade";
import { SortableTaskRow } from "@/components/sortable-task-row";
import { TaskCreatorPopover } from "@/components/task-creator-popover";
import { HomeTaskRow } from "@/components/home/home-task-row";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpTooltip } from "@/components/help-tooltip";

const PROJECT_DRAG_PREFIX = "project-";

function buildReorderPayload(tasks: Task[]) {
  return tasks.map((task, index) => ({ id: task.id, sort_order: index }));
}

function hasProject<T extends { project: Project | null }>(group: T): group is T & { project: Project } {
  return group.project !== null;
}

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
  onProjectUpdated: (project: Project) => void;
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
  onProjectUpdated,
}: TodayRailProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const openGroups = groups
    .map((group) => ({
      ...group,
      tasks: group.tasks
        .filter((task) => task.completed_at === null)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    }))
    .filter((group) => group.tasks.length > 0);
  const sortedOpenTasks = openGroups.flatMap((group) => group.tasks);
  const hasOpenTasks = todayTasks.some((task) => task.completed_at === null);

  async function handleTaskDragEnd(active: DragEndEvent["active"], over: NonNullable<DragEndEvent["over"]>) {
    const fromIndex = sortedOpenTasks.findIndex((t) => String(t.id) === String(active.id));
    const toIndex = sortedOpenTasks.findIndex((t) => String(t.id) === String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;

    const dragged = sortedOpenTasks[fromIndex];
    const target = sortedOpenTasks[toIndex];
    if (dragged.project_id !== target.project_id) return;

    const reordered = arrayMove(sortedOpenTasks, fromIndex, toIndex).map((task, index) => ({ ...task, sort_order: index }));
    reordered.forEach((task) => onTaskUpdated(task));

    try {
      await tasksApi.reorder(buildReorderPayload(reordered));
    } catch {
      sortedOpenTasks.forEach((task) => onTaskUpdated(task));
    }
  }

  async function handleGroupDragEnd(activeProjectId: number, overProjectId: number) {
    const realGroups = openGroups.filter(hasProject);
    const fromIndex = realGroups.findIndex((g) => g.project.id === activeProjectId);
    const toIndex = realGroups.findIndex((g) => g.project.id === overProjectId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const draggedProject = realGroups[fromIndex].project;
    const reorderedProjects = arrayMove(realGroups, fromIndex, toIndex).map((g) => g.project);

    // Reorder only among siblings sharing the dragged project's current parent, so this
    // can never re-parent a project — it only ever changes its position among siblings.
    const siblingsInNewOrder = reorderedProjects
      .filter((p) => p.parentId === draggedProject.parentId)
      .map((p, index) => ({ ...p, sortOrder: index }));
    siblingsInNewOrder.forEach((p) => onProjectUpdated(p));

    const newPosition = siblingsInNewOrder.findIndex((p) => p.id === draggedProject.id);
    try {
      await projectsApi.move(draggedProject.id, draggedProject.parentId, newPosition);
    } catch {
      realGroups
        .map((g) => g.project)
        .filter((p) => p.parentId === draggedProject.parentId)
        .forEach((p) => onProjectUpdated(p));
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveGroupId(null);
    if (!over || active.id === over.id) return;

    const activeIdStr = String(active.id);
    if (activeIdStr.startsWith(PROJECT_DRAG_PREFIX)) {
      const activeProjectId = Number(activeIdStr.slice(PROJECT_DRAG_PREFIX.length));
      const overProjectId = Number(String(over.id).slice(PROJECT_DRAG_PREFIX.length));
      await handleGroupDragEnd(activeProjectId, overProjectId);
      return;
    }

    await handleTaskDragEnd(active, over);
  }

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
          {loaded && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(event) => {
                const id = String(event.active.id);
                if (id.startsWith(PROJECT_DRAG_PREFIX)) setActiveGroupId(id);
                else setActiveId(id);
              }}
              onDragCancel={() => {
                setActiveId(null);
                setActiveGroupId(null);
              }}
              onDragEnd={(event) => void handleDragEnd(event)}
            >
              <SortableContext
                items={openGroups.filter(hasProject).map((g) => `${PROJECT_DRAG_PREFIX}${g.project.id}`)}
                strategy={verticalListSortingStrategy}
              >
              {openGroups.map(({ project, tasks }) => (
                <div key={project?.id ?? "none"} className="-mx-1 flex w-[calc(100%+0.5rem)] flex-col rounded px-1 py-0.5">
                  {project ? (
                    <SortableTaskRow
                      id={`${PROJECT_DRAG_PREFIX}${project.id}`}
                      className={cn(
                        "mb-1 cursor-grab active:cursor-grabbing",
                        activeGroupId === `${PROJECT_DRAG_PREFIX}${project.id}` && "opacity-30",
                      )}
                    >
                      <button
                        type="button"
                        disabled={isRunning || refreshingActive}
                        onClick={() => onProjectSelect(project.id, tasks)}
                        className="text-muted-foreground/80 hover:text-foreground flex items-center gap-1.5 rounded text-left text-xs transition-colors duration-150 disabled:cursor-default"
                      >
                        <ProjectIcon icon={project.icon} className="size-3" />
                        <span className="truncate" title={project.path}>{project.name}</span>
                      </button>
                    </SortableTaskRow>
                  ) : (
                    <button
                      type="button"
                      disabled={isRunning || refreshingActive}
                      onClick={() => onProjectSelect(null, tasks)}
                      className="text-muted-foreground/80 hover:text-foreground mb-1 flex items-center gap-1.5 rounded text-left text-xs transition-colors duration-150 disabled:cursor-default"
                    >
                      <NoProjectIcon className="size-3" />
                      <span className="truncate">No project</span>
                    </button>
                  )}
                  <SortableContext items={tasks.map((t) => String(t.id))} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-0">
                    {tasks.map((task) => {
                      const completed = task.completed_at !== null;
                      const selected = !completed && selectedTaskIds.includes(task.id);
                      return (
                        <SortableTaskRow
                          key={task.id}
                          id={String(task.id)}
                          className={cn("cursor-grab active:cursor-grabbing", activeId === String(task.id) && "opacity-30")}
                        >
                          <HomeTaskRow
                            task={task}
                            checked={selected}
                            mode="select"
                            selected={selected}
                            dragging={activeId !== null}
                            onCheckedChange={() => onTaskSelect(task, selected)}
                            onUpdated={onTaskUpdated}
                          />
                        </SortableTaskRow>
                      );
                    })}
                    </div>
                  </SortableContext>
                </div>
              ))}
              </SortableContext>
            </DndContext>
          )}
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
