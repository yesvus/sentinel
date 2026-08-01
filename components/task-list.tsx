"use client";

import { useState, FormEvent } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { tasks as tasksApi, ApiError, Task } from "@/lib/api";

export function TaskList({
  scope,
  periodStart,
  tasks,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  scope: "week" | "day";
  periodStart: string;
  tasks: Task[];
  onCreated: (task: Task) => void;
  onUpdated: (task: Task) => void;
  onDeleted: (id: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await tasksApi.create(scope, periodStart, title.trim(), description.trim() || null);
      onCreated(created);
      setTitle("");
      setDescription("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add task");
    } finally {
      setBusy(false);
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
    setEditDescription(task.description ?? "");
  }

  async function saveEdit(task: Task) {
    if (!editTitle.trim()) return;
    try {
      const updated = await tasksApi.update(task.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
      });
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

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div key={task.id} className="group flex items-start gap-2 rounded-md px-1.5 py-1">
          {editingId === task.id ? (
            <div className="flex-1 space-y-2" onClick={(e) => e.stopPropagation()}>
              <Input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Details (optional, helps AI review)"
                className="min-h-14 text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" type="button" onClick={() => saveEdit(task)}>
                  Save
                </Button>
                <Button size="sm" type="button" variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
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
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${task.completed_at ? "text-muted-foreground line-through" : ""}`}>
                  {task.title}
                </p>
                {task.description && (
                  <p className="text-muted-foreground text-xs whitespace-pre-wrap">{task.description}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit task"
                  onClick={() => startEdit(task)}
                >
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

      {adding ? (
        <form className="bg-muted/40 space-y-2 rounded-md p-2" onSubmit={handleAdd}>
          <Input autoFocus placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            placeholder="Details (optional, helps AI review)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-background min-h-14 text-sm"
          />
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy}>
              {busy ? "Adding..." : "Add"}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setTitle("");
                setDescription("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
        >
          <Plus className="size-3" />
          Add task
        </button>
      )}
    </div>
  );
}
