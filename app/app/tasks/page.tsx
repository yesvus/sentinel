"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Inbox, Plus, RotateCcw, Trash2 } from "lucide-react";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { HelpTooltip } from "@/components/help-tooltip";
import { LinkifiedText } from "@/components/linkified-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ProjectSelector } from "@/components/project-selector";
import { ProjectIcon, NoProjectIcon } from "@/lib/icons";
import { ApiError, Project, Task, projects as projectsApi, tasks as tasksApi } from "@/lib/api";
import { dayKey } from "@/lib/date";
import { cn } from "@/lib/utils";

const NO_PROJECT_KEY = "none";

type TaskGroup = {
  key: string;
  project: Project | null;
  tasks: Task[];
};

export default function TasksPage() {
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [removingIds, setRemovingIds] = useState<number[]>([]);
  const [recentIds, setRecentIds] = useState<number[]>([]);

  useEffect(() => {
    Promise.all([tasksApi.list(), projectsApi.list()])
      .then(([tasks, projects]) => {
        setTaskList(tasks);
        setProjectList(projects);
      })
      .catch(() => setLoadError("Could not load your backlog."))
      .finally(() => setLoading(false));
  }, []);

  const today = dayKey(new Date());
  const backlogTasks = useMemo(
    () => taskList.filter((task) => task.period_start === null),
    [taskList],
  );
  const pastUndoneTasks = useMemo(
    () => taskList.filter(
      (task) => task.completed_at === null && task.period_start !== null && task.period_start < today,
    ),
    [taskList, today],
  );
  const openTaskCount = backlogTasks.filter((task) => task.completed_at === null).length;

  const groups = useMemo(() => {
    const grouped = new Map<string, TaskGroup>();
    for (const task of backlogTasks) {
      const project = projectList.find((item) => item.id === task.project_id) ?? null;
      const key = project ? String(project.id) : NO_PROJECT_KEY;
      const group = grouped.get(key) ?? { key, project, tasks: [] };
      group.tasks.push(task);
      grouped.set(key, group);
    }
    for (const group of grouped.values()) {
      group.tasks.sort((a, b) => {
        if (Boolean(a.completed_at) !== Boolean(b.completed_at)) return a.completed_at ? 1 : -1;
        return a.title.localeCompare(b.title);
      });
    }
    return Array.from(grouped.values()).sort((a, b) => {
      if (!a.project) return 1;
      if (!b.project) return -1;
      return a.project.path.localeCompare(b.project.path);
    });
  }, [backlogTasks, projectList]);

  function markRecent(ids: number[]) {
    setRecentIds(ids);
    window.setTimeout(() => setRecentIds((current) => current.filter((id) => !ids.includes(id))), 900);
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await tasksApi.create(null, title.trim(), projectId);
      setTaskList((current) => [...current, created]);
      setTitle("");
      markRecent([created.id]);
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.message : "Could not add task.");
    } finally {
      setCreating(false);
    }
  }

  async function movePastTasks() {
    setMoving(true);
    try {
      const result = await tasksApi.movePastToBacklog(today);
      const movedById = new Map(result.moved.map((task) => [task.id, task]));
      setTaskList((current) => current.map((task) => movedById.get(task.id) ?? task));
      markRecent(result.moved.map((task) => task.id));
      toast.add({
        id: `backlog-moved-${Date.now()}`,
        type: "success",
        title: `${result.moved.length} ${result.moved.length === 1 ? "task" : "tasks"} moved to backlog`,
        description: "Dates removed. Project assignments kept.",
      });
    } catch (error) {
      toast.add({
        id: `backlog-move-error-${Date.now()}`,
        type: "error",
        title: error instanceof ApiError ? error.message : "Could not move past tasks.",
      });
    } finally {
      setMoving(false);
    }
  }

  function updateTask(updated: Task) {
    setTaskList((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  async function toggleTask(task: Task) {
    setTogglingId(task.id);
    try {
      const updated = await tasksApi.update(task.id, { completed: task.completed_at === null });
      setTaskList((current) => current.map((item) => item.id === task.id ? updated : item));
    } catch {
      toast.add({
        id: `backlog-toggle-error-${task.id}`,
        type: "error",
        title: "Could not update task.",
      });
    } finally {
      setTogglingId(null);
    }
  }

  async function removeTask(task: Task) {
    setRemovingIds((current) => [...current, task.id]);
    try {
      await tasksApi.remove(task.id);
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      setTaskList((current) => current.filter((item) => item.id !== task.id));
    } catch {
      setRemovingIds((current) => current.filter((id) => id !== task.id));
      toast.add({
        id: `backlog-delete-error-${task.id}`,
        type: "error",
        title: "Could not delete task.",
      });
    }
  }

  if (loading) {
    return (
      <div className="animate-in fade-in duration-300 mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-40 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 fill-mode-both mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Tasks</h2>
            <HelpTooltip>Backlog holds every task without a date. Pull one into a day when you are ready.</HelpTooltip>
            <Badge variant="secondary">{openTaskCount} open</Badge>
          </div>
        </div>

        {pastUndoneTasks.length > 0 ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="outline" disabled={moving} />}
            >
              {moving ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
              {moving ? "Moving tasks..." : `Move past tasks (${pastUndoneTasks.length})`}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move past tasks to backlog?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the dates from {pastUndoneTasks.length} incomplete {pastUndoneTasks.length === 1 ? "task" : "tasks"} before today.
                  Project assignments stay attached so you can schedule the tasks again later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={movePastTasks}>Move to backlog</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button variant="outline" disabled>
            <RotateCcw data-icon="inline-start" />
            No past tasks
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Add to backlog
            <HelpTooltip>Create an undated task. Its project stays optional.</HelpTooltip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createTask}>
            <FieldGroup className="gap-2 sm:flex-row">
              <Field className="sm:w-56 sm:shrink-0">
                <FieldLabel className="sr-only">Project</FieldLabel>
                <ProjectSelector projects={projectList} value={projectId} onChange={setProjectId} disabled={creating} />
              </Field>
              <Field className="min-w-0 flex-1" data-invalid={Boolean(createError)}>
                <FieldLabel htmlFor="backlog-task-title" className="sr-only">Task title</FieldLabel>
                <Input
                  id="backlog-task-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Task title"
                  aria-invalid={Boolean(createError)}
                  disabled={creating}
                />
              </Field>
              <Button type="submit" disabled={creating || !title.trim()}>
                {creating ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                {creating ? "Adding..." : "Add task"}
              </Button>
            </FieldGroup>
            <FieldError className="mt-2">{createError}</FieldError>
          </form>
        </CardContent>
      </Card>

      {loadError && <p className="text-destructive text-sm" role="alert">{loadError}</p>}

      <section className="flex flex-col gap-3" aria-labelledby="backlog-heading">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-center gap-1">
            <h3 id="backlog-heading" className="font-medium">Backlog</h3>
            <HelpTooltip>Undated tasks, grouped by project.</HelpTooltip>
          </div>
          <Badge variant="outline">{backlogTasks.length} total</Badge>
        </div>
        {!loadError && groups.length === 0 ? (
          <Empty className="animate-in fade-in zoom-in-95 duration-300 min-h-72 border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
              <EmptyTitle>Your backlog is clear</EmptyTitle>
              <EmptyDescription>
                Add an undated task above, or move incomplete tasks here after their planned day passes.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid items-start gap-4 md:grid-cols-2">
          {groups.map((group, groupIndex) => {
            const activeCount = group.tasks.filter((task) => task.completed_at === null).length;
            return (
              <Card
                key={group.key}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both"
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
                  <CardAction><Badge variant="outline">{group.tasks.length}</Badge></CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  {group.tasks.map((task) => {
                    const removing = removingIds.includes(task.id);
                    const recent = recentIds.includes(task.id);
                    const completed = task.completed_at !== null;
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "group/task flex min-w-0 items-start gap-2 rounded-lg px-2 py-2 transition-[background-color,opacity,transform] duration-200 hover:bg-muted/60",
                          recent && "animate-in fade-in slide-in-from-top-2 duration-300",
                          removing && "animate-out fade-out slide-out-to-right-2 pointer-events-none duration-150 fill-mode-forwards",
                        )}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={completed}
                          onCheckedChange={() => toggleTask(task)}
                          disabled={togglingId === task.id}
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
                        <div className="flex shrink-0 gap-1 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover/task:opacity-100 sm:group-focus-within/task:opacity-100">
                          <TaskEditorPopover task={task} onUpdated={updateTask} />
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
                                  “{task.title}” will be permanently removed.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction variant="destructive" onClick={() => removeTask(task)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
          </div>
        )}
      </section>
    </div>
  );
}
