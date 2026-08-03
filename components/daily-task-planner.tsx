"use client";

import { useMemo, useState, FormEvent } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Inbox, Plus, Trash2 } from "lucide-react";
import { LinkifiedText } from "@/components/linkified-text";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ProjectSelector } from "@/components/project-selector";
import { ProjectIcon, NoProjectIcon } from "@/lib/icons";
import { tasks as tasksApi, ApiError, Task, Project, ReorderEntry } from "@/lib/api";
import { cn } from "@/lib/utils";
import { setTaskCompletion, taskMutations } from "@/lib/task-mutations";

const NO_PROJECT_KEY = "none";

function buildReorderPayload(tasks: Task[]): ReorderEntry[] {
  return tasks.map((task, index) => ({ id: task.id, sort_order: index }));
}

function SortableTaskRow({
  id, task, leaving, backlogBusy, onToggle, onMoveToBacklog, onUpdated, onMovedToBacklog, onDelete,
}: {
  id: string;
  task: Task;
  leaving: boolean;
  backlogBusy: boolean;
  onToggle: () => void;
  onMoveToBacklog: () => void;
  onUpdated: (task: Task) => void;
  onMovedToBacklog: (task: Task) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group hover:bg-muted/50 relative flex items-start gap-2 rounded-md px-1.5 py-1 transition-[opacity,z-index] duration-150",
        leaving && "animate-out fade-out slide-out-to-right-2 fill-mode-forwards",
        isDragging && "z-10 opacity-80 bg-popover shadow-lg ring-1 ring-foreground/10 rounded-md",
      )}
    >
      <button
        className="text-muted-foreground/40 hover:text-muted-foreground mt-0.5 shrink-0 cursor-grab active:cursor-grabbing"
        aria-label={`Drag "${task.title}" to reorder`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <Checkbox
        checked={task.completed_at !== null}
        onCheckedChange={onToggle}
        className="mt-0.5"
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
      <div className="bg-card absolute top-1 right-1 flex shrink-0 gap-1 rounded-md opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        {!task.completed_at && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Move "${task.title}" to backlog`}
            title="Move to backlog"
            disabled={backlogBusy}
            onClick={onMoveToBacklog}
          >
            {backlogBusy ? <Spinner /> : <Inbox />}
          </Button>
        )}
        <TaskEditorPopover task={task} onUpdated={onUpdated} onMovedToBacklog={onMovedToBacklog} />
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-destructive hover:text-destructive"
          aria-label="Delete task"
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

export function DailyTaskPlanner({
  periodStart, tasks, projects, backlogTasks, onCreated, onUpdated, onDeleted, onProjectCreated,
}: {
  periodStart: string;
  tasks: Task[];
  projects: Project[];
  backlogTasks: Task[];
  onCreated: (task: Task) => void;
  onUpdated: (task: Task) => void;
  onDeleted: (id: number) => void;
  onProjectCreated: (project: Project) => void;
}) {
  const [addProjectId, setAddProjectId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backlogBusyId, setBacklogBusyId] = useState<number | null>(null);
  const [leavingId, setLeavingId] = useState<number | null>(null);
  const [orderedTaskIds, setOrderedTaskIds] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleTasks = useMemo(() => {
    if (orderedTaskIds) {
      const ids = orderedTaskIds.split(",");
      const idToTask = new Map(tasks.map((t) => [String(t.id), t]));
      return ids.map((id) => idToTask.get(id)).filter(Boolean) as Task[];
    }
    return tasks.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  }, [tasks, orderedTaskIds]);

  const groups = useMemo(() => {
    const result = new Map<string, { project: Project | null; tasks: Task[] }>();
    for (const task of visibleTasks) {
      const project = projects.find((p) => p.id === task.project_id) ?? null;
      const key = project ? String(project.id) : NO_PROJECT_KEY;
      if (!result.has(key)) result.set(key, { project, tasks: [] });
      result.get(key)!.tasks.push(task);
    }
    for (const group of result.values()) {
      group.tasks.sort((a, b) => Number(a.completed_at !== null) - Number(b.completed_at !== null));
    }
    return result;
  }, [visibleTasks, projects]);

  const orderedGroups = useMemo(() =>
    Array.from(groups.values()).sort((a, b) => {
      if (!a.project) return 1;
      if (!b.project) return -1;
      return a.project.path.localeCompare(b.project.path);
    }),
  [groups]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Find which group the active task is in
    let activeGroupKey: string | undefined;
    for (const [key, group] of groups) {
      if (group.tasks.some((t) => String(t.id) === String(active.id))) {
        activeGroupKey = key;
        break;
      }
    }
    if (!activeGroupKey) return;

    const groupTasks = groups.get(activeGroupKey)?.tasks;
    if (!groupTasks) return;

    const fromIndex = groupTasks.findIndex((t) => String(t.id) === String(active.id));
    const toIndex = groupTasks.findIndex((t) => String(t.id) === String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;

    const newTasks = Array.from(groupTasks);
    newTasks.splice(fromIndex, 1);
    newTasks.splice(toIndex, 0, groupTasks[fromIndex]);

    const taskOrder = newTasks.map((t) => String(t.id));
    const allIds = orderedGroups.flatMap((g) => g.tasks.map((t) => String(t.id)));
    const groupStart = allIds.indexOf(taskOrder[0]);
    const groupEnd = groupStart + taskOrder.length;
    const before = allIds.slice(0, groupStart);
    const after = allIds.slice(groupEnd);
    const reorderedIds = [...before, ...taskOrder, ...after];

    setOrderedTaskIds(reorderedIds.join(","));

    const idToTask = new Map(visibleTasks.map((t) => [String(t.id), t]));
    const reordered = reorderedIds.map((id) => idToTask.get(id)!).filter(Boolean);

    try {
      await tasksApi.reorder(buildReorderPayload(reordered));
    } catch {
      setOrderedTaskIds(null);
    }
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
      const updated = await taskMutations.schedule(task, periodStart);
      onCreated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't schedule task");
    }
  }

  async function toggle(task: Task) {
    setError(null);
    try {
      const updated = await setTaskCompletion(task);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update task");
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      await taskMutations.remove(id);
      onDeleted(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete task");
    }
  }

  async function moveToBacklog(task: Task) {
    setBacklogBusyId(task.id);
    setError(null);
    try {
      const updated = await taskMutations.moveToBacklog(task);
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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
        <div className="space-y-3">
          {orderedGroups.map(({ project, tasks: groupTasks }) => {
            const droppableId = project ? String(project.id) : NO_PROJECT_KEY;
            return (
              <div key={droppableId} className="space-y-1">
                <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs font-medium">
                  {project ? <ProjectIcon icon={project.icon} className="size-3.5 shrink-0" /> : <NoProjectIcon className="size-3.5 shrink-0" />}
                  <span className="truncate" title={project?.path}>{project?.name ?? "No project"}</span>
                </div>
                <div className="space-y-1 pl-1">
                  {groupTasks.map((task) => (
                    <SortableTaskRow
                      key={task.id}
                      id={String(task.id)}
                      task={task}
                      leaving={leavingId === task.id}
                      backlogBusy={backlogBusyId === task.id}
                      onToggle={() => toggle(task)}
                      onMoveToBacklog={() => moveToBacklog(task)}
                      onUpdated={onUpdated}
                      onMovedToBacklog={finishMoveToBacklog}
                      onDelete={() => remove(task.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}