"use client";

import { FormEvent, useEffect, useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, Project, projects as projectsApi } from "@/lib/api";
import { PROJECT_ICONS, ProjectIcon, ProjectIconKey } from "@/lib/icons";

function IconPicker({ value, onChange }: { value: string | null; onChange: (icon: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Project icon">
      <button type="button" aria-label="Default folder icon" onClick={() => onChange(null)} className={`text-muted-foreground flex size-8 items-center justify-center rounded-md ring-1 ${value === null ? "ring-primary bg-primary/10" : "ring-border"}`}>
        <ProjectIcon icon={null} className="size-4" />
      </button>
      {(Object.keys(PROJECT_ICONS) as ProjectIconKey[]).map((key) => (
        <button key={key} type="button" aria-label={`${key} icon`} onClick={() => onChange(key)} className={`flex size-8 items-center justify-center rounded-md ring-1 ${value === key ? "ring-primary bg-primary/10" : "ring-border"}`}>
          <ProjectIcon icon={key} className="size-4" />
        </button>
      ))}
    </div>
  );
}

export default function ProjectsPage() {
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingIcon, setEditingIcon] = useState<string | null>(null);
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
      const project = await projectsApi.create(newName.trim(), newIcon, newDescription);
      setProjectList((list) => [...list, project].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewDescription("");
      setNewIcon(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create project");
    }
  }

  async function save(project: Project) {
    if (!editingName.trim()) return;
    setError(null);
    try {
      const updated = await projectsApi.rename(project.id, editingName.trim(), editingIcon, editingDescription);
      setProjectList((list) => list.map((item) => (item.id === project.id ? updated : item)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save project");
    }
  }

  async function remove(project: Project) {
    try {
      await projectsApi.remove(project.id);
      setProjectList((list) => list.filter((item) => item.id !== project.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete project");
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit">
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="text-muted-foreground size-4" />New project</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={create}>
            <Input aria-label="Project name" placeholder="Project name" value={newName} onChange={(event) => setNewName(event.target.value)} required />
            <Textarea aria-label="Project description" placeholder="What is this project for? (optional)" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} />
            <IconPicker value={newIcon} onChange={setNewIcon} />
            <Button type="submit" className="w-full">Add project</Button>
          </form>
          {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FolderKanban className="text-muted-foreground size-4" />Your projects</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {projectList.length === 0 && <p className="text-muted-foreground text-sm">No projects yet.</p>}
          {projectList.map((project) => (
            <div key={project.id} className="rounded-lg p-4 ring-1 ring-foreground/10">
              {editingId === project.id ? (
                <div className="space-y-3">
                  <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} aria-label="Project name" />
                  <Textarea value={editingDescription} onChange={(event) => setEditingDescription(event.target.value)} placeholder="Project description (optional)" aria-label="Project description" />
                  <IconPicker value={editingIcon} onChange={setEditingIcon} />
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
                    <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{project.description || "No description yet."}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditingId(project.id);
                      setEditingName(project.name);
                      setEditingDescription(project.description ?? "");
                      setEditingIcon(project.icon);
                    }}>Edit</Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(project)}>Delete</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
