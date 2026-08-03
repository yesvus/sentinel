"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { LinkifiedText } from "@/components/linkified-text";
import { SortableTaskRow } from "@/components/sortable-task-row";
import { TaskCreatorPopover } from "@/components/task-creator-popover";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { Project, Task } from "@/lib/api";
import { tasks } from "@/lib/api";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type BacklogTaskGroup = {
  key: string;
  project: Project | null;
  tasks: Task[];
};

export function BacklogGroupCard({
  group,
  groupIndex,
  projects,
  removingIds,
  recentIds,
  onCreated,
  onUpdated,
  onToggle,
  onRemove,
}: {
  group: BacklogTaskGroup;
  groupIndex: number;
  projects: Project[];
  removingIds: number[];
  recentIds: number[];
  onCreated: (task: Task) => void;
  onUpdated: (task: Task) => void;
  onToggle: (task: Task) => void;
  onRemove: (task: Task) => void;
}) {
  const activeCount = group.tasks.filter((task) => task.completed_at === null).length;
  const sorted = group.tasks.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const taskIds = sorted.map((t) => String(t.id));
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
    const reordered = arrayMove(sorted, fromIndex, toIndex).map((t, i) => ({ ...t, sort_order: i }));
    reordered.forEach((t) => onUpdated(t));
    tasks.reorder(reordered.map((t) => ({ id: t.id, sort_order: t.sort_order }))).catch(() => {
      sorted.forEach((t) => onUpdated(t));
    });
  }

  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-2 mb-4 w-full break-inside-avoid duration-300 fill-mode-both"
      style={{ animationDelay: `${Math.min(groupIndex * 50, 200)}ms` }}
    >
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          {group.project ? <ProjectIcon icon={group.project.icon} /> : <NoProjectIcon />}
          <span className="truncate" title={group.project?.path ?? "No project"}>
            {group.project?.name ?? "No project"}
          </span>
        </CardTitle>
        <CardDescription>
          {activeCount} open{group.project?.archived ? " · Archived project" : ""}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Badge variant="outline">{group.tasks.length}</Badge>
          {!group.project?.archived && (
            <TaskCreatorPopover
              periodStart={null}
              projects={projects}
              defaultProjectId={group.project?.id ?? null}
              projectLocked
              onCreated={onCreated}
            />
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setActiveId(String(event.active.id))}
          onDragCancel={() => setActiveId(null)}
          onDragEnd={(event) => void handleDragEnd(event)}
        >
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {sorted.map((task) => {
              const removing = removingIds.includes(task.id);
              const recent = recentIds.includes(task.id);
              const completed = task.completed_at !== null;
              return (
                <SortableTaskRow
                  key={task.id}
                  id={String(task.id)}
                  className={cn(
                    "group flex min-w-0 items-start gap-2 rounded-lg px-2 py-2 transition-[background-color,opacity,transform] duration-200",
                    activeId === null && "hover:bg-muted/60",
                    activeId === String(task.id) && "opacity-30",
                    recent && "animate-in fade-in slide-in-from-top-2 duration-300",
                    removing && "animate-out fade-out slide-out-to-right-2 pointer-events-none duration-150 fill-mode-forwards",
                  )}
                >
                  <Checkbox
                    className="mt-0.5 cursor-pointer"
                    checked={completed}
                    onCheckedChange={() => onToggle(task)}
                    aria-label={completed ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cn(
                      "text-sm break-words transition-[color,opacity,text-decoration-color] duration-200",
                      completed && "text-muted-foreground line-through",
                    )}>
                      {task.title}
                    </span>
                    {task.description && (
                      <LinkifiedText text={task.description} as="p" className="text-muted-foreground line-clamp-2 text-xs leading-relaxed" />
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <TaskEditorPopover task={task} onUpdated={onUpdated} />
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={<Button variant="ghost" size="icon-xs" aria-label={`Delete ${task.title}`} className="text-destructive hover:text-destructive" />}
                      >
                        <Trash2 />
                      </AlertDialogTrigger>
                      <AlertDialogContent size="sm">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                          <AlertDialogDescription>
                            &ldquo;{task.title}&rdquo; will be permanently removed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => onRemove(task)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </SortableTaskRow>
              );
            })}
          </SortableContext>
        </DndContext>
      </CardContent>
    </Card>
  );
}
