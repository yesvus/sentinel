"use client";

import { FormEvent, useState } from "react";
import { ArrowDown, ArrowUp, CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { ProjectSelector } from "@/components/project-selector";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, plannedSessions, type PlannedSession, type Project, type Task } from "@/lib/api";
import { formatDuration } from "@/lib/date";
import { ProjectIcon } from "@/lib/icons";

type PlannedSessionsProps = {
  dateKey: string;
  plans: PlannedSession[];
  projects: Project[];
  tasks: Task[];
  onPlansChange: (plans: PlannedSession[]) => void;
  onTasksChanged: (tasks: Task[]) => void;
};

type EditorState = {
  id: number | null;
  dateKey: string;
  projectId: number | null;
  minutes: string;
  description: string;
  taskIds: number[];
};

function sorted(plans: PlannedSession[]) {
  return plans.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

function editorFor(plan: PlannedSession | null, dateKey: string, projects: Project[]): EditorState {
  return {
    id: plan?.id ?? null,
    dateKey: plan?.date_key ?? dateKey,
    projectId: plan?.project_id ?? projects.find((project) => !project.archived)?.id ?? null,
    minutes: String(plan ? Math.round(plan.estimated_seconds / 60) : 50),
    description: plan?.description ?? "",
    taskIds: plan?.tasks.map((task) => task.id) ?? [],
  };
}

export function PlannedSessions({ dateKey, plans, projects, tasks, onPlansChange, onTasksChanged }: PlannedSessionsProps) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openTasks = tasks.filter((task) => task.period_start === dateKey && task.completed_at === null)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const assignedPlanByTask = new Map(
    plans.filter((plan) => plan.id !== editor?.id).flatMap((plan) => plan.tasks.map((task) => [task.id, plan] as const)),
  );

  function closeEditor(nextOpen: boolean) {
    if (!nextOpen && !busy) {
      setEditor(null);
      setError(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || editor.projectId === null) {
      setError("Choose a project for this focus session.");
      return;
    }
    const estimatedSeconds = Number(editor.minutes) * 60;
    if (!Number.isInteger(estimatedSeconds) || estimatedSeconds < 60) {
      setError("Enter an estimate of at least one minute.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const details = {
        dateKey: editor.dateKey,
        projectId: editor.projectId,
        estimatedSeconds,
        description: editor.description.trim() || null,
        taskIds: editor.taskIds,
      };
      const saved = editor.id === null
        ? await plannedSessions.create(details)
        : await plannedSessions.update(editor.id, details);
      onTasksChanged(saved.tasks);
      onPlansChange(saved.date_key === dateKey
        ? sorted([...plans.filter((plan) => plan.id !== saved.id), saved])
        : plans.filter((plan) => plan.id !== saved.id));
      setEditor(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save this planned session.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(plan: PlannedSession) {
    setBusy(true);
    setError(null);
    onPlansChange(plans.filter((item) => item.id !== plan.id));
    try {
      await plannedSessions.remove(plan.id);
    } catch (caught) {
      onPlansChange(plans);
      setError(caught instanceof ApiError ? caught.message : "Could not remove this planned session.");
    } finally {
      setBusy(false);
    }
  }

  async function reorder(plan: PlannedSession, direction: -1 | 1) {
    const index = plans.findIndex((item) => item.id === plan.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= plans.length) return;
    const next = plans.slice();
    [next[index], next[target]] = [next[target], next[index]];
    const reordered = next.map((item, sortOrder) => ({ ...item, sort_order: sortOrder }));
    onPlansChange(reordered);
    setBusy(true);
    setError(null);
    try {
      await plannedSessions.reorder(reordered.map((item) => ({ id: item.id, sortOrder: item.sort_order })));
    } catch (caught) {
      onPlansChange(plans);
      setError(caught instanceof ApiError ? caught.message : "Could not reorder planned sessions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="animate-in fade-in slide-in-from-top-1 rounded-lg border bg-card duration-300">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-medium"><CalendarClock className="size-4" />Planned sessions</h2>
          <p className="text-muted-foreground text-xs">Plan complete focus blocks before you start work.</p>
        </div>
        <Button type="button" size="sm" onClick={() => { setEditor(editorFor(null, dateKey, projects)); setError(null); }} disabled={busy}>
          <Plus />Add session
        </Button>
      </div>
      <div className="divide-y">
        {plans.length === 0 ? (
          <p className="text-muted-foreground px-4 py-5 text-sm">No focus sessions planned yet.</p>
        ) : plans.map((plan, index) => {
          const project = projects.find((item) => item.id === plan.project_id);
          return (
            <article key={plan.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex flex-col gap-0.5 pt-0.5">
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Move planned session up" disabled={busy || index === 0} onClick={() => void reorder(plan, -1)}><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Move planned session down" disabled={busy || index === plans.length - 1} onClick={() => void reorder(plan, 1)}><ArrowDown /></Button>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                  {project && <span className="flex min-w-0 items-center gap-1"><ProjectIcon icon={project.icon} className="size-3.5" /><span className="truncate">{project.path}</span></span>}
                  <span className="text-muted-foreground font-mono text-xs">{formatDuration(plan.estimated_seconds)}</span>
                </div>
                {plan.description && <p className="text-muted-foreground text-sm whitespace-pre-wrap">{plan.description}</p>}
                {plan.tasks.length > 0 && <p className="text-muted-foreground text-xs">{plan.tasks.map((task) => task.title).join(" · ")}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Edit planned session" disabled={busy} onClick={() => { setEditor(editorFor(plan, dateKey, projects)); setError(null); }}><Pencil /></Button>
                <Button type="button" variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive" aria-label="Remove planned session" disabled={busy} onClick={() => void remove(plan)}><Trash2 /></Button>
              </div>
            </article>
          );
        })}
      </div>
      {error && <p className="text-destructive border-t px-4 py-2 text-sm" role="alert">{error}</p>}
      <Dialog open={editor !== null} onOpenChange={closeEditor}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editor?.id === null ? "Plan a focus session" : "Edit planned session"}</DialogTitle>
            <DialogDescription>Choose the project, estimate, intention, and tasks to start together.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="contents">
            <FieldGroup>
              <Field>
                <FieldLabel>Project</FieldLabel>
                <ProjectSelector projects={projects} value={editor?.projectId ?? null} onChange={(projectId) => setEditor((current) => current ? { ...current, projectId } : current)} disabled={busy} />
              </Field>
              <Field>
                <FieldLabel htmlFor="planned-session-minutes">Estimated minutes</FieldLabel>
                <Input id="planned-session-minutes" type="number" min="1" max="1440" value={editor?.minutes ?? ""} onChange={(event) => setEditor((current) => current ? { ...current, minutes: event.target.value } : current)} disabled={busy} />
              </Field>
              <Field>
                <FieldLabel htmlFor="planned-session-date">Day</FieldLabel>
                <Input id="planned-session-date" type="date" value={editor?.dateKey ?? dateKey} onChange={(event) => setEditor((current) => current ? { ...current, dateKey: event.target.value } : current)} disabled={busy} />
              </Field>
              <Field>
                <FieldLabel htmlFor="planned-session-description">Intention</FieldLabel>
                <Textarea id="planned-session-description" value={editor?.description ?? ""} onChange={(event) => setEditor((current) => current ? { ...current, description: event.target.value } : current)} placeholder="What should this block accomplish?" maxLength={4000} disabled={busy} />
              </Field>
              <Field>
                <FieldLabel>Tasks</FieldLabel>
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                  {openTasks.length === 0 ? <p className="text-muted-foreground px-1 py-2 text-sm">No unfinished tasks on this day.</p> : openTasks.map((task) => {
                    const assignedPlan = assignedPlanByTask.get(task.id);
                    const checked = editor?.taskIds.includes(task.id) ?? false;
                    return <label key={task.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                      <Checkbox checked={checked} disabled={busy || Boolean(assignedPlan)} onCheckedChange={() => setEditor((current) => current ? { ...current, taskIds: checked ? current.taskIds.filter((id) => id !== task.id) : [...current.taskIds, task.id] } : current)} />
                      <span className="min-w-0 flex-1"><span className="block">{task.title}</span>{assignedPlan && <span className="text-muted-foreground block text-xs">Assigned to another session</span>}</span>
                    </label>;
                  })}
                </div>
              </Field>
            </FieldGroup>
            {error && <FieldError>{error}</FieldError>}
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => closeEditor(false)}>Cancel</Button>
              <Button type="submit" disabled={busy || editor?.projectId === null}>{busy && <Spinner data-icon="inline-start" />}{busy ? "Saving..." : "Save session"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
