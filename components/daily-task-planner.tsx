"use client";

import { useState, FormEvent } from "react";
import { Inbox, Plus, Trash2 } from "lucide-react";
import { ProjectCreatorPopover } from "@/components/project-creator-popover";
import { LinkifiedText } from "@/components/linkified-text";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ProjectSelector } from "@/components/project-selector";
import { ProjectIcon, NoProjectIcon } from "@/lib/icons";
import { tasks as tasksApi, ApiError, Task, Project } from "@/lib/api";
import { cn } from "@/lib/utils";
import { setTaskCompletion, taskMutations } from "@/lib/task-mutations";

const NO_PROJECT_KEY = "none";

export function DailyTaskPlanner({
  periodStart,
  tasks,
  projects,
  backlogTasks,
  onCreated,
  onUpdated,
  onDeleted,
  onProjectCreated,
}: {
  periodStart: string;
  tasks: Task[];
  projects: Project[];
  /** Project-scoped tasks with no date yet — suggested for one-click scheduling. */
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
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't schedule task");
    }
  }

  async function toggle(task: Task) {
    try {
      const updated = await setTaskCompletion(task);
      onUpdated(updated);
    } catch {
      // best-effort toggle, not worth surfacing an error for
    }
  }

  async function remove(id: number) {
    try {
      await taskMutations.remove(id);
      onDeleted(id);
    } catch {
      // best-effort; leave the task in place if the delete failed
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

  const groups = new Map<string, { project: Project | null; tasks: Task[] }>();
  for (const task of tasks) {
    const project = projects.find((p) => p.id === task.project_id) ?? null;
    const key = project ? String(project.id) : NO_PROJECT_KEY;
    if (!groups.has(key)) groups.set(key, { project, tasks: [] });
    groups.get(key)!.tasks.push(task);
  }
  // Open tasks first, completed ones below — tasks includes both so completed
  // work (with or without an attached session) stays visible on the day.
  for (const group of groups.values()) {
    group.tasks.sort((a, b) => Number(a.completed_at !== null) - Number(b.completed_at !== null));
  }
  const orderedGroups = Array.from(groups.values()).sort((a, b) => {
    if (!a.project) return 1;
    if (!b.project) return -1;
    return a.project.path.localeCompare(b.project.path);
  });

  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={handleAdd}>
        <div className="w-32 shrink-0 sm:w-36">
          <ProjectSelector
            projects={projects}
            value={addProjectId}
            onChange={setAddProjectId}
          />
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={busy} size="icon" className="shrink-0" aria-label="Add task">
          <Plus className="size-4" />
        </Button>
      </form>
      <ProjectCreatorPopover
        compact
        onCreated={(project) => {
          onProjectCreated(project);
          setAddProjectId(project.id);
        }}
      />
      {(() => {
        const suggestions = backlogTasks.filter((task) => task.project_id === addProjectId);
        if (!suggestions.length) return null;
        return (
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">
              {addProjectId === null ? "Suggested" : "Suggested from project"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => scheduleFromBacklog(task)}
                  className="border-border text-muted-foreground hover:bg-muted/50 rounded-full border px-3 py-1 text-sm"
                >
                  {task.title}
                </button>
              ))}
            </div>
          </div>
        );
      })()}
      {error && <p className="text-destructive text-sm">{error}</p>}

      {orderedGroups.length === 0 && (
        <p className="text-muted-foreground text-sm">No tasks yet.</p>
      )}

      <div className="space-y-3">
        {orderedGroups.map(({ project, tasks: groupTasks }) => (
          <div key={project?.id ?? NO_PROJECT_KEY} className="space-y-1">
            <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs font-medium">
              {project ? (
                <ProjectIcon icon={project.icon} className="size-3.5 shrink-0" />
              ) : (
                <NoProjectIcon className="size-3.5 shrink-0" />
              )}
              <span className="truncate" title={project?.path}>{project?.name ?? "No project"}</span>
            </div>
            <div className="space-y-1 pl-1">
              {groupTasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    "group hover:bg-muted/50 relative flex items-start gap-2 rounded-md px-1.5 py-1 transition-[background-color,opacity,transform] duration-150",
                    leavingId === task.id && "animate-out fade-out slide-out-to-right-2 fill-mode-forwards",
                  )}
                >
                  <Checkbox
                    checked={task.completed_at !== null}
                    onCheckedChange={() => toggle(task)}
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
                        disabled={backlogBusyId === task.id}
                        onClick={() => moveToBacklog(task)}
                      >
                        {backlogBusyId === task.id ? <Spinner /> : <Inbox />}
                      </Button>
                    )}
                    <TaskEditorPopover
                      task={task}
                      onUpdated={onUpdated}
                      onMovedToBacklog={finishMoveToBacklog}
                    />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive hover:text-destructive"
                      aria-label="Delete task"
                      onClick={() => remove(task.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
