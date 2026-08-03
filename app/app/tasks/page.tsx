"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Inbox, Plus, RotateCcw, Search } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
import { BacklogGroupCard } from "@/components/tasks/backlog-group-card";
import type { BacklogTaskGroup } from "@/components/tasks/backlog-group-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
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
import { ApiError, Project, Task, projects as projectsApi, tasks as tasksApi } from "@/lib/api";
import { dayKey } from "@/lib/date";
import { removeTask as removeTaskFromList, setTaskCompletion, taskStore, upsertTask, upsertTasks } from "@/lib/task-store";
import { useAuth } from "@/lib/auth-context";

const NO_PROJECT_KEY = "none";

export default function TasksPage() {
  const { user } = useAuth();
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [, setTogglingId] = useState<number | null>(null);
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

  const today = dayKey(new Date(), user?.timezone ?? undefined);
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
    const grouped = new Map<string, BacklogTaskGroup>();
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
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedSearch) return groups;
    return groups.flatMap((group) => {
      const projectMatches = group.project
        ? [group.project.name, group.project.path].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
        : "no project".includes(normalizedSearch);
      const tasks = projectMatches
        ? group.tasks
        : group.tasks.filter((task) => [task.title, task.description ?? ""]
          .some((value) => value.toLocaleLowerCase().includes(normalizedSearch)));
      return tasks.length > 0 ? [{ ...group, tasks }] : [];
    });
  }, [groups, normalizedSearch]);
  const filteredTaskCount = filteredGroups.reduce((count, group) => count + group.tasks.length, 0);

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
      const created = await tasksApi.create(null, title.trim(), projectId, description.trim() || null);
      setTaskList((current) => upsertTask(current, created));
      setTitle("");
      setDescription("");
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
      const result = await taskStore.movePastToBacklog(today);
      setTaskList((current) => upsertTasks(current, result.moved));
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
    setTaskList((current) => upsertTask(current, updated));
  }

  async function toggleTask(task: Task) {
    setTogglingId(task.id);
    try {
      const updated = await setTaskCompletion(task);
      setTaskList((current) => upsertTask(current, updated));
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
      await taskStore.remove(task);
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      setTaskList((current) => removeTaskFromList(current, task.id));
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
            <FieldGroup className="gap-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Field className="sm:w-56 sm:shrink-0">
                  <FieldLabel className="sr-only">Project</FieldLabel>
                  <ProjectSelector
                    projects={projectList}
                    value={projectId}
                    onChange={setProjectId}
                    onProjectCreated={(project) => {
                      setProjectList((current) => [...current.filter((item) => item.id !== project.id), project]
                        .sort((a, b) => a.path.localeCompare(b.path)));
                      setProjectId(project.id);
                    }}
                    disabled={creating}
                  />
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
              </div>
              <Field>
                <FieldLabel htmlFor="backlog-task-description">Description (optional)</FieldLabel>
                <Textarea
                  id="backlog-task-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add context, acceptance criteria, or the next concrete step."
                  maxLength={4000}
                  disabled={creating}
                />
              </Field>
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
          <Badge variant="outline">
            {normalizedSearch ? `${filteredTaskCount} of ${backlogTasks.length}` : `${backlogTasks.length} total`}
          </Badge>
        </div>
        {!loadError && groups.length > 0 && (
          <div className="relative">
            <label htmlFor="backlog-search" className="sr-only">Search backlog</label>
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              id="backlog-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search tasks and projects"
              className="pl-9"
            />
          </div>
        )}
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
        ) : !loadError && normalizedSearch && filteredGroups.length === 0 ? (
          <Empty className="animate-in fade-in zoom-in-95 duration-300 min-h-56 border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Search /></EmptyMedia>
              <EmptyTitle>No matching backlog tasks</EmptyTitle>
              <EmptyDescription>
                Try another task title, description, project name, or project path.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
            {filteredGroups.map((group, groupIndex) => (
              <BacklogGroupCard
                key={group.key}
                group={group}
                groupIndex={groupIndex}
                projects={projectList}
                removingIds={removingIds}
                recentIds={recentIds}
                onCreated={(created) => {
                  setTaskList((current) => upsertTask(current, created));
                  markRecent([created.id]);
                }}
                onUpdated={updateTask}
                onToggle={toggleTask}
                onRemove={removeTask}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
