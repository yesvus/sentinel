"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  useDraggable, useDroppable,
} from "@dnd-kit/core";
import Link from "next/link";
import { Archive, GripVertical, Inbox, Pencil, Pin, Trash2 } from "lucide-react";
import { ProjectDescriptionPreview } from "@/components/project-description-preview";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectIcon } from "@/lib/icons";
import type { Project } from "@/lib/api";
import type { ProjectDropIntent } from "@/lib/project-drop-policy";
import { orderProjectsAsTree, type ProjectTreeItem } from "@/lib/project-tree";
import { cn } from "@/lib/utils";
import {
  DropRootHint, ProjectDragOverlay, useProjectDrag,
} from "@/components/project-drag-context";

function ProjectActionTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ProjectCard({
  item, dragging, backlogCount, dropIntent, lastChild, actions, dragHandle,
}: {
  item: ProjectTreeItem;
  dragging: boolean;
  backlogCount: number;
  dropIntent: ProjectDropIntent | null;
  lastChild: boolean;
  actions: React.ReactNode;
  dragHandle?: React.ReactNode;
}) {
  return (
    <div className="relative min-w-0 transition-all duration-200" style={{ marginInlineStart: `${item.treeDepth * 1.5}rem` }}>
      {item.treeDepth > 0 && !dragging && (
        <motion.div
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0, scaleY: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="absolute pointer-events-none origin-top"
          style={{ left: "-1rem", top: -4, bottom: -4, width: "1rem" }}
        >
          <div className="absolute border-l border-border" style={{ left: 0, top: -4, ...(lastChild ? { height: 22 } : { bottom: 4 }) }} />
          <div className="absolute border-b border-border" style={{ left: 0, top: 18, width: 12 }} />
        </motion.div>
      )}
      {dropIntent?.position === "before" && <span className="bg-primary animate-in fade-in slide-in-from-top-1 absolute -inset-x-1 -top-1 z-10 h-0.5 rounded-full duration-150" aria-hidden="true" />}
      {dropIntent?.position === "after" && <span className="bg-primary animate-in fade-in slide-in-from-bottom-1 absolute -inset-x-1 -bottom-1 z-10 h-0.5 rounded-full duration-150" aria-hidden="true" />}
      <div className={cn(
        "bg-card flex min-w-0 items-start gap-3 rounded-lg p-3 ring-1 ring-foreground/10 transition-[opacity,background-color] duration-150",
        dropIntent?.position === "inside" && "bg-primary/10 ring-2 ring-primary/60",
        dragging && "opacity-30",
      )}>
        {dragHandle}
        <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
          <ProjectIcon icon={item.project.icon} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link href={`/app/projects/${item.project.id}`} className="min-w-0 truncate font-medium transition-colors duration-150 hover:text-primary" title={item.project.path}>
              {item.project.name}
            </Link>
            {item.project.archived && <Badge variant="outline">Archived</Badge>}
            {backlogCount > 0 && <Badge variant="outline" className="gap-1"><Inbox />{backlogCount}</Badge>}
          </div>
          <div className="mt-1.5"><ProjectDescriptionPreview description={item.project.description} /></div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
        </div>
      </div>
    </div>
  );
}

