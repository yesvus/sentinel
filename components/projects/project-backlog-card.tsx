"use client";

import { useMemo, useState } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Inbox, Trash2 } from "lucide-react";
import { LinkifiedText } from "@/components/linkified-text";
import { SortableTaskRow } from "@/components/sortable-task-row";
import { TaskCreatorPopover } from "@/components/task-creator-popover";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Project, Task } from "@/lib/api";
import { tasks } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ProjectBacklogCard({ project, projects, tasks: rawTasks, deletingTaskId, onCreated, onUpdated, onDelete }: {
  project: Project;
  projects: Project[];
  tasks: Task[];
  deletingTaskId: number | null;
  onCreated: (task: Task) => void;
  onUpdated: (task: Task) => void;
  onDelete: (task: Task) => Promise<void>;
}) {
  const sorted = useMemo(() => rawTasks.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id), [rawTasks]);
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
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Inbox className="text-muted-foreground size-4" />Backlog</CardTitle>
        <CardAction>{!project.archived && <TaskCreatorPopover periodStart={null} projects={projects} defaultProjectId={project.id} projectLocked trigger="chip" onCreated={onCreated} />}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {sorted.length === 0 ? <p className="text-muted-foreground py-8 text-center text-sm">No backlog tasks for this project.</p> : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(event) => setActiveId(String(event.active.id))}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={(event) => void handleDragEnd(event)}
          >
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
              {sorted.map((task) => (
                <SortableTaskRow
                  key={task.id}
                  id={String(task.id)}
                  className={cn(
                    "flex min-w-0 items-start gap-2 rounded-lg ring-1 ring-foreground/10 p-3 duration-200",
                    deletingTaskId === task.id
                      ? "animate-out fade-out slide-out-to-right-2"
                      : "animate-in fade-in slide-in-from-bottom-1",
                    activeId === String(task.id) && "opacity-30",
                  )}
                >
                  <div className="min-w-0 flex-1"><p className="font-medium break-words">{task.title}</p>{task.description && <LinkifiedText text={task.description} as="p" className="text-muted-foreground mt-1 text-sm" />}</div>
                  <TaskEditorPopover task={task} onUpdated={onUpdated} />
                  <Button type="button" size="icon-xs" variant="ghost" aria-label={`Delete ${task.title}`} onClick={() => void onDelete(task)} disabled={deletingTaskId === task.id}><Trash2 className="text-destructive" /></Button>
                </SortableTaskRow>
              ))}
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
