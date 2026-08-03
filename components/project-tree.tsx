"use client";

import { useMemo, useState } from "react";
import {
  closestCenter, DndContext, type DragEndEvent, type DragMoveEvent, DragOverlay, type DragStartEvent,
  KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { GripVertical } from "lucide-react";
import { ActiveProjectTreeRow } from "@/components/projects/active-project-tree-row";
import { ArchivedProjectTreeRow } from "@/components/projects/archived-project-tree-row";
import type { Project } from "@/lib/api";
import { ProjectIcon } from "@/lib/icons";
import { projectDropIntent, resolveProjectDrop, type ProjectDropIntent } from "@/lib/project-drop-policy";
import { canPlaceProject, orderProjectsAsTree } from "@/lib/project-tree";
import { cn } from "@/lib/utils";

const ROOT_DROP_ID = "project-tree-root";

function pointerClientY(event: Event): number | null {
  if (event instanceof PointerEvent || event instanceof MouseEvent) return event.clientY;
  if (event instanceof TouchEvent) return (event.touches[0] ?? event.changedTouches[0])?.clientY ?? null;
  return null;
}

function RootDropZone({ active }: { active: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: ROOT_DROP_ID, disabled: !active });
  return (
    <div ref={setNodeRef} className={cn(
      "grid overflow-hidden rounded-lg border border-dashed text-center text-xs transition-[grid-template-rows,opacity,background-color,border-color,padding] duration-200",
      active ? "mb-3 grid-rows-[1fr] border-border px-3 py-2 opacity-100" : "grid-rows-[0fr] border-transparent px-3 py-0 opacity-0",
      isOver && "border-primary bg-primary/10 text-primary",
    )}>
      <span className="min-h-0 overflow-hidden">Drop here to move to the top level</span>
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
    const moving = projects.find((project) => project.id === activeId);
    const target = projects.find((project) => project.id === Number(event.over?.id));
    if (!moving || !target) {
      setDropIntent(null);
      return;
    }
    // DragMove updates continuously within a row; DragOver would freeze the zone
    // chosen at entry. Prefer the cursor because the overlay is cursor-centered.
    const pointerStartY = pointerClientY(event.activatorEvent);
    const translated = event.active.rect.current.translated;
    const center = pointerStartY !== null
      ? pointerStartY + event.delta.y
      : translated
        ? translated.top + translated.height / 2
        : event.over.rect.top + event.over.rect.height / 2;
    const ratio = (center - event.over.rect.top) / Math.max(1, event.over.rect.height);
    setDropIntent(projectDropIntent(projects, moving, target, ratio));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const moving = projects.find((project) => project.id === Number(event.active.id));
    const move = moving
      ? resolveProjectDrop(projects, moving, dropIntent, event.over?.id === ROOT_DROP_ID)
      : null;
    setActiveId(null);
    setDropIntent(null);
    if (!moving || !move || moving.id === move.parentId || !canPlaceProject(projects, moving, move.parentId)) return;
    await onMove(moving, move.parentId, move.position);
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
          <ActiveProjectTreeRow
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
      <DragOverlay adjustScale={false} dropAnimation={{ duration: 160, easing: "ease-out" }} modifiers={[snapCenterToCursor]}>
        {activeItem ? (
          <div data-testid="project-drag-overlay" className="bg-popover text-popover-foreground pointer-events-none flex w-64 max-w-[calc(100vw-1rem)] items-center gap-2 rounded-lg px-3 py-2 shadow-xl ring-1 ring-foreground/10 animate-in fade-in zoom-in-95 duration-100">
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
        <ArchivedProjectTreeRow
          key={item.project.id}
          item={item}
          projects={projects}
          backlogCount={backlogCounts.get(item.project.id) ?? 0}
          busy={busyId === item.project.id}
          onRestore={onRestore}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