function ProjectTreeRow({
  id, item, dragging, busy, backlogCount, dropIntent, lastChild, onArchive, onPin,
}: {
  id: string;
  item: ProjectTreeItem;
  dragging: boolean;
  busy: boolean;
  backlogCount: number;
  dropIntent: ProjectDropIntent | null;
  lastChild: boolean;
  onArchive: (project: Project) => Promise<void>;
  onPin: (project: Project) => Promise<void>;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners } = useDraggable({ id, disabled: busy || dragging });
  const { setNodeRef: setDroppableRef } = useDroppable({ id, disabled: busy || dragging });

  return (
    <div ref={(node) => { setNodeRef(node); setDroppableRef(node); }}>
      <ProjectCard
        item={item}
        dragging={dragging}
        backlogCount={backlogCount}
        dropIntent={dropIntent}
        lastChild={lastChild}
        dragHandle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="text-muted-foreground hover:bg-muted cursor-grab touch-none active:cursor-grabbing shrink-0 inline-flex size-7 items-center justify-center rounded-md"
            aria-label={`Move ${item.project.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        }
        actions={
          <>
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
          </>
        }
      />
    </div>
  );
}

export function ActiveProjectTree({
  projects, backlogCounts, busyId, onMove, onArchive, onPin,
}: {
  projects: Project[];
  backlogCounts: Map<number, number>;
  busyId: number | null;
  onMove: (project: Project, parentId: number | null, position: number) => Promise<void>;
  onArchive: (project: Project) => Promise<void>;
  onPin: (project: Project) => Promise<void>;
}) {
  const drag = useProjectDrag(projects, onMove);
  const ordered = useMemo(() => orderProjectsAsTree(projects), [projects]);
  const activeItem = ordered.find(({ project }) => project.id === drag.activeId) ?? null;

  const lastChildIds = useMemo(() => {
    const set = new Set<number>();
    const byParent = new Map<number | null, Project[]>();
    for (const p of projects) {
      const key = p.parentId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(p);
    }
    for (const [, children] of byParent) {
      if (children.length === 0) continue;
      children.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      set.add(children[children.length - 1].id);
    }
    return set;
  }, [projects]);

  return (
    <DndContext
      sensors={drag.sensors}
      collisionDetection={drag.collisionDetection}
      onDragStart={drag.onDragStart}
      onDragMove={drag.onDragMove}
      onDragCancel={drag.onDragCancel}
      onDragEnd={(event) => void drag.onDragEnd(event)}
    >
      <DropRootHint active={drag.activeId !== null} />
      <div className="flex max-w-full flex-col gap-2">
        <AnimatePresence>
          {ordered.map((item) => (
            <motion.div
              key={item.project.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <ProjectTreeRow
                item={item}
                id={String(item.project.id)}
                dragging={drag.activeId === item.project.id || drag.draggingDescendantIds.has(item.project.id)}
                busy={busyId === item.project.id}
                backlogCount={backlogCounts.get(item.project.id) ?? 0}
                dropIntent={drag.dropIntent?.targetId === item.project.id ? drag.dropIntent : null}
                lastChild={lastChildIds.has(item.project.id)}
                onArchive={onArchive}
                onPin={onPin}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <ProjectDragOverlay activeItem={activeItem ? { project: activeItem.project, name: activeItem.project.name } : null} descendants={drag.activeDescendants} />
    </DndContext>
  );
}

export function ArchivedProjectTree({
  projects, backlogCounts, busyId, onRestore, onDelete,
}: {
  projects: Project[];
  backlogCounts: Map<number, number>;
  busyId: number | null;
  onRestore: (project: Project) => Promise<void>;
  onDelete: (project: Project) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {orderProjectsAsTree(projects).map((item) => (
        <ProjectCard
          key={item.project.id}
          item={item}
          dragging={false}
          backlogCount={backlogCounts.get(item.project.id) ?? 0}
          dropIntent={null}
          lastChild={false}
          actions={
            <>
              <ProjectActionTooltip label="Restore project">
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Restore ${item.project.name}`} onClick={() => void onRestore(item.project)} disabled={busyId === item.project.id}>
                  <Archive />
                </Button>
              </ProjectActionTooltip>
              <AlertDialog>
                <ProjectActionTooltip label="Delete project">
                  <AlertDialogTrigger render={<Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Delete ${item.project.name}`} disabled={busyId === item.project.id} />}><Trash2 /></AlertDialogTrigger>
                </ProjectActionTooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia><Trash2 /></AlertDialogMedia>
                    <AlertDialogTitle>Delete {item.project.name}?</AlertDialogTitle>
                    <AlertDialogDescription>This permanently removes the project and its nested projects.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void onDelete(item.project)}>Delete</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          }
        />
      ))}
    </div>
  );
}