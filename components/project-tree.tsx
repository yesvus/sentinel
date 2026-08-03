"use client";

import { useRef, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent, type CollisionDetection,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
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
import { projectDropIntent, resolveProjectDrop, type ProjectDropIntent } from "@/lib/project-drop-policy";
import { canPlaceProject, orderProjectsAsTree, type ProjectTreeItem } from "@/lib/project-tree";
import { cn } from "@/lib/utils";

function ProjectActionTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const ROOT_DROP_ID = "project-tree-root";

function DropRootHint({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID, disabled: !active });
  return (
    <div ref={setNodeRef} className={cn(
      "grid overflow-hidden rounded-lg border border-dashed text-center text-xs transition-all duration-200",
      active ? "mb-3 grid-rows-[1fr] border-border px-3 py-2 opacity-100" : "grid-rows-[0fr] border-transparent px-3 py-0 opacity-0",
      isOver && "border-primary bg-primary/10 text-primary",
    )}>
      <div className="animate-in fade-in slide-in-from-top-1 duration-200">Drop here to move to the top level</div>
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
    <div
      ref={(node) => { setNodeRef(node); setDroppableRef(node); }}
      className="relative min-w-0 transition-all duration-200"
      style={{ marginInlineStart: `${item.treeDepth * 1.5}rem` }}
    >
      {item.treeDepth > 0 && !dragging && (
        <div className="absolute pointer-events-none" style={{ left: "-1rem", top: -4, bottom: -4, width: "1rem" }}>
          <div className="absolute border-l border-border" style={{
            left: 0, top: -4,
            ...(lastChild ? { height: 22 } : { bottom: -4 }),
          }} />
          <div className="absolute border-b border-border" style={{ left: 0, top: 18, width: 12 }} />
        </div>
      )}
      {dropIntent?.position === "before" && <span className="bg-primary animate-in fade-in slide-in-from-top-1 absolute -inset-x-1 -top-1 z-10 h-0.5 rounded-full duration-150" aria-hidden="true" />}
      {dropIntent?.position === "after" && <span className="bg-primary animate-in fade-in slide-in-from-bottom-1 absolute -inset-x-1 -bottom-1 z-10 h-0.5 rounded-full duration-150" aria-hidden="true" />}
      <div className={cn(
        "bg-card flex min-w-0 items-start gap-3 rounded-lg p-3 ring-1 ring-foreground/10 transition-[opacity,background-color] duration-150",
        dropIntent?.position === "inside" && "bg-primary/10 ring-2 ring-primary/60",
        dragging && "opacity-30",
      )}>
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
        </div>
      </div>
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
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dropIntent, setDropIntent] = useState<ProjectDropIntent | null>(null);
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dropIntentRef = useRef<ProjectDropIntent | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const ordered = useMemo(() => orderProjectsAsTree(projects), [projects]);
  const activeItem = ordered.find(({ project }) => project.id === activeId) ?? null;
  const draggingDescendantIds = useMemo(() => {
    if (!activeId) return new Set<number>();
    const ids = new Set<number>();
    const find = (parentId: number) => {
      for (const p of projects) {
        if (p.parentId === parentId) { ids.add(p.id); find(p.id); }
      }
    };
    find(activeId);
    return ids;
  }, [activeId, projects]);

  const activeDescendants = useMemo(() => {
    if (!activeId) return [];
    const byParent = new Map<number, Project[]>();
    for (const p of projects) {
      if (!draggingDescendantIds.has(p.id)) continue;
      const key = p.parentId ?? activeId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(p);
    }
    const ordered: { project: Project; depth: number }[] = [];
    const walk = (parentId: number, depth: number) => {
      for (const p of byParent.get(parentId) ?? []) {
        ordered.push({ project: p, depth });
        walk(p.id, depth + 1);
      }
    };
    walk(activeId, 0);
    return ordered;
  }, [activeId, projects, draggingDescendantIds]);

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

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
    const e = event.activatorEvent as PointerEvent | MouseEvent | undefined;
    if (e) pointerRef.current = { x: e.clientX, y: e.clientY };
  }

  const hitTest: CollisionDetection = ({ droppableContainers, pointerCoordinates }) => {
    if (!pointerCoordinates) return [];
    const results = droppableContainers
      .filter((c) => {
        const rect = c.rect.current;
        if (!rect) return false;
        return pointerCoordinates.y >= rect.top - 4 && pointerCoordinates.y <= rect.top + rect.height + 4;
      })
      .map((c) => {
        const rect = c.rect.current!;
        const distance = Math.abs(pointerCoordinates.y - (rect.top + rect.height / 2));
        return { id: c.id, data: { droppableContainer: c, value: distance } };
      })
      .sort((a, b) => a.data.value - b.data.value);
    return results.length > 0 ? [results[0]] : [];
  };

  function handleDragMove(event: DragMoveEvent) {
    const over = event.over;
    if (!over) { setDropIntent(null); return; }
    const moving = projects.find((p) => p.id === activeId);
    const target = projects.find((p) => p.id === Number(over.id));
    if (!moving || !target) { setDropIntent(null); return; }

    const cursorY = pointerRef.current.y + event.delta.y;
    const ratio = (cursorY - over.rect.top) / Math.max(1, over.rect.height);
    const intent = projectDropIntent(projects, moving, target, Math.max(0, Math.min(1, ratio)));
    dropIntentRef.current = intent;
    requestAnimationFrame(() => setDropIntent(intent));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const moving = projects.find((p) => p.id === Number(event.active.id));
    const overRoot = event.over?.id === ROOT_DROP_ID;
    const intent = dropIntentRef.current;
    const move = moving
      ? resolveProjectDrop(projects, moving, intent, overRoot)
      : null;
    setActiveId(null);
    setDropIntent(null);
    dropIntentRef.current = null;
    if (!moving || !move || moving.id === move.parentId || !canPlaceProject(projects, moving, move.parentId)) return;
    await onMove(moving, move.parentId, move.position);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={hitTest}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragCancel={() => { setActiveId(null); setDropIntent(null); }}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <DropRootHint active={activeId !== null} />
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
                dragging={activeId === item.project.id || draggingDescendantIds.has(item.project.id)}
                busy={busyId === item.project.id}
                backlogCount={backlogCounts.get(item.project.id) ?? 0}
                dropIntent={dropIntent?.targetId === item.project.id ? dropIntent : null}
                lastChild={lastChildIds.has(item.project.id)}
                onArchive={onArchive}
                onPin={onPin}
              />
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
        <DragOverlay adjustScale={false} dropAnimation={{ duration: 160, easing: "ease-out" }} modifiers={[snapCenterToCursor]}>
        {activeItem ? (
          <div className="pointer-events-none w-64 max-w-[calc(100vw-1rem)] rounded-lg bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center gap-2 px-3 py-2">
              <GripVertical className="text-muted-foreground size-4 shrink-0" />
              <ProjectIcon icon={activeItem.project.icon} className="size-4 shrink-0" />
              <span className="min-w-0 truncate text-sm font-medium">{activeItem.project.name}</span>
            </div>
            {activeDescendants.map(({ project: child, depth }) => (
              <div key={child.id} className="border-t border-foreground/5 flex items-center gap-2 px-3 py-1.5">
                <span className="w-4 shrink-0" style={{ marginLeft: `${depth * 8}px` }} />
                <ProjectIcon icon={child.icon} className="size-3.5 shrink-0" />
                <span className="text-muted-foreground min-w-0 truncate text-xs">{child.name}</span>
              </div>
))}
          </div>
        ) : null}
      </DragOverlay>
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
        <div key={item.project.id} className="bg-card flex min-w-0 items-start gap-3 rounded-lg p-3 ring-1 ring-foreground/10" style={{ marginInlineStart: `${item.treeDepth * 1.5}rem` }}>
          <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
            <ProjectIcon icon={item.project.icon} className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-medium">{item.project.name}</span>
              {item.project.archived && <Badge variant="outline">Archived</Badge>}
              {backlogCounts.get(item.project.id) ? <Badge variant="outline" className="gap-1"><Inbox />{backlogCounts.get(item.project.id)}</Badge> : null}
            </div>
            <div className="mt-1.5"><ProjectDescriptionPreview description={item.project.description} /></div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
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
          </div>
        </div>
      ))}
    </div>
  );
}