"use client";

import { useState, FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectSelector } from "@/components/project-selector";
import { ProjectIcon } from "@/lib/icons";
import { tasks as tasksApi, projects as projectsApi, ApiError, Task, Project } from "@/lib/api";

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);

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

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setCreatingBusy(true);
    setError(null);
    try {
      const created = await projectsApi.create(newProjectName.trim());
      onProjectCreated(created);
      setAddProjectId(created.id);
      setNewProjectName("");
      setCreatingProject(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create project");
    } finally {
      setCreatingBusy(false);
    }
  }

  async function scheduleFromBacklog(task: Task) {
    try {
      const updated = await tasksApi.update(task.id, { periodStart });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't schedule task");
    }
  }

  async function toggle(task: Task) {
    try {
      const updated = await tasksApi.update(task.id, { completed: task.completed_at === null });
      onUpdated(updated);
    } catch {
      // best-effort toggle, not worth surfacing an error for
    }
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditTitle(task.title);
  }

  async function saveEdit(task: Task) {
    if (!editTitle.trim()) return;
    try {
      const updated = await tasksApi.update(task.id, { title: editTitle.trim() });
      onUpdated(updated);
      setEditingId(null);
    } catch {
      // leave the row in edit mode so the user can retry
    }
  }

  async function remove(id: number) {
    try {
      await tasksApi.remove(id);
      onDeleted(id);
    } catch {
      // best-effort; leave the task in place if the delete failed
    }
  }

  const groups = new Map<string, { project: Project | null; tasks: Task[] }>();
  for (const task of tasks) {
    const project = projects.find((p) => p.id === task.project_id) ?? null;
    const key = project ? String(project.id) : NO_PROJECT_KEY;
    if (!groups.has(key)) groups.set(key, { project, tasks: [] });
    groups.get(key)!.tasks.push(task);
  }
  const orderedGroups = Array.from(groups.values()).sort((a, b) => {
    if (!a.project) return 1;
    if (!b.project) return -1;
    return a.project.path.localeCompare(b.project.path);
  });

  return (
    <div className="space-y-4">
      {creatingProject ? (
        <form className="bg-muted/40 flex gap-2 rounded-md p-2" onSubmit={handleCreateProject}>
          <Input
            autoFocus
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="New project name"
            className="min-w-0 flex-1"
          />
          <Button type="submit" size="sm" disabled={creatingBusy}>
            {creatingBusy ? "Adding..." : "Add"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreatingProject(false);
              setNewProjectName("");
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <form className="flex gap-2" onSubmit={handleAdd}>
          <div className="w-32 shrink-0 sm:w-36">
            <ProjectSelector
              projects={projects}
              value={addProjectId}
              onChange={setAddProjectId}
              onCreate={() => setCreatingProject(true)}
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
      )}
      {!creatingProject && addProjectId !== null && (() => {
        const suggestions = backlogTasks.filter((task) => task.project_id === addProjectId);
        if (!suggestions.length) return null;
        return (
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Suggested from project</p>
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
              <ProjectIcon icon={project?.icon ?? null} className="size-3.5 shrink-0" />
              <span className="truncate">{project?.path ?? "No project"}</span>
            </div>
            <div className="space-y-1 pl-1">
              {groupTasks.map((task) => (
                <div key={task.id} className="group flex items-start gap-2 rounded-md px-1.5 py-1">
                  {editingId === task.id ? (
                    <div className="flex flex-1 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="flex-1" />
                      <Button size="sm" type="button" onClick={() => saveEdit(task)}>
                        Save
                      </Button>
                      <Button size="sm" type="button" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="checkbox"
                        checked={task.completed_at !== null}
                        onChange={() => toggle(task)}
                        className="accent-primary mt-0.5 size-4 shrink-0"
                        aria-label={`Mark "${task.title}" done`}
                      />
                      <span className={`min-w-0 flex-1 text-sm break-words ${task.completed_at ? "text-muted-foreground line-through" : ""}`}>
                        {task.title}
                      </span>
                      <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                        <Button variant="ghost" size="icon-sm" aria-label="Edit task" onClick={() => startEdit(task)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          aria-label="Delete task"
                          onClick={() => remove(task.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
