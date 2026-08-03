"use client";

import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
import { ProjectIconPicker } from "@/components/project-icon-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError, Project, projects as projectsApi } from "@/lib/api";

export function ProjectCreatorPopover({
  onCreated,
  compact = false,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  onCreated: (project: Project) => void;
  compact?: boolean;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = controlledOpen ?? internalOpen;

  function setOpen(nextOpen: boolean) {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  function resetForm() {
    setName("");
    setDescription("");
    setIcon(null);
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (busy && !nextOpen) return;
    if (nextOpen) resetForm();
    setOpen(nextOpen);
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const project = await projectsApi.create(
        name.trim(),
        icon,
        description.trim() || null,
      );
      onCreated(project);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create this project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!hideTrigger && (
        <DialogTrigger
          render={
            <Button
              type="button"
              variant={compact ? "ghost" : "default"}
              size={compact ? "sm" : "default"}
              aria-label={compact ? "New project" : undefined}
              disabled={disabled}
            />
          }
        >
          <Plus data-icon="inline-start" />
          New project
        </DialogTrigger>
      )}
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b bg-muted/20 px-4 py-3">
          <DialogTitle className="flex items-center gap-1">
            New project
            <HelpTooltip>New projects begin at the top level. Drag them onto another project to organize the tree.</HelpTooltip>
          </DialogTitle>
          <DialogDescription className="sr-only">Create a new top-level project.</DialogDescription>
        </DialogHeader>
        <form id="create-project-form" className="flex flex-col" onSubmit={createProject}>
          <FieldGroup className="gap-4 p-4">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="new-project-name">Name</FieldLabel>
              <Input
                id="new-project-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Project name"
                aria-invalid={Boolean(error)}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-project-description">Description</FieldLabel>
              <Textarea
                id="new-project-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What is this project for?"
                className="min-h-20 resize-y"
                maxLength={4000}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldTitle>Icon</FieldTitle>
              <ProjectIconPicker value={icon} onChange={setIcon} />
            </Field>
          </FieldGroup>
          {error && <FieldError className="px-4 pb-3">{error}</FieldError>}
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button type="submit" form="create-project-form" size="sm" disabled={busy || !name.trim()}>
            {busy && <Spinner data-icon="inline-start" />}
            {busy ? "Creating..." : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
