"use client";

import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
import { ProjectIconPicker } from "@/components/project-icon-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
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
import { ApiError, Project, projects as projectsApi } from "@/lib/api";

export function ProjectCreatorPopover({
  onCreated,
  compact = false,
  disabled = false,
}: {
  onCreated: (project: Project) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
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
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(30rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0">
        <PopoverHeader className="border-b bg-muted/20 px-4 py-3">
          <PopoverTitle className="flex items-center gap-1">
            New project
            <HelpTooltip>New projects begin at the top level. Drag them onto another project to organize the tree.</HelpTooltip>
          </PopoverTitle>
        </PopoverHeader>
        <form className="flex flex-col" onSubmit={createProject}>
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
          <div className="flex justify-end gap-2 border-t bg-muted/50 p-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? "Creating..." : "Create project"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
