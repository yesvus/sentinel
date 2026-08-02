"use client";

/* eslint-disable react-hooks/refs -- dnd-kit exposes its reactive drag state and ref setters through hook result objects. */

import { ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { Archive, GripVertical, Inbox, Pencil, Pin, RotateCcw, Trash2 } from "lucide-react";
import { ProjectDescriptionPreview } from "@/components/project-description-preview";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Project } from "@/lib/api";
import { ProjectIcon } from "@/lib/icons";
import { canPlaceProject, orderProjectsAsTree, projectBranchIds, type ProjectTreeItem } from "@/lib/project-tree";
import { cn } from "@/lib/utils";

const ROOT_DROP_ID = "project-tree-root";
type DropPosition = "before" | "inside" | "after";
type DropIntent = { targetId: number; position: DropPosition };

function pointerClientY(event: Event): number | null {
  if (event instanceof PointerEvent || event instanceof MouseEvent) return event.clientY;
  if (event instanceof TouchEvent) return (event.touches[0] ?? event.changedTouches[0])?.clientY ?? null;
  return null;
}

function ActionTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TreeRowSurface({
  item,
  backlogCount,
  actions,
  dragHandle,
  dragging = false,
}: {
  item: ProjectTreeItem;
  backlogCount: number;
  actions?: ReactNode;
  dragHandle?: ReactNode;
  dragging?: boolean;
}) {
  const { project } = item;
  return (
    <div
      className={cn(
        "bg-card flex min-w-0 items-start gap-3 rounded-lg p-3 ring-1 ring-foreground/10 transition-[opacity,box-shadow,background-color] duration-200",
        dragging && "bg-accent opacity-70 shadow-lg",
      )}
    >
      {dragHandle}
      <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
        <ProjectIcon icon={project.icon} className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={`/app/projects/${project.id}`}
            className="min-w-0 truncate font-medium transition-colors duration-150 hover:text-primary"
            title={project.path}
          >
            {project.name}
          </Link>
          {project.archived && <Badge variant="outline">Archived</Badge>}
          {backlogCount > 0 && (
            <Badge variant="outline" className="gap-1">
              <Inbox />
              {backlogCount}
            </Badge>
          )}
        </div>
        <div className="mt-1.5">
          <ProjectDescriptionPreview description={project.description} />
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

function DraggableProjectRow({
  item,
  backlogCount,
  busy,
  dropPosition,
  onArchive,
  onPin,
}: {
  item: ProjectTreeItem;
  backlogCount: number;
  busy: boolean;
  dropPosition: DropPosition | null;
  onArchive: (project: Project) => Promise<void>;
  onPin: (project: Project) => Promise<void>;
}) {
  const id = String(item.project.id);
  const draggable = useDraggable({ id, disabled: busy });
  // Left enabled (not gated on draggable.isDragging): keeping the dragged row
  // itself as the closest droppable for small pointer movements gives drags a
  // "dead zone" around the origin. handleDragOver already discards self as a
  // target, so this never resolves to a real move — but disabling it here
  // would hand tiny, unintentional nudges to whichever row is next closest
  // instead of absorbing them.
  const droppable = useDroppable({ id, disabled: busy });
  return (
    <div
      ref={droppable.setNodeRef}
      className="relative min-w-0"
      style={{ marginInlineStart: `${item.treeDepth * 1.5}rem` }}
    >
      {item.treeDepth > 0 && (
        <span aria-hidden="true" className="border-border absolute -left-4 top-0 h-7 w-3 rounded-bl-md border-b border-l" />
      )}
      <div
        ref={draggable.setNodeRef}
        className={cn(
          "relative rounded-lg transition-[opacity,background-color] duration-150",
          draggable.isDragging && "opacity-0",
          droppable.isOver && dropPosition === "inside" && !draggable.isDragging && "bg-primary/10 ring-2 ring-primary/60",
        )}
      >
        {droppable.isOver && dropPosition === "before" && !draggable.isDragging && (
          <span className="bg-primary animate-in fade-in absolute inset-x-0 -top-1 z-10 h-0.5 rounded-full duration-100" aria-hidden="true" />
        )}
        {droppable.isOver && dropPosition === "after" && !draggable.isDragging && (
          <span className="bg-primary animate-in fade-in absolute inset-x-0 -bottom-1 z-10 h-0.5 rounded-full duration-100" aria-hidden="true" />
        )}
        <TreeRowSurface
          item={item}
          backlogCount={backlogCount}
          dragging={draggable.isDragging}
          dragHandle={
            <ActionTooltip label="Drag to reorder or nest">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground cursor-grab touch-none active:cursor-grabbing"
                aria-label={`Move ${item.project.name}`}
                {...draggable.listeners}
                {...draggable.attributes}
              >
                <GripVertical />
              </Button>
            </ActionTooltip>
          }
          actions={
            <>
              <ActionTooltip label="Edit project">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Edit ${item.project.name}`}
                  render={<Link href={`/app/projects/${item.project.id}`} />}
                  nativeButton={false}
                >
                  <Pencil />
                </Button>
              </ActionTooltip>
              <ActionTooltip label={item.project.pinned ? "Unpin project" : "Pin project"}>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={item.project.pinned ? `Unpin ${item.project.name}` : `Pin ${item.project.name}`}
                  onClick={() => void onPin(item.project)}
                  disabled={busy}
                >
                  <Pin className={item.project.pinned ? "fill-current" : undefined} />
                </Button>
              </ActionTooltip>
              <AlertDialog>
                <ActionTooltip label="Archive project">
                  <AlertDialogTrigger
                    render={<Button size="icon-sm" variant="ghost" aria-label={`Archive ${item.project.name}`} disabled={busy} />}
                  >
                    <Archive />
                  </AlertDialogTrigger>
                </ActionTooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia><Archive /></AlertDialogMedia>
                    <AlertDialogTitle>Archive {item.project.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This project and every project below it will leave active selectors. Sessions and statistics keep their assignments.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void onArchive(item.project)}>Archive branch</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          }
        />
      </div>
    </div>
  );
}

function RootDropZone({ active }: { active: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: ROOT_DROP_ID, disabled: !active });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "grid overflow-hidden rounded-lg border border-dashed text-center text-xs transition-[grid-template-rows,opacity,background-color,border-color,padding] duration-200",
        active ? "mb-3 grid-rows-[1fr] border-border px-3 py-2 opacity-100" : "grid-rows-[0fr] border-transparent px-3 py-0 opacity-0",
        isOver && "border-primary bg-primary/10 text-primary",
      )}
    >
      <span className="min-h-0 overflow-hidden">Drop here to move to the top level</span>
    </div>
  );
}

export function ActiveProjectTree({
  projects,
  backlogCounts,
  busyId,
  onMove,
  onArchive,
  onPin,
}: {
  projects: Project[];
  backlogCounts: Map<number, number>;
  busyId: number | null;
  onMove: (project: Project, parentId: number | null, position: number) => Promise<void>;
  onArchive: (project: Project) => Promise<void>;
  onPin: (project: Project) => Promise<void>;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const ordered = useMemo(() => orderProjectsAsTree(projects), [projects]);
  const activeItem = ordered.find(({ project }) => project.id === activeId) ?? null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragMove(event: DragMoveEvent) {
    if (!event.over || event.over.id === ROOT_DROP_ID) {
      setDropIntent(null);
      return;
    }
    const targetId = Number(event.over.id);
    const moving = projects.find((project) => project.id === activeId);
    const target = projects.find((project) => project.id === targetId);
    if (!moving || !target || targetId === moving.id) {
      setDropIntent(null);
      return;
    }
    // dnd-kit's onDragOver only fires when the resolved drop target *changes*,
    // not on every pointer move within the same target — so the before/inside/after
    // read has to come from onDragMove (which fires continuously) or it freezes at
    // whatever it was the instant the cursor entered the row.
    //
    // Prefer the live cursor position (matches what the user sees, including the
    // DragOverlay's snapCenterToCursor) over the dragged row's translated rect —
    // that rect is anchored to wherever within the row the grip handle sits, which
    // trails well below the cursor on taller rows.
    const pointerStartY = pointerClientY(event.activatorEvent);
    const translated = event.active.rect.current.translated;
    const center = pointerStartY !== null
      ? pointerStartY + event.delta.y
      : translated
        ? translated.top + translated.height / 2
        : event.over.rect.top + event.over.rect.height / 2;
    const ratio = (center - event.over.rect.top) / Math.max(1, event.over.rect.height);
    let position: DropPosition = ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "inside";
    if (position === "inside" && !canPlaceProject(projects, moving, target.id)) {
      position = ratio < 0.5 ? "before" : "after";
    }
    const prospectiveParentId = position === "inside" ? target.id : target.parentId;
    if (!canPlaceProject(projects, moving, prospectiveParentId)) {
      setDropIntent(null);
      return;
    }
    setDropIntent({ targetId, position });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const movingId = Number(event.active.id);
    const moving = projects.find((project) => project.id === movingId);
    let parentId: number | null | undefined;
    let position = 0;
    if (event.over?.id === ROOT_DROP_ID) {
      parentId = null;
      position = projects.filter((project) => project.id !== movingId && project.parentId === null && project.pinned === moving?.pinned).length;
    } else if (event.over && dropIntent) {
      const target = projects.find((project) => project.id === dropIntent.targetId);
      if (target && dropIntent.position === "inside") {
        parentId = target.id;
        position = projects.filter((project) => project.id !== movingId && project.parentId === target.id && project.pinned === moving?.pinned).length;
      } else if (target) {
        parentId = target.parentId;
        const siblings = projects
          .filter((project) => project.id !== movingId && project.parentId === target.parentId && project.pinned === moving?.pinned)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
        const targetIndex = siblings.findIndex((project) => project.id === target.id);
        position = targetIndex === -1
          ? (moving?.pinned ? siblings.length : 0)
          : Math.max(0, targetIndex + (dropIntent.position === "after" ? 1 : 0));
      }
    }
    setActiveId(null);
    setDropIntent(null);
    if (!moving || parentId === undefined || moving.id === parentId) return;
    if (!canPlaceProject(projects, moving, parentId)) return;
    await onMove(moving, parentId, position);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragCancel={() => { setActiveId(null); setDropIntent(null); }}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <RootDropZone active={activeId !== null} />
      <div className="flex max-w-full flex-col gap-2 overflow-x-clip">
        {ordered.map((item) => (
          <DraggableProjectRow
            key={item.project.id}
            item={item}
            backlogCount={backlogCounts.get(item.project.id) ?? 0}
            busy={busyId === item.project.id}
            dropPosition={dropIntent?.targetId === item.project.id ? dropIntent.position : null}
            onArchive={onArchive}
            onPin={onPin}
          />
        ))}
      </div>
      <DragOverlay
        adjustScale={false}
        dropAnimation={{ duration: 160, easing: "ease-out" }}
        modifiers={[snapCenterToCursor]}
      >
        {activeItem ? (
          <div
            data-testid="project-drag-overlay"
            className="bg-popover text-popover-foreground pointer-events-none flex w-64 max-w-[calc(100vw-1rem)] items-center gap-2 rounded-lg px-3 py-2 shadow-xl ring-1 ring-foreground/10 animate-in fade-in zoom-in-95 duration-100"
          >
            <GripVertical className="text-muted-foreground size-4 shrink-0" />
            <ProjectIcon icon={activeItem.project.icon} className="size-4 shrink-0" />
            <span className="min-w-0 truncate text-sm font-medium">{activeItem.project.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export function ArchivedProjectTree({
  projects,
  backlogCounts,
  busyId,
  onRestore,
  onDelete,
}: {
  projects: Project[];
  backlogCounts: Map<number, number>;
  busyId: number | null;
  onRestore: (project: Project) => Promise<void>;
  onDelete: (project: Project) => Promise<void>;
}) {
  const ordered = orderProjectsAsTree(projects);
  return (
    <div className="flex flex-col gap-2">
      {ordered.map((item) => {
        const branchSize = projectBranchIds(projects, item.project.id).size;
        return (
          <div
            key={item.project.id}
            className={cn(
              "relative min-w-0",
              busyId === item.project.id && "animate-out fade-out slide-out-to-right-2 duration-200 fill-mode-both",
            )}
            style={{ marginInlineStart: `${item.treeDepth * 1.5}rem` }}
          >
            {item.treeDepth > 0 && (
              <span aria-hidden="true" className="border-border absolute -left-4 top-0 h-7 w-3 rounded-bl-md border-b border-l" />
            )}
            <TreeRowSurface
              item={item}
              backlogCount={backlogCounts.get(item.project.id) ?? 0}
              actions={
                <>
                  <ActionTooltip label="Restore project">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Restore ${item.project.name}`}
                      onClick={() => void onRestore(item.project)}
                      disabled={busyId === item.project.id}
                    >
                      <RotateCcw />
                    </Button>
                  </ActionTooltip>
                  <AlertDialog>
                    <ActionTooltip label="Delete permanently">
                      <AlertDialogTrigger
                        render={<Button size="icon-sm" variant="ghost" aria-label={`Delete ${item.project.name}`} disabled={busyId === item.project.id} />}
                      >
                        <Trash2 className="text-destructive" />
                      </AlertDialogTrigger>
                    </ActionTooltip>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogMedia><Trash2 className="text-destructive" /></AlertDialogMedia>
                        <AlertDialogTitle>Delete {item.project.name} permanently?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {branchSize > 1 ? `This deletes all ${branchSize} projects in this branch. ` : ""}
                          Their tasks will be deleted and past sessions will become unassigned. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => void onDelete(item.project)}>
                          Delete permanently
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              }
            />
          </div>
        );
      })}
    </div>
  );
}
