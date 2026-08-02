"use client";

import { FormEvent, useState } from "react";
import { Check, Pencil, Plus } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { LinkifiedText } from "@/components/linkified-text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ApiError, StudySession, Task, sessions as sessionsApi, tasks as tasksApi } from "@/lib/api";
import { formatTime } from "@/lib/date";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { useActiveSession } from "@/lib/active-session-context";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SessionEditorDialog({
  session,
  tasks,
  availableTasks,
  onUpdated,
  onTaskUpdated,
  onTasksChanged,
  onTaskCreated,
}: {
  session: StudySession;
  tasks: Task[];
  availableTasks: Task[];
  onUpdated: (session: StudySession) => void;
  onTaskUpdated: (task: Task) => void;
  onTasksChanged: (sessionId: number, tasks: Task[]) => void;
  onTaskCreated: (sessionId: number, task: Task) => void;
}) {
  const { notifySessionChanged } = useActiveSession();
  const initialStart = new Date(session.started_at);
  const initialEnd = session.ended_at ? new Date(session.ended_at) : new Date();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => dateInputValue(initialStart));
  const [startTime, setStartTime] = useState(() => timeInputValue(initialStart));
  const [endTime, setEndTime] = useState(() => timeInputValue(initialEnd));
  const [ongoing, setOngoing] = useState(session.ended_at === null);
  const [description, setDescription] = useState(session.description ?? "");
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>(() => tasks.map((task) => task.id));
  const [creatingTask, setCreatingTask] = useState(false);
  const [newTaskMode, setNewTaskMode] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    const start = new Date(session.started_at);
    const end = session.ended_at ? new Date(session.ended_at) : new Date();
    setDate(dateInputValue(start));
    setStartTime(timeInputValue(start));
    setEndTime(timeInputValue(end));
    setOngoing(session.ended_at === null);
    setDescription(session.description ?? "");
    setSelectedTaskIds(tasks.map((task) => task.id));
    setNewTaskMode(false);
    setNewTaskTitle("");
    setNewTaskDescription("");
    setError(null);
  }

  async function createCompletedTask(event: FormEvent) {
    event.preventDefault();
    if (!newTaskTitle.trim()) return;
    setCreatingTask(true);
    setError(null);
    try {
      const created = await tasksApi.create(
        date,
        newTaskTitle.trim(),
        session.project_id,
        newTaskDescription.trim() || null,
        session.id,
        true,
      );
      setSelectedTaskIds((current) => current.includes(created.id) ? current : [...current, created.id]);
      onTaskCreated(session.id, created);
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskMode(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create this completed task.");
    } finally {
      setCreatingTask(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (busy && !nextOpen) return;
    if (nextOpen) resetForm();
    setOpen(nextOpen);
  }

  async function saveSession(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const startedAt = new Date(`${date}T${startTime}`);
    const endedAt = ongoing ? null : new Date(`${date}T${endTime}`);

    if (startedAt > new Date()) {
      setError("Start time cannot be in the future.");
      return;
    }
    if (endedAt && endedAt <= startedAt) {
      setError("End time must be after start time.");
      return;
    }

    setBusy(true);
    try {
      await sessionsApi.update(session.id, {
        startedAt: startedAt.toISOString(),
        endedAt: endedAt?.toISOString() ?? null,
        description: description.trim() || null,
        taskIds: ongoing ? undefined : selectedTaskIds,
        taskPeriodStart: ongoing ? undefined : date,
      });
      const updated: StudySession = {
        ...session,
        started_at: startedAt.toISOString(),
        ended_at: endedAt?.toISOString() ?? null,
        duration_seconds: endedAt
          ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
          : null,
        description: description.trim() || null,
      };
      onUpdated(updated);
      if (!ongoing) {
        const byId = new Map([...availableTasks, ...tasks].map((task) => [task.id, task]));
        const completedAt = new Date().toISOString();
        const attachedTasks = selectedTaskIds.flatMap((taskId) => {
          const task = byId.get(taskId);
          if (!task) return [];
          if (task.completed_at !== null) return [task];
          const completedTask = { ...task, completed_at: completedAt, period_start: date };
          onTaskUpdated(completedTask);
          return [completedTask];
        });
        onTasksChanged(session.id, attachedTasks);
      }
      await notifySessionChanged().catch(() => {});
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save this session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit session starting at ${formatTime(session.started_at)}`}
          />
        }
      >
        <Pencil />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex min-w-0 flex-wrap items-center gap-2 pr-8">
            <DialogTitle>Edit session</DialogTitle>
            <Badge variant="outline" className="max-w-56">
              {session.project_id ? <ProjectIcon icon={session.project_icon} /> : <NoProjectIcon />}
              <span className="truncate" title={session.project_path ?? session.project_name ?? "No project"}>
                {session.project_path ?? session.project_name ?? "No project"}
              </span>
            </Badge>
          </div>
          <DialogDescription className="sr-only">Edit the session record and its completed tasks.</DialogDescription>
        </DialogHeader>
        <form id={`session-edit-form-${session.id}`} onSubmit={saveSession}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`session-date-${session.id}`}>Date</FieldLabel>
              <Input
                id={`session-date-${session.id}`}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                disabled={busy}
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor={`session-start-${session.id}`}>Start time</FieldLabel>
                <Input
                  id={`session-start-${session.id}`}
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  disabled={busy}
                  required
                />
              </Field>
              <Field>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor={`session-end-${session.id}`}>End time</FieldLabel>
                  <label
                    htmlFor={`session-ongoing-${session.id}`}
                    className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs"
                  >
                    <Checkbox
                      id={`session-ongoing-${session.id}`}
                      className="size-3.5"
                      checked={ongoing}
                      onCheckedChange={(checked) => setOngoing(Boolean(checked))}
                      disabled={busy}
                    />
                    Ongoing
                  </label>
                </div>
                <Input
                  id={`session-end-${session.id}`}
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  disabled={busy || ongoing}
                  required={!ongoing}
                />
              </Field>
            </div>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`session-description-${session.id}`}>Description</FieldLabel>
              <Textarea
                id={`session-description-${session.id}`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What happened during this session?"
                className="min-h-32 resize-y"
                maxLength={4000}
                aria-invalid={Boolean(error)}
                disabled={busy}
              />
            </Field>
            {!ongoing && (
              <Field>
                <div className="flex items-center justify-between gap-2">
                  <FieldTitle>Completed tasks</FieldTitle>
                  <Popover>
                    <PopoverTrigger
                      render={<Button type="button" variant="outline" size="sm" disabled={busy} />}
                    >
                      <Plus data-icon="inline-start" />Add tasks
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0">
                      <PopoverHeader className="border-b bg-muted/20 px-4 py-3">
                        <PopoverTitle>{newTaskMode ? "New completed task" : "Add tasks to session"}</PopoverTitle>
                      </PopoverHeader>
                      {newTaskMode ? (
                        <form className="animate-in fade-in slide-in-from-right-1 flex flex-col gap-4 p-4 duration-150" onSubmit={createCompletedTask}>
                          <Field>
                            <FieldLabel htmlFor={`new-session-task-title-${session.id}`}>Title</FieldLabel>
                            <Input
                              id={`new-session-task-title-${session.id}`}
                              autoFocus
                              value={newTaskTitle}
                              onChange={(event) => setNewTaskTitle(event.target.value)}
                              maxLength={200}
                              disabled={creatingTask}
                            />
                          </Field>
                          <Field>
                            <div className="flex items-center gap-1">
                              <FieldLabel htmlFor={`new-session-task-description-${session.id}`}>Description</FieldLabel>
                              <HelpTooltip label="About task descriptions">Optional · shown beneath the task in Calendar.</HelpTooltip>
                            </div>
                            <Textarea
                              id={`new-session-task-description-${session.id}`}
                              value={newTaskDescription}
                              onChange={(event) => setNewTaskDescription(event.target.value)}
                              className="min-h-24 resize-y"
                              maxLength={4000}
                              disabled={creatingTask}
                            />
                          </Field>
                          <div className="flex justify-end gap-2 border-t pt-3">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setNewTaskMode(false)} disabled={creatingTask}>Cancel</Button>
                            <Button type="submit" size="sm" disabled={creatingTask || !newTaskTitle.trim()}>
                              {creatingTask && <Spinner data-icon="inline-start" />}{creatingTask ? "Adding…" : "Add task"}
                            </Button>
                          </div>
                        </form>
                      ) : <div className="max-h-64 overflow-y-auto p-2">
                        <button
                          type="button"
                          onClick={() => setNewTaskMode(true)}
                          className="text-primary hover:bg-muted/60 mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium transition-colors duration-150"
                        >
                          <Plus className="size-4" />New completed task
                        </button>
                        {availableTasks.length === 0 ? (
                          <p className="text-muted-foreground px-2 py-6 text-center text-sm">No completed or Backlog tasks available.</p>
                        ) : ([
                          { label: "Backlog", items: availableTasks.filter((task) => task.completed_at === null) },
                          { label: "Completed", items: availableTasks.filter((task) => task.completed_at !== null) },
                        ]).map((group) => group.items.length > 0 && (
                          <div key={group.label} className="mb-2 last:mb-0">
                            <p className="text-muted-foreground px-2 py-1 text-[11px] font-medium uppercase tracking-wide">{group.label}</p>
                            {group.items.map((task) => {
                              const selected = selectedTaskIds.includes(task.id);
                              return (
                                <button
                                  key={task.id}
                                  type="button"
                                  onClick={() => setSelectedTaskIds((current) => selected
                                    ? current.filter((id) => id !== task.id)
                                    : [...current, task.id])}
                                  className="hover:bg-muted/60 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors duration-150"
                                >
                                  <span className={selected ? "bg-primary text-primary-foreground mt-0.5 flex size-4 shrink-0 items-center justify-center rounded" : "border-border mt-0.5 size-4 shrink-0 rounded border"}>
                                    {selected && <Check className="size-3" />}
                                  </span>
                                  <span className="min-w-0 text-sm break-words">{task.title}</span>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>}
                    </PopoverContent>
                  </Popover>
                </div>
                {selectedTaskIds.length > 0 ? (
                <div className="animate-in fade-in flex flex-col gap-1 rounded-lg border p-2 duration-150">
                  {selectedTaskIds.map((taskId) => {
                    const task = [...availableTasks, ...tasks].find((item) => item.id === taskId);
                    if (!task) return null;
                    return (
                    <div
                      key={task.id}
                      className="group/task flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-muted/60"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm break-words">{task.title}</span>
                        {task.description && (
                          <LinkifiedText text={task.description} className="text-muted-foreground line-clamp-2 text-xs" />
                        )}
                      </div>
                      <div className="opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover/task:opacity-100 sm:group-focus-within/task:opacity-100">
                        <TaskEditorPopover task={task} onUpdated={onTaskUpdated} />
                      </div>
                    </div>
                    );
                  })}
                </div>
                ) : <p className="text-muted-foreground py-3 text-sm">No completed tasks attached.</p>}
              </Field>
            )}
            <FieldError>{error}</FieldError>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button type="submit" form={`session-edit-form-${session.id}`} disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            {busy ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
