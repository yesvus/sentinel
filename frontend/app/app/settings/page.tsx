"use client";

import { useEffect, useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { projects as projectsApi, ApiError, Project } from "@/lib/api";

export default function SettingsPage() {
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loadProjects() {
    projectsApi.list().then(setProjectList).catch(() => {});
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newName.trim()) return;

    try {
      const project = await projectsApi.create(newName.trim());
      setProjectList((list) => [...list, project].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function handleRename(id: number) {
    if (!editingName.trim()) return;

    try {
      await projectsApi.rename(id, editingName.trim());
      setProjectList((list) =>
        list.map((p) => (p.id === id ? { ...p, name: editingName.trim() } : p))
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function handleDelete(id: number) {
    try {
      await projectsApi.remove(id);
      setProjectList((list) => list.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6 py-8">
      <div>
        <h1 className="text-lg font-medium">Projects</h1>
        <p className="text-muted-foreground text-sm">Manage the projects you can tag sessions with.</p>
      </div>

      <form className="flex gap-2" onSubmit={handleCreate}>
        <Input
          placeholder="New project name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit">Add</Button>
      </form>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <ul className="space-y-2">
        {projectList.map((project) => (
          <li key={project.id} className="flex items-center gap-2 rounded-md border p-2">
            {editingId === project.id ? (
              <>
                <Input
                  className="flex-1"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  autoFocus
                />
                <Button size="sm" onClick={() => handleRename(project.id)}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{project.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(project.id);
                    setEditingName(project.name);
                  }}
                >
                  Rename
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(project.id)}>
                  Delete
                </Button>
              </>
            )}
          </li>
        ))}
        {projectList.length === 0 && (
          <p className="text-muted-foreground text-sm">No projects yet.</p>
        )}
      </ul>
    </div>
  );
}
