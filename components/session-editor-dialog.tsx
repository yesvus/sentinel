"use client";

import { FormEvent, useState } from "react";
import { Pencil } from "lucide-react";
import type { StudySession, Task } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { formatTime } from "@/lib/date";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { useActiveSession } from "@/lib/active-session-context";
import {
  initialSessionForm,
  sessionFormDates,
  validateSessionFormDates,
} from "@/lib/session-form";
import { SessionEditorForm } from "@/components/sessions/session-editor-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

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
  const { updateSession } = useActiveSession();
  const [initial] = useState(() => initialSessionForm(session, tasks));
  const [open, setOpen] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [ongoing, setOngoing] = useState(initial.ongoing);
  const [description, setDescription] = useState(initial.description);
  const [selectedTaskIds, setSelectedTaskIds] = useState(initial.selectedTaskIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    const next = initialSessionForm(session, tasks);
    setDate(next.date);
    setStartTime(next.startTime);
    setEndTime(next.endTime);
    setOngoing(next.ongoing);
    setDescription(next.description);
    setSelectedTaskIds(next.selectedTaskIds);
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (busy && !nextOpen) return;
    if (nextOpen) {
      resetForm();
      setFormVersion((current) => current + 1);
    }
    setOpen(nextOpen);
  }

  async function saveSession(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const { startedAt, endedAt } = sessionFormDates(date, startTime, endTime, ongoing);
    const validationError = validateSessionFormDates(startedAt, endedAt);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    try {
      const result = await updateSession(session.id, {
        startedAt: startedAt.toISOString(),
        endedAt: endedAt?.toISOString() ?? null,
        description: description.trim() || null,
        taskIds: ongoing ? undefined : selectedTaskIds,
        taskPeriodStart: ongoing ? undefined : date,
      });
      onUpdated({
        ...session,
        started_at: result.startedAt,
        ended_at: result.endedAt,
        duration_seconds: result.durationSeconds,
        description: result.description,
      });
      if (!ongoing) {
        for (const task of result.changedTasks ?? []) onTaskUpdated(task);
        onTasksChanged(session.id, result.attachedTasks ?? []);
      }
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
          <SessionEditorForm
            key={formVersion}
            sessionId={session.id}
            projectId={session.project_id}
            tasks={tasks}
            availableTasks={availableTasks}
            date={date}
            startTime={startTime}
            endTime={endTime}
            ongoing={ongoing}
            description={description}
            selectedTaskIds={selectedTaskIds}
            busy={busy}
            error={error}
            onDateChange={setDate}
            onStartTimeChange={setStartTime}
            onEndTimeChange={setEndTime}
            onOngoingChange={setOngoing}
            onDescriptionChange={setDescription}
            onSelectionChange={setSelectedTaskIds}
            onTaskUpdated={onTaskUpdated}
            onTaskCreated={(task) => onTaskCreated(session.id, task)}
            onError={setError}
          />
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
