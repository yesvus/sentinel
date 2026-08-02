"use client";

import { Archive, RotateCcw, Save, Trash2 } from "lucide-react";
import { ProjectIconSelectorPopover } from "@/components/project-icon-selector-popover";
import { ProjectNameEditorPopover } from "@/components/project-name-editor-popover";
import { LinkifiedText } from "@/components/linkified-text";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { Project } from "@/lib/api";
import { ProjectIcon } from "@/lib/icons";
import type { ProjectTreeItem } from "@/lib/project-tree";

const TOP_LEVEL_VALUE = "__top-level__";
export type ProjectTextField = "description" | "resources";

export function ProjectEditorCard({
  project, byId, parentCandidates, name, description, resources, icon, editingField, saving, saveStatus,
  onNameChange, onDescriptionChange, onResourcesChange, onIconChange, onBeginTextEdit, onCancelTextEdit,
  onSaveTextEdit, onParentChange, onArchiveChange, onDelete,
}: {
  project: Project;
  byId: Map<number, Project>;
  parentCandidates: ProjectTreeItem[];
  name: string;
  description: string;
  resources: string;
  icon: string | null;
  editingField: ProjectTextField | null;
  saving: boolean;
  saveStatus: "idle" | "saving" | "saved";
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onResourcesChange: (value: string) => void;
  onIconChange: (value: string | null) => void;
  onBeginTextEdit: (field: ProjectTextField) => void;
  onCancelTextEdit: () => void;
  onSaveTextEdit: () => Promise<void>;
  onParentChange: (parentId: number | null) => Promise<void>;
  onArchiveChange: (archived: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const textEditor = (field: ProjectTextField, value: string, setValue: (value: string) => void) => {
    const isDescription = field === "description";
    const label = isDescription ? "Description" : "Resources";
    return (
      <Field>
        <FieldLabel htmlFor={`project-${field}`}>{label}</FieldLabel>
        {editingField === field && !project.archived ? (
          <>
            <Textarea
              id={`project-${field}`}
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className={`animate-in fade-in resize-y duration-150 ${isDescription ? "min-h-64" : "min-h-48 font-mono text-sm"}`}
              maxLength={isDescription ? 4000 : 10000}
              disabled={saving}
            />
            <div className="animate-in fade-in slide-in-from-top-1 mt-2 flex justify-end gap-2 duration-150">
              <Button type="button" variant="ghost" size="sm" onClick={onCancelTextEdit} disabled={saving}>Cancel</Button>
              <Button type="button" size="sm" onClick={() => void onSaveTextEdit()} disabled={saving}>
                <Save data-icon="inline-start" />{saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        ) : (
          <div
            data-testid={`project-${field}-surface`}
            role={project.archived ? undefined : "button"}
            tabIndex={project.archived ? undefined : 0}
            onClick={() => onBeginTextEdit(field)}
            onKeyDown={(event) => {
              if ((event.target as HTMLElement).closest("a")) return;
              if (!project.archived && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onBeginTextEdit(field);
              }
            }}
            className={`hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 cursor-text rounded-lg border border-transparent p-3 outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-3 ${isDescription ? "min-h-52" : "min-h-36"}`}
          >
            <LinkifiedText text={value || `Add ${field}`} as="p" className={`text-muted-foreground text-sm leading-6 ${isDescription ? "" : "font-mono"}`} />
          </div>
        )}
      </Field>
    );
  };

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          {!project.archived ? <ProjectIconSelectorPopover value={icon} onChange={onIconChange} disabled={saving} /> : (
            <div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-lg"><ProjectIcon icon={project.icon} className="size-5" /></div>
          )}
          <div className="min-w-0"><div className="flex min-w-0 items-center gap-1">
            <CardTitle className="truncate">{name || project.name}</CardTitle>
            {!project.archived && <ProjectNameEditorPopover value={name} onChange={onNameChange} disabled={saving} />}
          </div></div>
        </div>
        <CardAction className="flex items-center gap-1">
          {project.archived ? <>
            <Button size="sm" variant="outline" onClick={() => void onArchiveChange(false)} disabled={saving}><RotateCcw data-icon="inline-start" /> Restore</Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Delete project" disabled={saving} />}><Trash2 className="text-destructive" /></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogMedia><Trash2 className="text-destructive" /></AlertDialogMedia><AlertDialogTitle>Delete {project.name} permanently?</AlertDialogTitle><AlertDialogDescription>The entire branch and its tasks will be deleted. Past sessions will become unassigned. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onDelete()}>Delete permanently</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </> : (
            <AlertDialog>
              <AlertDialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Archive project" disabled={saving} />}><Archive /></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogMedia><Archive /></AlertDialogMedia><AlertDialogTitle>Archive {project.name}?</AlertDialogTitle><AlertDialogDescription>This project and its descendants will leave active selectors.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void onArchiveChange(true)}>Archive branch</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardAction>
      </CardHeader>
      <CardContent><div className="flex flex-col gap-5">
        <Field>
          <FieldLabel htmlFor="project-parent">Parent project</FieldLabel>
          <Select value={project.parentId !== null ? String(project.parentId) : TOP_LEVEL_VALUE} onValueChange={(value) => void onParentChange(value === TOP_LEVEL_VALUE ? null : Number(value))} disabled={project.archived || saving}>
            <SelectTrigger id="project-parent" className="w-full"><SelectValue>{(value: string) => {
              if (value === TOP_LEVEL_VALUE) return "Top level";
              const parent = byId.get(Number(value));
              return parent ? <span className="flex items-center gap-2"><ProjectIcon icon={parent.icon} className="size-4" />{parent.name}</span> : "Top level";
            }}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value={TOP_LEVEL_VALUE}>Top level</SelectItem>{parentCandidates.map(({ project: candidate, treeDepth }) => (
              <SelectItem key={candidate.id} value={String(candidate.id)}>{treeDepth > 0 && <span className="text-border" aria-hidden="true">└</span>}<ProjectIcon icon={candidate.icon} className="size-4" />{candidate.name}</SelectItem>
            ))}</SelectContent>
          </Select>
        </Field>
        <Separator />
        {textEditor("description", description, onDescriptionChange)}
        <Separator />
        {textEditor("resources", resources, onResourcesChange)}
        <p className={saveStatus === "idle" ? "invisible h-4 text-xs" : "text-muted-foreground h-4 text-right text-xs"} aria-live="polite">{saveStatus === "saving" ? "Saving…" : "Saved"}</p>
      </div></CardContent>
    </Card>
  );
}
