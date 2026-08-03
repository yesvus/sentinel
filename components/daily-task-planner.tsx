"use client";

import { useMemo, useState, FormEvent } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Inbox, Plus, Trash2 } from "lucide-react";
import { LinkifiedText } from "@/components/linkified-text";
import { SortableTaskRow } from "@/components/sortable-task-row";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ProjectSelector } from "@/components/project-selector";
import { ProjectIcon, NoProjectIcon } from "@/lib/icons";
import { tasks as tasksApi, projects as projectsApi, ApiError, Task, Project, ReorderEntry } from "@/lib/api";
import { cn } from "@/lib/utils";
import { setAttachedTaskCompletion, taskStore } from "@/lib/task-store";

const NO_PROJECT_KEY = "none";
const PROJECT_DRAG_PREFIX = "project-";

function buildReorderPayload(tasks: Task[]): ReorderEntry[] {
  return tasks.map((task, index) => ({ id: task.id, sort_order: index }));
}

function hasProject<T extends { project: Project | null }>(group: T): group is T & { project: Project } {
  return group.project !== null;
}

export function DailyTaskPlanner({
  periodStart, tasks, projects, backlogTasks, onCreated, onUpdated, onDeleted, onProjectCreated, onProjectUpdated,
}: {
  periodStart: string;
  tasks: Task[];
  projects: Project[];
  backlogTasks: Task[];
  onCreated: (task: Task) => void;
  onUpdated: (task: Task) => void;
  onDeleted: (id: number) => void;
  onProjectCreated: (project: Project) => void;
  onProjectUpdated: (project: Project) => void;
}) {
  const [addProjectId, setAddProjectId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backlogBusyId, setBacklogBusyId] = useState<number | null>(null);
  const [leavingId, setLeavingId] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sorted = useMemo(() => {
    return tasks.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  }, [tasks]);

  const groups = useMemo(() => {
    const result = new Map<string, { project: Project | null; tasks: Task[]; droppableId: string }>();
    for (const task of sorted) {
      const project = projects.find((p) => p.id === task.project_id) ?? null;
      const key = project ? String(project.id) : NO_PROJECT_KEY;
      if (!result.has(key)) result.set(key, { project, tasks: [], droppableId: key });
      result.get(key)!.tasks.push(task);
    }
    return result;
  }, [sorted, projects]);

  const orderedGroups = useMemo(() =>
    Array.from(groups.values()).sort((a, b) => {
      if (!a.project) return 1;
      if (!b.project) return -1;
      return a.project.sortOrder - b.project.sortOrder || a.project.path.localeCompare(b.project.path);
    }),
  [groups]);

  async function handleTaskDragEnd(active: DragEndEvent["active"], over: NonNullable<DragEndEvent["over"]>) {
    const fromIndex = sorted.findIndex((t) => String(t.id) === String(active.id));
    const toIndex = sorted.findIndex((t) => String(t.id) === String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;

    const dragged = sorted[fromIndex];
    const target = sorted[toIndex];
    if (dragged.project_id !== target.project_id) return;

    const reordered = arrayMove(sorted, fromIndex, toIndex).map((task, index) => ({ ...task, sort_order: index }));
    reordered.forEach((task) => onUpdated(task));

    try {
      await tasksApi.reorder(buildReorderPayload(reordered));
    } catch {
      sorted.forEach((task) => onUpdated(task));
    }
  }

  async function handleGroupDragEnd(activeProjectId: number, overProjectId: number) {
    const realGroups = orderedGroups.filter(hasProject);
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

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await tasksApi.create(periodStart, title.trim(), addProjectId);
      onCreated(created);
      setTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add task");
    } finally {
      setBusy(false);
    }
  }

  async function scheduleFromBacklog(task: Task) {
    try {
      const updated = await taskStore.schedule(task, periodStart);
      onCreated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't schedule task");
    }
  }

  async function toggle(task: Task) {
    setError(null);
    try {
      const updated = await setAttachedTaskCompletion(task);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update task");
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      await taskStore.remove(id);
      onDeleted(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete task");
    }
  }

  async function moveToBacklog(task: Task) {
    setBacklogBusyId(task.id);
    setError(null);
    try {
      const updated = await taskStore.moveToBacklog(task);
      setLeavingId(task.id);
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't move task to backlog");
    } finally {
      setBacklogBusyId(null);
      setLeavingId(null);
    }
  }

  async function finishMoveToBacklog(task: Task) {
    setLeavingId(task.id);
    await new Promise((resolve) => window.setTimeout(resolve, 160));
    onUpdated(task);
    setLeavingId(null);
  }

  return (
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
      <div className="space-y-4">
        <form className="flex gap-2" onSubmit={handleAdd}>
          <div className="w-32 shrink-0 sm:w-36">
            <ProjectSelector
              projects={projects}
              value={addProjectId}
              onChange={setAddProjectId}
              onProjectCreated={(project) => { onProjectCreated(project); setAddProjectId(project.id); }}
            />
          </div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" className="min-w-0 flex-1" />
          <Button type="submit" disabled={busy} size="icon" className="shrink-0" aria-label="Add task"><Plus className="size-4" /></Button>
        </form>
        {(() => {
          const suggestions = backlogTasks.filter((task) => task.project_id === addProjectId);
          if (!suggestions.length) return null;
          return (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">{addProjectId === null ? "Suggested" : "Suggested from project"}</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((task) => (
                  <button key={task.id} type="button" onClick={() => scheduleFromBacklog(task)} className="border-border text-muted-foreground hover:bg-muted/50 rounded-full border px-3 py-1 text-sm">{task.title}</button>
                ))}
              </div>
            </div>
          );
        })()}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {orderedGroups.length === 0 && <p className="text-muted-foreground text-sm">No tasks yet.</p>}
        <SortableContext
          items={orderedGroups.filter(hasProject).map((g) => `${PROJECT_DRAG_PREFIX}${g.project.id}`)}
          strategy={verticalListSortingStrategy}
        >
        <div className="space-y-3">
          {orderedGroups.map(({ project, tasks: groupTasks, droppableId }) => (
            <div key={droppableId} className="space-y-1">
              {project ? (
                <SortableTaskRow
                  id={`${PROJECT_DRAG_PREFIX}${project.id}`}
                  className={cn(
                    "text-muted-foreground -mx-1 flex min-w-0 cursor-grab items-center gap-1.5 rounded px-1 py-0.5 text-xs font-medium transition-opacity duration-150 active:cursor-grabbing",
                    activeGroupId === `${PROJECT_DRAG_PREFIX}${project.id}` && "opacity-30",
                  )}
                >
                  <ProjectIcon icon={project.icon} className="size-3.5 shrink-0" />
                  <span className="truncate" title={project.path}>{project.name}</span>
                </SortableTaskRow>
              ) : (
                <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs font-medium">
                  <NoProjectIcon className="size-3.5 shrink-0" />
                  <span className="truncate">No project</span>
                </div>
              )}
              <SortableContext items={groupTasks.map((t) => String(t.id))} strategy={verticalListSortingStrategy}>
                <div className="space-y-1 pl-1">
                  {groupTasks.map((task) => (
                    <SortableTaskRow
                      key={task.id}
                      id={String(task.id)}
                      className={cn(
                        "group relative flex items-start gap-2 rounded-md px-1.5 py-1 cursor-grab active:cursor-grabbing transition-[opacity,background-color] duration-150",
                        activeId === null && "hover:bg-muted/50",
                        activeId === String(task.id) && "opacity-30",
                        leavingId === task.id && "animate-out fade-out slide-out-to-right-2 fill-mode-forwards",
                      )}
                    >
                      <Checkbox
                        checked={task.completed_at !== null}
                        onCheckedChange={() => toggle(task)}
                        className="mt-0.5 cursor-pointer"
                        aria-label={`Mark "${task.title}" done`}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={cn(
                          "text-sm break-words transition-[color,text-decoration-color] duration-200",
                          task.completed_at && "text-muted-foreground line-through",
                        )}>
                          {task.title}
                        </span>
                        {task.description && (
                          <LinkifiedText text={task.description} as="p" className="text-muted-foreground line-clamp-2 text-xs leading-relaxed" />
                        )}
                      </div>
                      <div className={cn(
                        "bg-card absolute top-1 right-1 flex shrink-0 gap-1 rounded-md transition-opacity duration-150",
                        activeId === null
                          ? "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                          : "opacity-0",
                      )}>
                        {!task.completed_at && (
                          <Button variant="ghost" size="icon-xs" aria-label={`Move "${task.title}" to backlog`} title="Move to backlog" disabled={backlogBusyId === task.id} onClick={() => moveToBacklog(task)}>
                            {backlogBusyId === task.id ? <Spinner /> : <Inbox />}
                          </Button>
                        )}
                        <TaskEditorPopover task={task} onUpdated={onUpdated} onMovedToBacklog={finishMoveToBacklog} />
                        <Button variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive" aria-label="Delete task" onClick={() => remove(task.id)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </SortableTaskRow>
                  ))}
                </div>
              </SortableContext>
            </div>
          ))}
        </div>
        </SortableContext>
      </div>
    </DndContext>
  );
}