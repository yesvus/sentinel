"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ProjectBacklogCard } from "@/components/projects/project-backlog-card";
import { ProjectDescendantsCard } from "@/components/projects/project-descendants-card";
import { ProjectEditorCard, type ProjectTextField } from "@/components/projects/project-editor-card";
import { ProjectStatsCard } from "@/components/projects/project-stats-card";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, type Project, type StudySession, type Task, projects as projectsApi, sessions as sessionsApi, tasks as tasksApi } from "@/lib/api";
import { buildProjectDetailModel } from "@/lib/project-detail-model";
import { PageHeaderActions } from "@/lib/page-header-actions-context";
import { removeTask as removeTaskFromList, upsertTask } from "@/lib/task-collections";
import { taskMutations } from "@/lib/task-mutations";
import { useActiveSession } from "@/lib/active-session-context";
import { mergeActiveSession } from "@/lib/session-list";
import { useAuth } from "@/lib/auth-context";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(params.id);
  const { activeSession, now, sessionRevision } = useActiveSession();
  const { user } = useAuth();
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [sessionList, setSessionList] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<ProjectTextField | null>(null);
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
    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.all([projectsApi.list(), tasksApi.list(), sessionsApi.list()])
        .then(([projects, tasks, sessions]) => {
          if (cancelled) return;
          setProjectList(projects);
          setTaskList(tasks);
          setSessionList(sessions);
        })
        .catch(() => { if (!cancelled) setError("Could not load this project."); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sessionRevision]);

  const canonicalSessions = mergeActiveSession(sessionList, activeSession);

  const model = useMemo(
    () => buildProjectDetailModel(projectId, projectList, taskList, canonicalSessions, now),
    [projectId, projectList, taskList, canonicalSessions, now],
  );
  const { project } = model;

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
    if (name.trim() === project.name && icon === project.icon) return;
    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      void projectsApi.rename(project.id, name.trim(), icon, project.description, project.parentId, project.resources)
        .then((updated) => {
          setProjectList((list) => list.map((item) => item.id === updated.id ? updated : item));
          setSaveStatus("saved");
        })
        .catch((caught) => {
          setError(caught instanceof ApiError ? caught.message : "Could not save this project.");
          setSaveStatus("idle");
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [icon, name, project]);

  function beginTextEdit(field: ProjectTextField) {
    if (!project || project.archived) return;
    if (editingField === "description" && field !== "description") setDescription(project.description ?? "");
    if (editingField === "resources" && field !== "resources") setResources(project.resources ?? "");
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
        project.id, name.trim() || project.name, icon,
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
      const position = projectList.filter((item) => item.id !== project.id && item.parentId === newParentId && item.pinned === project.pinned).length;
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
      await taskMutations.remove(task);
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      setTaskList((list) => removeTaskFromList(list, task.id));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not delete this task.");
    } finally {
      setDeletingTaskId(null);
    }
  }

  if (loading) return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6"><Skeleton className="h-5 w-56" /><Skeleton className="h-64 w-full rounded-xl" /><Skeleton className="h-48 w-full rounded-xl" /></div>;
  if (!project) return (
    <div className="animate-in fade-in mx-auto flex w-full max-w-3xl flex-col items-center gap-3 py-20 text-center duration-300">
      <h2 className="text-lg font-medium">Project not found</h2><p className="text-muted-foreground text-sm">It may have been deleted or belongs to another account.</p><Button render={<Link href="/app/projects" />} nativeButton={false}>Back to projects</Button>
    </div>
  );

  return (
    <div className="animate-in fade-in mx-auto flex w-full max-w-7xl flex-col gap-6 duration-500 fill-mode-both">
      <PageHeaderActions><Breadcrumb className="min-w-0"><BreadcrumbList className="flex-nowrap overflow-hidden"><BreadcrumbSeparator />
        {model.ancestors.map((ancestor) => <Fragment key={ancestor.id}><BreadcrumbItem><BreadcrumbLink className="max-w-32 truncate" render={<Link href={`/app/projects/${ancestor.id}`} />}>{ancestor.name}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /></Fragment>)}
        <BreadcrumbItem className="min-w-0"><BreadcrumbPage className="block max-w-40 truncate">{project.name}</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList></Breadcrumb></PageHeaderActions>
      {error && <p className="text-destructive animate-in fade-in slide-in-from-top-1 text-sm duration-200" role="alert">{error}</p>}
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.85fr)_minmax(14rem,0.65fr)]">
        <ProjectEditorCard
          project={project} byId={model.byId} parentCandidates={model.parentCandidates}
          name={name} description={description} resources={resources} icon={icon} editingField={editingField} saving={saving} saveStatus={saveStatus}
          onNameChange={setName} onDescriptionChange={setDescription} onResourcesChange={setResources} onIconChange={setIcon}
          onBeginTextEdit={beginTextEdit} onCancelTextEdit={cancelTextEdit} onSaveTextEdit={saveTextEdit}
          onParentChange={updateParent} onArchiveChange={updateArchive} onDelete={deleteProject}
        />
        <div className="flex min-w-0 flex-col gap-6">
          <ProjectBacklogCard
            project={project} projects={projectList} tasks={model.backlogTasks} deletingTaskId={deletingTaskId}
            onCreated={(task) => setTaskList((list) => upsertTask(list, task))}
            onUpdated={(updated) => setTaskList((list) => upsertTask(list, updated))}
            onDelete={deleteTask}
          />
          <ProjectDescendantsCard descendants={model.descendants} />
        </div>
        <ProjectStatsCard
          trackedSeconds={model.trackedSeconds} sessionCount={model.projectSessions.length}
          completedTaskCount={model.completedTaskCount} backlogCount={model.backlogTasks.length}
          lastSessionStartedAt={model.lastSession?.started_at ?? null}
          timeZone={user?.timezone ?? undefined}
        />
      </div>
    </div>
  );
}
