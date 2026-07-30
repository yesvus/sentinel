"use client";

import { FormEvent, useEffect, useState } from "react";
import { Archive, FolderKanban, Pin, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, Project, projects as projectsApi } from "@/lib/api";
import { ProjectIcon } from "@/lib/icons";
import { ProjectIconPicker } from "@/components/project-icon-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ProjectsPage() {
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [newParentId, setNewParentId] = useState<number | null>(null);
  const [newPinned, setNewPinned] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingIcon, setEditingIcon] = useState<string | null>(null);
  const [editingParentId, setEditingParentId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => projectsApi.list().then(setProjectList).catch(() => setError("Could not load projects")), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    try {
      const project = await projectsApi.create(newName.trim(), newIcon, newDescription, newParentId, newPinned);
      setProjectList((list) => [...list, project].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewDescription("");
      setNewIcon(null);
      setNewParentId(null);
      setNewPinned(false);
      setCreateOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create project");
    }
  }

  async function save(project: Project) {
    if (!editingName.trim()) return;
    setError(null);
    try {
      const updated = await projectsApi.rename(project.id, editingName.trim(), editingIcon, editingDescription, editingParentId);
      setProjectList((list) => list.map((item) => (item.id === project.id ? updated : item)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save project");
    }
  }

  async function updateState(project: Project, details: { pinned?: boolean; archived?: boolean }) {
    try {
      await projectsApi.updateState(project.id, details);
      setProjectList(await projectsApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update project");
    }
  }

  const visibleProjects = projectList.filter((project) => showArchived || !project.archived);
  const parentOptions = projectList.filter((project) => !project.archived && project.depth < 3);
  const visibleIds = new Set(visibleProjects.map((project) => project.id));
  const childrenByParent = new Map<number | null, Project[]>();
  for (const project of visibleProjects) {
    const parentId = project.parentId !== null && visibleIds.has(project.parentId)
      ? project.parentId
      : null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(project);
    childrenByParent.set(parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.name.localeCompare(b.name));
  }
  const orderedProjects: Project[] = [];
  const appendBranch = (parentId: number | null) => {
    for (const project of childrenByParent.get(parentId) ?? []) {
      orderedProjects.push(project);
      appendBranch(project.id);
    }
  };
  appendBranch(null);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Projects</h2>
          <p className="text-muted-foreground text-sm">
            Organize work into up to three levels.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          New project
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Create a root project or place it under an existing project.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={create}>
            <Input aria-label="Project name" placeholder="Project name" value={newName} onChange={(event) => setNewName(event.target.value)} required />
            <Textarea aria-label="Project description" placeholder="What is this project for? (optional)" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} />
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Parent</span>
              <select value={newParentId ?? ""} onChange={(event) => setNewParentId(event.target.value ? Number(event.target.value) : null)} className="border-input bg-background h-9 w-full rounded-md border px-3">
                <option value="">Root project</option>
                {parentOptions.map((project) => <option key={project.id} value={project.id}>{project.path}</option>)}
              </select>
            </label>
            <ProjectIconPicker value={newIcon} onChange={setNewIcon} />
            <Button type="button" variant={newPinned ? "default" : "outline"} className="w-full" onClick={() => setNewPinned((value) => !value)} aria-pressed={newPinned}>
              <Pin />{newPinned ? "Pinned" : "Pin project"}
            </Button>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Create project</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><FolderKanban className="text-muted-foreground size-4" />Your projects</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Hide archived" : "Show archived"}</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && !createOpen && <p className="text-destructive text-sm">{error}</p>}
          {visibleProjects.length === 0 && <p className="text-muted-foreground text-sm">No projects yet.</p>}
          {orderedProjects.map((project) => {
            const parent = project.parentId === null
              ? null
              : projectList.find((item) => item.id === project.parentId) ?? null;
            const siblingCount = Math.max(
              0,
              (childrenByParent.get(project.parentId) ?? []).length - 1,
            );
            const childCount = (childrenByParent.get(project.id) ?? []).length;
            return (
            <div
              key={project.id}
              className="relative"
              style={{ marginLeft: `${(project.depth - 1) * 24}px` }}
            >
              {project.depth > 1 && (
                <span
                  aria-hidden="true"
                  className="border-muted-foreground/30 absolute -left-4 top-0 h-7 w-3 rounded-bl-md border-b border-l"
                />
              )}
              <div className="rounded-lg p-4 ring-1 ring-foreground/10">
              {editingId === project.id ? (
                <div className="space-y-3">
                  <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} aria-label="Project name" />
                  <Textarea value={editingDescription} onChange={(event) => setEditingDescription(event.target.value)} placeholder="Project description (optional)" aria-label="Project description" />
                  <select value={editingParentId ?? ""} onChange={(event) => setEditingParentId(event.target.value ? Number(event.target.value) : null)} aria-label="Parent project" className="border-input bg-background h-9 w-full rounded-md border px-3">
                    <option value="">Root project</option>
                    {parentOptions.filter((item) => item.id !== project.id).map((item) => <option key={item.id} value={item.id}>{item.path}</option>)}
                  </select>
                  <ProjectIconPicker value={editingIcon} onChange={setEditingIcon} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => save(project)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg"><ProjectIcon icon={project.icon} className="size-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{project.name}</p>
                    <p className="text-muted-foreground truncate text-xs" title={project.path}>
                      {parent ? `Under ${parent.path}` : "Root project"}
                      {siblingCount > 0 ? ` · ${siblingCount} sibling${siblingCount === 1 ? "" : "s"}` : ""}
                      {childCount > 0 ? ` · ${childCount} child project${childCount === 1 ? "" : "s"}` : ""}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Level {project.depth}{project.pinned ? " · Pinned" : ""}{project.archived ? " · Archived" : ""}
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{project.description || "No description yet."}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditingId(project.id);
                      setEditingName(project.name);
                      setEditingDescription(project.description ?? "");
                      setEditingIcon(project.icon);
                      setEditingParentId(project.parentId);
                    }}>Edit</Button>
                    {!project.archived && <Button size="icon-sm" variant="outline" aria-label={project.pinned ? "Unpin project" : "Pin project"} onClick={() => updateState(project, { pinned: !project.pinned })}><Pin /></Button>}
                    <Button size="icon-sm" variant="outline" aria-label={project.archived ? "Restore project" : "Archive project"} onClick={() => updateState(project, { archived: !project.archived })}>
                      {project.archived ? <RotateCcw /> : <Archive />}
                    </Button>
                  </div>
                </div>
              )}
              </div>
            </div>
          )})}
        </CardContent>
      </Card>
    </div>
  );
}
