"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Archive, BarChart3, CalendarClock, CheckCircle2, FolderTree, Inbox, RotateCcw, Save, Timer, Trash2 } from "lucide-react";
import { ProjectIconSelectorPopover } from "@/components/project-icon-selector-popover";
import { ProjectNameEditorPopover } from "@/components/project-name-editor-popover";
import { LinkifiedText } from "@/components/linkified-text";
import { TaskCreatorPopover } from "@/components/task-creator-popover";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, Project, StudySession, Task, projects as projectsApi, sessions as sessionsApi, tasks as tasksApi } from "@/lib/api";
import { formatDuration } from "@/lib/date";
import { ProjectIcon } from "@/lib/icons";
import { canPlaceProject, orderProjectsAsTree, projectBranchIds } from "@/lib/project-tree";
import { sessionDurationSeconds } from "@/lib/session-stats";
import { PageHeaderActions } from "@/lib/page-header-actions-context";

const TOP_LEVEL_VALUE = "__top-level__";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(params.id);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [sessionList, setSessionList] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now());
  const [editingField, setEditingField] = useState<"description" | "resources" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [resources, setResources] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const hydratedProjectIdRef = useRef<number | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      Promise.all([projectsApi.list(), tasksApi.list(), sessionsApi.list()])
        .then(([projects, tasks, sessions]) => {
          setProjectList(projects);
          setTaskList(tasks);
          setSessionList(sessions);
        })
        .catch(() => setError("Could not load this project."))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const project = projectList.find((item) => item.id === projectId) ?? null;
  const byId = useMemo(() => new Map(projectList.map((item) => [item.id, item])), [projectList]);
  const ancestors = useMemo(() => {
    const items: Project[] = [];
    let cursor = project?.parentId === null ? undefined : byId.get(project?.parentId ?? -1);
    while (cursor) {
      items.unshift(cursor);
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
    return items;
  }, [byId, project]);
  const parentCandidates = project
    ? orderProjectsAsTree(projectList.filter((item) => !item.archived)).filter(
        ({ project: candidate }) => canPlaceProject(projectList.filter((item) => !item.archived), project, candidate.id),
      )
    : [];
  const backlogTasks = taskList.filter((task) => task.project_id === projectId && task.period_start === null);
  const descendantIds = project ? projectBranchIds(projectList, project.id) : new Set<number>();
  descendantIds.delete(projectId);
  const descendants = orderProjectsAsTree(projectList.filter((item) => descendantIds.has(item.id)));
  const projectSessions = sessionList.filter((session) => session.project_id === projectId);
  const trackedSeconds = projectSessions.reduce((total, session) => total + sessionDurationSeconds(session, now), 0);
  const completedTaskCount = taskList.filter((task) => task.project_id === projectId && task.completed_at !== null).length;
  const lastSession = [...projectSessions].sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;

  useEffect(() => {
    if (!project || hydratedProjectIdRef.current === project.id) return;
    setName(project.name);
    setDescription(project.description ?? "");
    setResources(project.resources ?? "");
    setIcon(project.icon);
    hydratedProjectIdRef.current = project.id;
  }, [project]);

  useEffect(() => {
    if (!project || hydratedProjectIdRef.current !== project.id || !name.trim() || project.archived) return;
    const unchanged =
      name.trim() === project.name &&
      icon === project.icon;
    if (unchanged) return;

    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      void projectsApi.rename(
        project.id,
        name.trim(),
        icon,
        project.description,
        project.parentId,
        project.resources,
      ).then((updated) => {
        setProjectList((list) => list.map((item) => item.id === updated.id ? updated : item));
        setSaveStatus("saved");
      }).catch((caught) => {
        setError(caught instanceof ApiError ? caught.message : "Could not save this project.");
        setSaveStatus("idle");
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [icon, name, project]);

  function beginTextEdit(field: "description" | "resources") {
    if (!project || project.archived) return;
    if (editingField === "description" && field !== "description") {
      setDescription(project.description ?? "");
    }
    if (editingField === "resources" && field !== "resources") {
      setResources(project.resources ?? "");
    }
    setEditingField(field);
  }

  function cancelTextEdit() {
    if (!project) return;
    if (editingField === "description") setDescription(project.description ?? "");
    if (editingField === "resources") setResources(project.resources ?? "");
    setEditingField(null);
  }

  async function saveTextEdit() {
    if (!project || !editingField) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await projectsApi.rename(
        project.id,
        name.trim() || project.name,
        icon,
        editingField === "description" ? description.trim() || null : project.description,
        project.parentId,
        editingField === "resources" ? resources.trim() || null : project.resources,
      );
      setProjectList((list) => list.map((item) => item.id === updated.id ? updated : item));
      setDescription(updated.description ?? "");
      setResources(updated.resources ?? "");
      setEditingField(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save this project.");
    } finally {
      setSaving(false);
    }
  }

  async function updateParent(newParentId: number | null) {
    if (!project || newParentId === project.parentId) return;
    setSaving(true);
    setError(null);
    try {
      const position = projectList.filter(
        (item) => item.id !== project.id && item.parentId === newParentId && item.pinned === project.pinned,
      ).length;
      await projectsApi.move(project.id, newParentId, position);
      setProjectList(await projectsApi.list());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not move this project.");
    } finally {
      setSaving(false);
    }
  }

  async function updateArchive(archived: boolean) {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      await projectsApi.updateState(project.id, { archived });
      setProjectList(await projectsApi.list());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update this project.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject() {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      await projectsApi.remove(project.id);
      router.push("/app/projects");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not delete this project.");
      setSaving(false);
    }
  }

  async function deleteTask(task: Task) {
    setDeletingTaskId(task.id);
    try {
      await tasksApi.remove(task.id);
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      setTaskList((list) => list.filter((item) => item.id !== task.id));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not delete this task.");
    } finally {
      setDeletingTaskId(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="animate-in fade-in mx-auto flex w-full max-w-3xl flex-col items-center gap-3 py-20 text-center duration-300">
        <h2 className="text-lg font-medium">Project not found</h2>
        <p className="text-muted-foreground text-sm">It may have been deleted or belongs to another account.</p>
        <Button render={<Link href="/app/projects" />} nativeButton={false}>Back to projects</Button>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in mx-auto flex w-full max-w-7xl flex-col gap-6 duration-500 fill-mode-both">
      <PageHeaderActions>
        <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap overflow-hidden">
          <BreadcrumbSeparator />
          {ancestors.map((ancestor) => (
            <Fragment key={ancestor.id}>
              <BreadcrumbItem>
                <BreadcrumbLink className="max-w-32 truncate" render={<Link href={`/app/projects/${ancestor.id}`} />}>{ancestor.name}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </Fragment>
          ))}
          <BreadcrumbItem className="min-w-0"><BreadcrumbPage className="block max-w-40 truncate">{project.name}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
        </Breadcrumb>
      </PageHeaderActions>

      {error && <p className="text-destructive animate-in fade-in slide-in-from-top-1 text-sm duration-200" role="alert">{error}</p>}

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.85fr)_minmax(14rem,0.65fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex min-w-0 items-center gap-3">
            {!project.archived ? (
              <ProjectIconSelectorPopover value={icon} onChange={setIcon} disabled={saving} />
            ) : (
              <div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-lg">
                <ProjectIcon icon={project.icon} className="size-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1">
                <CardTitle className="truncate">{name || project.name}</CardTitle>
                {!project.archived && <ProjectNameEditorPopover value={name} onChange={setName} disabled={saving} />}
              </div>
            </div>
          </div>
          <CardAction className="flex items-center gap-1">
            {project.archived ? (
              <>
                <Button size="sm" variant="outline" onClick={() => void updateArchive(false)} disabled={saving}>
                  <RotateCcw data-icon="inline-start" /> Restore
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Delete project" disabled={saving} />}>
                    <Trash2 className="text-destructive" />
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogMedia><Trash2 className="text-destructive" /></AlertDialogMedia>
                      <AlertDialogTitle>Delete {project.name} permanently?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The entire branch and its tasks will be deleted. Past sessions will become unassigned. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void deleteProject()}>Delete permanently</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Archive project" disabled={saving} />}>
                    <Archive />
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogMedia><Archive /></AlertDialogMedia>
                      <AlertDialogTitle>Archive {project.name}?</AlertDialogTitle>
                      <AlertDialogDescription>This project and its descendants will leave active selectors.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void updateArchive(true)}>Archive branch</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-5">
            <Field>
              <FieldLabel htmlFor="project-parent">Parent project</FieldLabel>
              <Select
                value={project.parentId !== null ? String(project.parentId) : TOP_LEVEL_VALUE}
                onValueChange={(value) => void updateParent(value === TOP_LEVEL_VALUE ? null : Number(value))}
                disabled={project.archived || saving}
              >
                <SelectTrigger id="project-parent" className="w-full">
                  <SelectValue>
                    {(value: string) => {
                      if (value === TOP_LEVEL_VALUE) return "Top level";
                      const parent = byId.get(Number(value));
                      return parent ? (
                        <span className="flex items-center gap-2">
                          <ProjectIcon icon={parent.icon} className="size-4" />
                          {parent.name}
                        </span>
                      ) : "Top level";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TOP_LEVEL_VALUE}>Top level</SelectItem>
                  {parentCandidates.map(({ project: candidate, treeDepth }) => (
                    <SelectItem key={candidate.id} value={String(candidate.id)}>
                      {treeDepth > 0 && <span className="text-border" aria-hidden="true">└</span>}
                      <ProjectIcon icon={candidate.icon} className="size-4" />
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Separator />
            <Field>
              <FieldLabel htmlFor="project-description">Description</FieldLabel>
              {editingField === "description" && !project.archived ? (
                <>
                  <Textarea
                    id="project-description"
                    autoFocus
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="animate-in fade-in min-h-64 resize-y duration-150"
                    maxLength={4000}
                    disabled={saving}
                  />
                  <div className="animate-in fade-in slide-in-from-top-1 mt-2 flex justify-end gap-2 duration-150">
                    <Button type="button" variant="ghost" size="sm" onClick={cancelTextEdit} disabled={saving}>Cancel</Button>
                    <Button type="button" size="sm" onClick={() => void saveTextEdit()} disabled={saving}>
                      <Save data-icon="inline-start" />{saving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </>
              ) : (
                <div
                  data-testid="project-description-surface"
                  role={project.archived ? undefined : "button"}
                  tabIndex={project.archived ? undefined : 0}
                  onClick={() => beginTextEdit("description")}
                  onKeyDown={(event) => {
                    if ((event.target as HTMLElement).closest("a")) return;
                    if (!project.archived && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      beginTextEdit("description");
                    }
                  }}
                  className="hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 min-h-52 cursor-text rounded-lg border border-transparent p-3 outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-3"
                >
                  <LinkifiedText text={description || "Add description"} as="p" className="text-muted-foreground text-sm leading-6" />
                </div>
              )}
            </Field>
            <Separator />
            <Field>
              <FieldLabel htmlFor="project-resources">Resources</FieldLabel>
              {editingField === "resources" && !project.archived ? (
                <>
                  <Textarea
                    id="project-resources"
                    autoFocus
                    value={resources}
                    onChange={(event) => setResources(event.target.value)}
                    className="animate-in fade-in min-h-48 resize-y font-mono text-sm duration-150"
                    maxLength={10000}
                    disabled={saving}
                  />
                  <div className="animate-in fade-in slide-in-from-top-1 mt-2 flex justify-end gap-2 duration-150">
                    <Button type="button" variant="ghost" size="sm" onClick={cancelTextEdit} disabled={saving}>Cancel</Button>
                    <Button type="button" size="sm" onClick={() => void saveTextEdit()} disabled={saving}>
                      <Save data-icon="inline-start" />{saving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </>
              ) : (
                <div
                  data-testid="project-resources-surface"
                  role={project.archived ? undefined : "button"}
                  tabIndex={project.archived ? undefined : 0}
                  onClick={() => beginTextEdit("resources")}
                  onKeyDown={(event) => {
                    if ((event.target as HTMLElement).closest("a")) return;
                    if (!project.archived && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      beginTextEdit("resources");
                    }
                  }}
                  className="hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 min-h-36 cursor-text rounded-lg border border-transparent p-3 outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-3"
                >
                  <LinkifiedText text={resources || "Add resources"} as="p" className="text-muted-foreground font-mono text-sm leading-6" />
                </div>
              )}
            </Field>
            <p className={saveStatus === "idle" ? "invisible h-4 text-xs" : "text-muted-foreground h-4 text-right text-xs"} aria-live="polite">
              {saveStatus === "saving" ? "Saving…" : "Saved"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-col gap-6">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Inbox className="text-muted-foreground size-4" />Backlog</CardTitle>
            <CardAction>
              {!project.archived && (
                <TaskCreatorPopover
                  periodStart={null}
                  projects={projectList}
                  defaultProjectId={project.id}
                  projectLocked
                  trigger="chip"
                  onCreated={(task) => setTaskList((list) => [...list, task])}
                />
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {backlogTasks.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No backlog tasks for this project.</p>
            ) : backlogTasks.map((task) => (
              <div
                key={task.id}
                className={deletingTaskId === task.id
                  ? "animate-out fade-out slide-out-to-right-2 flex min-w-0 items-start gap-2 rounded-lg p-3 ring-1 ring-foreground/10 duration-200"
                  : "animate-in fade-in slide-in-from-bottom-1 flex min-w-0 items-start gap-2 rounded-lg p-3 ring-1 ring-foreground/10 duration-200"}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{task.title}</p>
                  {task.description && <LinkifiedText text={task.description} as="p" className="text-muted-foreground mt-1 text-sm" />}
                </div>
                <TaskEditorPopover
                  task={task}
                  onUpdated={(updated) => setTaskList((list) => list.map((item) => item.id === updated.id ? updated : item))}
                />
                <Button type="button" size="icon-xs" variant="ghost" aria-label={`Delete ${task.title}`} onClick={() => void deleteTask(task)} disabled={deletingTaskId === task.id}>
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FolderTree className="text-muted-foreground size-4" />Below this project</CardTitle>
            <CardDescription>{descendants.length} nested project{descendants.length === 1 ? "" : "s"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {descendants.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No child projects.</p>
            ) : descendants.map(({ project: child, treeDepth }) => (
              <Link
                key={child.id}
                href={`/app/projects/${child.id}`}
                className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors duration-150 hover:bg-accent"
                style={{ paddingInlineStart: `${0.5 + treeDepth * 1.15}rem` }}
              >
                {treeDepth > 0 && <span className="text-border" aria-hidden="true">└</span>}
                <ProjectIcon icon={child.icon} className="size-4 shrink-0" />
                <span className="truncate" title={child.path}>{child.name}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="text-muted-foreground size-4" />Project stats</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div>
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs"><Timer className="size-3.5" />Tracked time</p>
              <p className="mt-1 font-mono text-3xl font-medium tracking-tight tabular-nums">{formatDuration(trackedSeconds)}</p>
            </div>
            <Separator />
            <dl className="flex flex-col gap-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground flex items-center gap-1.5"><CalendarClock className="size-4" />Sessions</dt>
                <dd className="font-mono tabular-nums">{projectSessions.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="size-4" />Completed tasks</dt>
                <dd className="font-mono tabular-nums">{completedTaskCount}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground flex items-center gap-1.5"><Inbox className="size-4" />Backlog</dt>
                <dd className="font-mono tabular-nums">{backlogTasks.length}</dd>
              </div>
            </dl>
            <Separator />
            <div>
              <p className="text-muted-foreground text-xs">Last worked on</p>
              <p className="mt-1 text-sm font-medium">
                {lastSession
                  ? new Date(lastSession.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                  : "No sessions yet"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
