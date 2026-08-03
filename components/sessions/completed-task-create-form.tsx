import { FormEvent, useState } from "react";
import type { Task } from "@/lib/api";
import { ApiError, tasks as tasksApi } from "@/lib/api";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export function CompletedTaskCreateForm({
  sessionId,
  projectId,
  periodStart,
  onCreated,
  onCancel,
  onError,
}: {
  sessionId: number;
  projectId: number | null;
  periodStart: string;
  onCreated: (task: Task) => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    onError(null);
    try {
      const created = await tasksApi.create(
        periodStart,
        title.trim(),
        projectId,
        description.trim() || null,
        sessionId,
        true,
      );
      onCreated(created);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Could not create this completed task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="animate-in fade-in slide-in-from-right-1 flex flex-col gap-4 p-4 duration-150" onSubmit={createTask}>
      <Field>
        <FieldLabel htmlFor={`new-session-task-title-${sessionId}`}>Title</FieldLabel>
        <Input
          id={`new-session-task-title-${sessionId}`}
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          disabled={busy}
        />
      </Field>
      <Field>
        <div className="flex items-center gap-1">
          <FieldLabel htmlFor={`new-session-task-description-${sessionId}`}>Description</FieldLabel>
          <HelpTooltip label="About task descriptions">Optional · shown beneath the task in Calendar.</HelpTooltip>
        </div>
        <Textarea
          id={`new-session-task-description-${sessionId}`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-24 resize-y"
          maxLength={4000}
          disabled={busy}
        />
      </Field>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy || !title.trim()}>
          {busy && <Spinner data-icon="inline-start" />}{busy ? "Adding…" : "Add task"}
        </Button>
      </div>
    </form>
  );
}
