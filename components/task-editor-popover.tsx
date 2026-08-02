"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Inbox, Pencil, RotateCcw } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
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
import { ApiError, Task, tasks as tasksApi } from "@/lib/api";
import { parseDateKey } from "@/lib/date";

function taskTimingLabel(task: Task) {
  if (task.period_start === null) return "In backlog · no date attached.";
  return `Planned for ${parseDateKey(task.period_start).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  })}.`;
}

export function TaskEditorPopover({
  task,
  onUpdated,
  onMovedToBacklog,
  trigger = "icon",
}: {
  task: Task;
  onUpdated: (task: Task) => void | Promise<void>;
  onMovedToBacklog?: (task: Task) => void | Promise<void>;
  trigger?: "icon" | "badge";
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [periodStart, setPeriodStart] = useState(task.period_start ?? "");
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPeriodStart(task.period_start ?? "");
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if ((saving || moving) && !nextOpen) return;
    if (nextOpen) resetForm();
    setOpen(nextOpen);
  }

  async function saveTask(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await tasksApi.update(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        ...(task.completed_at === null ? { periodStart: periodStart || null } : {}),
      });
      await onUpdated(updated);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save this task.");
    } finally {
      setSaving(false);
    }
  }

  async function moveToBacklog() {
    setMoving(true);
    setError(null);
    try {
      const updated = await tasksApi.update(task.id, { periodStart: null });
      await (onMovedToBacklog ?? onUpdated)(updated);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not move this task to backlog.");
    } finally {
      setMoving(false);
    }
  }

  async function markUndone() {
    setMoving(true);
    setError(null);
    try {
      const updated = await tasksApi.update(task.id, { completed: false, periodStart: null });
      await (onMovedToBacklog ?? onUpdated)(updated);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not return this task to backlog.");
    } finally {
      setMoving(false);
    }
  }

  const busy = saving || moving;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          trigger === "badge" ? (
            <button
              type="button"
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-auto max-w-full min-w-0 items-start gap-1 overflow-hidden rounded-full border border-transparent px-2 py-1 text-left text-xs font-medium whitespace-normal outline-none transition-[background-color,transform,box-shadow] duration-150 focus-visible:ring-3 active:scale-[0.98]"
              aria-label={`Edit task ${task.title}`}
            />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Edit ${task.title}`}
            />
          )
        }
      >
        {trigger === "badge" ? (
          <>
            <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 break-words">{task.title}</span>
          </>
        ) : <Pencil />}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(28rem,calc(100vw-1.5rem))] gap-4 p-4"
      >
        <PopoverHeader>
          <PopoverTitle>Edit task</PopoverTitle>
          <PopoverDescription>{taskTimingLabel(task)}</PopoverDescription>
        </PopoverHeader>

        <form className="flex flex-col gap-4" onSubmit={saveTask}>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`task-title-${task.id}`}>Title</FieldLabel>
              <Input
                id={`task-title-${task.id}`}
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                aria-invalid={Boolean(error)}
                disabled={busy}
              />
            </Field>
            {task.completed_at === null && <Field>
              <FieldLabel htmlFor={`task-date-${task.id}`}>Date</FieldLabel>
              <Input
                id={`task-date-${task.id}`}
                type="date"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
                disabled={busy}
              />
            </Field>}
            <Field>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor={`task-description-${task.id}`}>Description</FieldLabel>
                <HelpTooltip label="About task descriptions">
                  Optional · shown beneath the task in Calendar.
                </HelpTooltip>
              </div>
              <Textarea
                id={`task-description-${task.id}`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add context, acceptance criteria, or the next concrete step."
                className="min-h-28 resize-y"
                maxLength={4000}
                disabled={busy}
              />
            </Field>
          </FieldGroup>

          <FieldError>{error}</FieldError>

          <div className="flex flex-col-reverse items-stretch justify-between gap-2 sm:flex-row sm:items-center">
            {task.completed_at !== null ? (
              <AlertDialog>
                <AlertDialogTrigger
                  render={<Button type="button" variant="outline" size="sm" disabled={busy} />}
                >
                  <RotateCcw data-icon="inline-start" />Mark undone
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia><RotateCcw /></AlertDialogMedia>
                    <AlertDialogTitle>Mark {task.title} undone?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the task from completed sessions, clears its date, and returns it to Backlog.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void markUndone()}>Move to Backlog</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : task.period_start !== null ? (
              <Button type="button" variant="outline" size="sm" onClick={moveToBacklog} disabled={busy}>
                {moving ? <Spinner data-icon="inline-start" /> : <Inbox data-icon="inline-start" />}
                {moving ? "Moving..." : "Move to backlog"}
              </Button>
            ) : <span />}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || !title.trim()}>
                {saving && <Spinner data-icon="inline-start" />}
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
