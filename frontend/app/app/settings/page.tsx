"use client";

import { useEffect, useState, FormEvent } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { projects as projectsApi, ApiError, Project } from "@/lib/api";
import { ProjectIcon, PROJECT_ICONS, ProjectIconKey } from "@/lib/icons";

function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`text-muted-foreground flex size-7 items-center justify-center rounded-md ring-1 ${
          value === null ? "ring-primary bg-primary/10" : "ring-border"
        }`}
      >
        <ProjectIcon icon={null} className="size-4" />
      </button>
      {(Object.keys(PROJECT_ICONS) as ProjectIconKey[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex size-7 items-center justify-center rounded-md ring-1 ${
            value === key ? "ring-primary bg-primary/10" : "ring-border"
          }`}
        >
          <ProjectIcon icon={key} className="size-4" />
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingIcon, setEditingIcon] = useState<string | null>(null);
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
      const project = await projectsApi.create(newName.trim(), newIcon);
      setProjectList((list) => [...list, project].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewIcon(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function handleRename(id: number) {
    if (!editingName.trim()) return;

    try {
      await projectsApi.rename(id, editingName.trim(), editingIcon);
      setProjectList((list) =>
        list.map((p) => (p.id === id ? { ...p, name: editingName.trim(), icon: editingIcon } : p))
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
    <div className="mx-auto grid w-full max-w-5xl gap-8 md:grid-cols-[320px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="text-muted-foreground size-4" />
            New project
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleCreate}>
            <Input
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <IconPicker value={newIcon} onChange={setNewIcon} />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full">
              Add project
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="text-muted-foreground size-4" />
            Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {projectList.map((project) => (
              <li key={project.id} className="space-y-2 rounded-md ring-1 ring-foreground/10 p-2">
                {editingId === project.id ? (
                  <>
                    <div className="flex items-center gap-2">
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
                    </div>
                    <IconPicker value={editingIcon} onChange={setEditingIcon} />
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <ProjectIcon icon={project.icon} className="text-muted-foreground size-4 shrink-0" />
                    <span className="flex-1 text-sm">{project.name}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(project.id);
                        setEditingName(project.name);
                        setEditingIcon(project.icon);
                      }}
                    >
                      Rename
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(project.id)}>
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            ))}
            {projectList.length === 0 && (
              <p className="text-muted-foreground text-sm">No projects yet.</p>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
