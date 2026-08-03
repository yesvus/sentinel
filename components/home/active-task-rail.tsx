import { useMemo, useState } from "react";
import { ListTodo, RotateCw } from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { SessionTasksLoadStatus } from "@/hooks/use-home-tasks";
import type { Project, Task } from "@/lib/api";
import { tasks as tasksApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LongContentFade } from "@/components/long-content-fade";
import { SortableTaskRow } from "@/components/sortable-task-row";
import { TaskCreatorPopover } from "@/components/task-creator-popover";
import { Button } from "@/components/ui/button";
import { HomeTaskRow } from "@/components/home/home-task-row";
import { Skeleton } from "@/components/ui/skeleton";

function buildReorderPayload(tasks: Task[]) {
  return tasks.map((task, index) => ({ id: task.id, sort_order: index }));
}

type ActiveTaskRailProps = {
  exiting: boolean;
  tasks: Task[];
  projects: Project[];
  todayKey: string;
  projectId: number | null;
  sessionId: number | null;
  todaySuggestions: Task[];
  backlogSuggestions: Task[];
  recentTaskIds: number[];
  detachingTaskIds: number[];
  loadStatus: SessionTasksLoadStatus;
  onRetry: () => void;
  onTaskCreated: (task: Task) => void;
  onTaskUpdated: (task: Task) => void;
  onToggleTask: (task: Task) => void;
  onDetachTask: (task: Task) => void;
};

export function ActiveTaskRail({
  exiting,
  tasks,
  projects,
  todayKey,
  projectId,
  sessionId,
  todaySuggestions,
  backlogSuggestions,
  recentTaskIds,
  detachingTaskIds,
  loadStatus,
  onRetry,
  onTaskCreated,
  onTaskUpdated,
  onToggleTask,
  onDetachTask,
}: ActiveTaskRailProps) {
  const sorted = useMemo(() => tasks.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id), [tasks]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const fromIndex = sorted.findIndex((t) => String(t.id) === String(active.id));
    const toIndex = sorted.findIndex((t) => String(t.id) === String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = arrayMove(sorted, fromIndex, toIndex).map((task, index) => ({ ...task, sort_order: index }));
    reordered.forEach((task) => onTaskUpdated(task));

    try {
      await tasksApi.reorder(buildReorderPayload(reordered));
    } catch {
      sorted.forEach((task) => onTaskUpdated(task));
    }
  }

  return (
    <aside className={cn(
      exiting
        ? "animate-out fade-out slide-out-to-left-2 animation-duration-120 fill-mode-forwards"
        : "animate-in fade-in slide-in-from-left-1 animation-duration-180 fill-mode-both",
      "order-2 flex max-h-[min(32rem,calc(100vh-8rem))] min-h-0 flex-col space-y-3 overflow-hidden motion-reduce:transition-none lg:order-1",
    )}>
      <div className="flex items-center justify-between px-1">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <ListTodo className="size-3.5" /> Tasks
          {tasks.length > 0 && <span className="font-mono">{tasks.length}</span>}
        </div>
        {loadStatus === "loaded" && sessionId !== null && <TaskCreatorPopover
          periodStart={todayKey}
          projects={projects}
          defaultProjectId={projectId}
          sessionId={sessionId}
          todaySuggestions={todaySuggestions}
          backlogSuggestions={backlogSuggestions}
          onCreated={onTaskCreated}
        />}
      </div>
      <div className="min-h-0">
        <LongContentFade wrapperClassName="min-h-0 overflow-hidden" fadeColor="from-background" className="flex max-h-[min(28rem,calc(100vh-11rem))] flex-col gap-px overflow-x-hidden overflow-y-auto px-1">
          {loadStatus === "error" ? (
            <div className="animate-in fade-in flex flex-1 flex-col items-center justify-center gap-3 px-2 py-6 text-center duration-200" role="alert">
              <p className="text-sm font-medium">Could not load session tasks.</p>
              <p className="text-muted-foreground max-w-52 text-xs">Task membership is unknown until the session can be loaded.</p>
              <Button type="button" variant="outline" size="sm" onClick={onRetry}><RotateCw data-icon="inline-start" />Retry</Button>
            </div>
          ) : loadStatus === "loading" && tasks.length === 0 ? (
            <div className="animate-in fade-in flex flex-col gap-1 px-1 py-1 duration-200" role="status" aria-label="Loading session tasks">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex h-6 items-center gap-1.5">
                  <Skeleton className="size-3.5 shrink-0 rounded-sm" />
                  <Skeleton className={`h-3 ${item === 1 ? "w-2/3" : "w-4/5"}`} />
                  <Skeleton className="ml-auto size-5 shrink-0 rounded-md" />
                </div>
              ))}
            </div>
          ) : sorted.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(event) => setActiveId(String(event.active.id))}
              onDragCancel={() => setActiveId(null)}
              onDragEnd={(event) => void handleDragEnd(event)}
            >
              <SortableContext items={sorted.map((t) => String(t.id))} strategy={verticalListSortingStrategy}>
                {sorted.map((task) => (
                  <SortableTaskRow
                    key={task.id}
                    id={String(task.id)}
                    className={cn("cursor-grab active:cursor-grabbing", activeId === String(task.id) && "opacity-30")}
                  >
                    <HomeTaskRow
                      task={task}
                      checked={task.completed_at !== null}
                      recent={recentTaskIds.includes(task.id)}
                      removing={detachingTaskIds.includes(task.id)}
                      dragging={activeId !== null}
                      onCheckedChange={() => onToggleTask(task)}
                      onUpdated={onTaskUpdated}
                      onRemove={task.completed_at === null ? onDetachTask : undefined}
                    />
                  </SortableTaskRow>
                ))}
              </SortableContext>
            </DndContext>
          ) : (
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
