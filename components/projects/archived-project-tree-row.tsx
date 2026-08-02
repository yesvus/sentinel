"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { ProjectActionTooltip, ProjectTreeRowSurface } from "@/components/projects/project-tree-row-surface";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/api";
import { projectBranchIds, type ProjectTreeItem } from "@/lib/project-tree";
import { cn } from "@/lib/utils";

export function ArchivedProjectTreeRow({
  item, projects, backlogCount, busy, onRestore, onDelete,
}: {
  item: ProjectTreeItem;
  projects: Project[];
  backlogCount: number;
  busy: boolean;
  onRestore: (project: Project) => Promise<void>;
  onDelete: (project: Project) => Promise<void>;
}) {
  const branchSize = projectBranchIds(projects, item.project.id).size;
  return (
    <div className={cn("relative min-w-0", busy && "animate-out fade-out slide-out-to-right-2 duration-200 fill-mode-both")} style={{ marginInlineStart: `${item.treeDepth * 1.5}rem` }}>
      {item.treeDepth > 0 && <span aria-hidden="true" className="border-border absolute -left-4 top-0 h-7 w-3 rounded-bl-md border-b border-l" />}
      <ProjectTreeRowSurface item={item} backlogCount={backlogCount} actions={<>
        <ProjectActionTooltip label="Restore project">
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Restore ${item.project.name}`} onClick={() => void onRestore(item.project)} disabled={busy}><RotateCcw /></Button>
        </ProjectActionTooltip>
        <AlertDialog>
          <ProjectActionTooltip label="Delete permanently">
            <AlertDialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Delete ${item.project.name}`} disabled={busy} />}><Trash2 className="text-destructive" /></AlertDialogTrigger>
          </ProjectActionTooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia><Trash2 className="text-destructive" /></AlertDialogMedia>
              <AlertDialogTitle>Delete {item.project.name} permanently?</AlertDialogTitle>
              <AlertDialogDescription>{branchSize > 1 ? `This deletes all ${branchSize} projects in this branch. ` : ""}Their tasks will be deleted and past sessions will become unassigned. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onDelete(item.project)}>Delete permanently</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>} />
    </div>
  );
}
