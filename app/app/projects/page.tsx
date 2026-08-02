"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, FolderKanban } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
import { ProjectCreatorPopover } from "@/components/project-creator-popover";
import { ActiveProjectTree, ArchivedProjectTree } from "@/components/project-tree";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, Project, Task, projects as projectsApi, tasks as tasksApi } from "@/lib/api";
import { projectBranchIds } from "@/lib/project-tree";

function ProjectTreeSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-start gap-3 rounded-lg p-3 ring-1 ring-foreground/10">
          <Skeleton className="size-8 shrink-0" />
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectsPage() {
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      Promise.all([projectsApi.list(), tasksApi.list()])
        .then(([projects, tasks]) => {
          setProjectList(projects);
          setTaskList(tasks);
        })
        .catch(() => setError("Could not load projects."))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeProjects = projectList.filter((project) => !project.archived);
  const archivedProjects = projectList.filter((project) => project.archived);
  const backlogCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const task of taskList) {
      if (task.period_start !== null || task.project_id === null) continue;
      counts.set(task.project_id, (counts.get(task.project_id) ?? 0) + 1);
    }
    return counts;
  }, [taskList]);

  async function refreshProjects() {
    setProjectList(await projectsApi.list());
  }

  async function moveProject(project: Project, parentId: number | null, position: number) {
    const previous = projectList;
    setBusyId(project.id);
    setError(null);
    setProjectList((list) => {
      const siblings = list
        .filter((item) => item.id !== project.id && item.parentId === parentId && item.pinned === project.pinned)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      siblings.splice(Math.min(position, siblings.length), 0, { ...project, parentId });
      const orderById = new Map(siblings.map((item, index) => [item.id, index]));
      return list.map((item) => item.id === project.id
        ? { ...item, parentId, sortOrder: orderById.get(item.id) ?? item.sortOrder }
        : orderById.has(item.id) ? { ...item, sortOrder: orderById.get(item.id)! } : item);
    });
    try {
      await projectsApi.move(project.id, parentId, position);
      await refreshProjects();
    } catch (caught) {
      setProjectList(previous);
      setError(caught instanceof ApiError ? caught.message : "Could not move this project.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateState(project: Project, details: { pinned?: boolean; archived?: boolean }) {
    setBusyId(project.id);
    setError(null);
    try {
      await projectsApi.updateState(project.id, details);
      await refreshProjects();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update this project.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProject(project: Project) {
    const branchIds = projectBranchIds(projectList, project.id);
    setBusyId(project.id);
    setError(null);
    try {
      await projectsApi.remove(project.id);
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      setProjectList((list) => list.filter((item) => !branchIds.has(item.id)));
      setTaskList((list) => list.filter((task) => task.project_id === null || !branchIds.has(task.project_id)));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not delete this project.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="animate-in fade-in mx-auto flex w-full max-w-5xl flex-col gap-6 duration-500 fill-mode-both">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-1">
            <h2 className="text-xl font-semibold">Projects</h2>
            <HelpTooltip>Drag a project onto another project to make it a child. Three levels are supported.</HelpTooltip>
          </div>
        </div>
        <ProjectCreatorPopover
          onCreated={(project) => setProjectList((list) => [...list, project])}
        />
      </div>

      {error && (
        <p className="text-destructive animate-in fade-in slide-in-from-top-1 text-sm duration-200" role="alert">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="text-muted-foreground size-4" />
            Active projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <ProjectTreeSkeleton /> : activeProjects.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Create a project to begin your tree.</p>
          ) : (
            <ActiveProjectTree
              projects={activeProjects}
              backlogCounts={backlogCounts}
              busyId={busyId}
              onMove={moveProject}
              onArchive={(project) => updateState(project, { archived: true })}
              onPin={(project) => updateState(project, { pinned: !project.pinned })}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="text-muted-foreground size-4" />
            Archived
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <ProjectTreeSkeleton /> : archivedProjects.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Archived projects will appear here.</p>
          ) : (
            <ArchivedProjectTree
              projects={archivedProjects}
              backlogCounts={backlogCounts}
              busyId={busyId}
              onRestore={(project) => updateState(project, { archived: false })}
              onDelete={deleteProject}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
