"use client";

import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
import { LongContentFade } from "@/components/long-content-fade";
import { ProjectSelector } from "@/components/project-selector";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, Project, Task, tasks as tasksApi } from "@/lib/api";
import { taskStore } from "@/lib/task-store";

export function TaskCreatorPopover({
  periodStart,
  projects,
  defaultProjectId = null,
  projectLocked = false,
  sessionId,
  onCreated,
  trigger = "icon",
  todaySuggestions = [],
  backlogSuggestions = [],
}: {
  periodStart: string | null;
  projects: Project[];
  defaultProjectId?: number | null;
  projectLocked?: boolean;
  sessionId?: number;
  onCreated: (task: Task) => void;
  trigger?: "icon" | "chip";
  todaySuggestions?: Task[];
  backlogSuggestions?: Task[];
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

  async function attachTask(task: Task) {
    setBusy(true);
    setError(null);
    try {
      const updated = sessionId === undefined
        ? await taskStore.schedule(task, periodStart!)
        : await taskStore.attachToActiveSession(task, sessionId, periodStart ?? undefined);
      onCreated(updated);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not add this task.");
    } finally {
      setBusy(false);
    }
  }

  const activeProject = projects.find((project) => project.id === defaultProjectId);
  const projectNameById = new Map(projects.map((project) => [project.id, project.path]));

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant={trigger === "icon" ? "ghost" : "outline"}
            size={trigger === "icon" ? "icon-sm" : "sm"}
            className={trigger === "icon"
              ? "text-muted-foreground"
              : "text-muted-foreground size-8 rounded-full border-dashed px-2.5"}
            aria-label="Add a task"
          />
        }
      >
        <Plus className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(28rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0">
        <PopoverHeader className="border-b bg-muted/20 px-4 py-3">
          <PopoverTitle className="flex items-center gap-1">
            New task
            <HelpTooltip>
              {sessionId
                ? `Add to this session${activeProject ? ` · ${activeProject.path}` : ""}.`
                : periodStart === null ? "Add to Backlog without a date." : "Add to this day."}
            </HelpTooltip>
          </PopoverTitle>
        </PopoverHeader>
        <form className="flex flex-col" onSubmit={createTask}>
          <div className="space-y-4 p-4">
            {(todaySuggestions.length > 0 || backlogSuggestions.length > 0) && (
              <div className="space-y-2">
                {sessionId !== undefined && todaySuggestions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">Today</p>
                    <LongContentFade fadeColor="from-popover" className="scrollbar-thin max-h-44 space-y-1 overflow-y-auto pr-1">
                      {todaySuggestions.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => attachTask(task)}
                          disabled={busy}
                          className="hover:bg-muted/50 flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors duration-150 disabled:cursor-not-allowed"
                        >
                          <span className="min-w-0 flex-1 truncate">{task.title}</span>
                        </button>
                      ))}
                    </LongContentFade>
                  </div>
                )}
                {backlogSuggestions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">From backlog</p>
                    <LongContentFade fadeColor="from-popover" className="scrollbar-thin max-h-44 space-y-1 overflow-y-auto pr-1">
                      {backlogSuggestions.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => attachTask(task)}
                          disabled={busy}
                          className="hover:bg-muted/50 flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors duration-150 disabled:cursor-not-allowed"
                        >
                          <span className="min-w-0 flex-1 truncate">{task.title}</span>
                          {task.project_id !== null && (
                            <span className="text-muted-foreground shrink-0 text-xs">
                              {projectNameById.get(task.project_id) ?? ""}
                            </span>
                          )}
                        </button>
                      ))}
                    </LongContentFade>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <span className="bg-border h-px flex-1" />
                  <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">or create a new one</span>
                  <span className="bg-border h-px flex-1" />
                </div>
              </div>
            )}
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
          </div>
          {error && <FieldError className="px-4 pb-3">{error}</FieldError>}
          <div className="flex justify-end gap-2 border-t bg-muted/50 p-4">
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
