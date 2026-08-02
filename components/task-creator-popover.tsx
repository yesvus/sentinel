"use client";

import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
import { ProjectSelector } from "@/components/project-selector";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, Project, Task, tasks as tasksApi } from "@/lib/api";

export function TaskCreatorPopover({
  periodStart,
  projects,
  defaultProjectId = null,
  projectLocked = false,
  sessionId,
  onCreated,
  trigger = "icon",
}: {
  periodStart: string | null;
  projects: Project[];
  defaultProjectId?: number | null;
  projectLocked?: boolean;
  sessionId?: number;
  onCreated: (task: Task) => void;
  trigger?: "icon" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<number | null>(defaultProjectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setTitle("");
    setDescription("");
    setProjectId(defaultProjectId);
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (busy && !nextOpen) return;
    if (nextOpen) resetForm();
    setOpen(nextOpen);
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await tasksApi.create(
        periodStart,
        title.trim(),
        projectId,
        description.trim() || null,
        sessionId,
      );
      onCreated(created);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create this task.");
    } finally {
      setBusy(false);
    }
  }

  const activeProject = projects.find((project) => project.id === defaultProjectId);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant={trigger === "icon" ? "ghost" : "outline"}
            size={trigger === "icon" ? "icon-sm" : "sm"}
            className={trigger === "icon"
              ? "text-muted-foreground -my-1"
              : "text-muted-foreground size-8 rounded-full border-dashed px-2.5"}
            aria-label="Add a task"
          />
        }
      >
        <Plus className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(28rem,calc(100vw-1.5rem))] gap-4 p-4">
        <PopoverHeader>
          <PopoverTitle>New task</PopoverTitle>
          <PopoverDescription>
            {sessionId
              ? `Add to this session${activeProject ? ` · ${activeProject.path}` : ""}.`
              : periodStart === null ? "Add to Backlog without a date." : "Add to this day."}
          </PopoverDescription>
        </PopoverHeader>
        <form className="flex flex-col gap-4" onSubmit={createTask}>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="new-task-title">Title</FieldLabel>
              <Input
                id="new-task-title"
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What needs to be done?"
                maxLength={200}
                aria-invalid={Boolean(error)}
                disabled={busy}
              />
            </Field>
            <Field>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="new-task-description">Description</FieldLabel>
                <HelpTooltip label="About task descriptions">
                  Optional · shown beneath the task in Calendar.
                </HelpTooltip>
              </div>
              <Textarea
                id="new-task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add context, acceptance criteria, or the next concrete step."
                className="min-h-28 resize-y"
                maxLength={4000}
                disabled={busy}
              />
            </Field>
            {sessionId === undefined && !projectLocked && (
              <Field>
                <FieldLabel>Project</FieldLabel>
                <ProjectSelector
                  projects={projects}
                  value={projectId}
                  onChange={setProjectId}
                  disabled={busy}
                />
              </Field>
            )}
          </FieldGroup>
          <FieldError>{error}</FieldError>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !title.trim()}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? "Adding..." : "Add task"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
