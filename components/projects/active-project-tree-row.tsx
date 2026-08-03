"use client";

/* eslint-disable react-hooks/refs -- dnd-kit exposes reactive drag state and ref setters through hook result objects. */

import Link from "next/link";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Archive, GripVertical, Pencil, Pin } from "lucide-react";
import { ProjectActionTooltip, ProjectTreeRowSurface } from "@/components/projects/project-tree-row-surface";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/api";
import type { ProjectDropPosition } from "@/lib/project-drop-policy";
import type { ProjectTreeItem } from "@/lib/project-tree";
import { cn } from "@/lib/utils";

export function ActiveProjectTreeRow({
  item, backlogCount, busy, dropPosition, onArchive, onPin,
}: {
  item: ProjectTreeItem;
  backlogCount: number;
  busy: boolean;
  dropPosition: ProjectDropPosition | null;
  onArchive: (project: Project) => Promise<void>;
  onPin: (project: Project) => Promise<void>;
}) {
  const id = String(item.project.id);
  const draggable = useDraggable({ id, disabled: busy });
  // Keeping the dragged row droppable gives small pointer movements a dead zone;
  // the policy rejects self-targets so it can never become a real move.
  const droppable = useDroppable({ id, disabled: busy });
  return (
    <div ref={droppable.setNodeRef} className="relative min-w-0" style={{ marginInlineStart: `${item.treeDepth * 1.5}rem` }}>
      {item.treeDepth > 0 && <span aria-hidden="true" className="border-border absolute -left-4 top-0 h-7 w-3 rounded-bl-md border-b border-l" />}
      <div ref={draggable.setNodeRef} className={cn(
        "relative rounded-lg transition-[opacity,background-color] duration-150",
        draggable.isDragging && "opacity-0",
        droppable.isOver && dropPosition === "inside" && !draggable.isDragging && "bg-primary/10 ring-2 ring-primary/60",
      )}>
        {droppable.isOver && dropPosition === "before" && !draggable.isDragging && <span className="bg-primary animate-in fade-in absolute inset-x-0 -top-1 z-10 h-0.5 rounded-full duration-100" aria-hidden="true" />}
        {droppable.isOver && dropPosition === "after" && !draggable.isDragging && <span className="bg-primary animate-in fade-in absolute inset-x-0 -bottom-1 z-10 h-0.5 rounded-full duration-100" aria-hidden="true" />}
        <ProjectTreeRowSurface
          item={item}
          backlogCount={backlogCount}
          dragging={draggable.isDragging}
          dragHandle={
            <ProjectActionTooltip label="Drag to reorder or nest">
              <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground cursor-grab touch-none active:cursor-grabbing" aria-label={`Move ${item.project.name}`} {...draggable.listeners} {...draggable.attributes}>
                <GripVertical />
              </Button>
            </ProjectActionTooltip>
          }
          actions={<>
            <ProjectActionTooltip label="Edit project">
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${item.project.name}`} render={<Link href={`/app/projects/${item.project.id}`} />} nativeButton={false}><Pencil /></Button>
            </ProjectActionTooltip>
            <ProjectActionTooltip label={item.project.pinned ? "Unpin project" : "Pin project"}>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={item.project.pinned ? `Unpin ${item.project.name}` : `Pin ${item.project.name}`} onClick={() => void onPin(item.project)} disabled={busy}>
                <Pin className={item.project.pinned ? "fill-current" : undefined} />
              </Button>
            </ProjectActionTooltip>
            <AlertDialog>
              <ProjectActionTooltip label="Archive project">
                <AlertDialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Archive ${item.project.name}`} disabled={busy} />}><Archive /></AlertDialogTrigger>
              </ProjectActionTooltip>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia><Archive /></AlertDialogMedia>
                  <AlertDialogTitle>Archive {item.project.name}?</AlertDialogTitle>
                  <AlertDialogDescription>This project and every project below it will leave active selectors. Sessions and statistics keep their assignments.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void onArchive(item.project)}>Archive branch</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>}
        />
      </div>
    </div>
  );
}
