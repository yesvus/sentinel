"use client";

import { useRef, useMemo, useState } from "react";
import {
  DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDroppable,
  type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { GripVertical } from "lucide-react";
import { ProjectIcon } from "@/lib/icons";
import type { Project } from "@/lib/api";
import { projectDropIntent, resolveProjectDrop, type ProjectDropIntent, type ProjectMove } from "@/lib/project-drop-policy";
import { canPlaceProject } from "@/lib/project-tree";
import { cn } from "@/lib/utils";

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

export function useProjectDrag(projects: Project[], onMove: (project: Project, parentId: number | null, position: number) => Promise<void>) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dropIntent, setDropIntent] = useState<ProjectDropIntent | null>(null);
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dropIntentRef = useRef<ProjectDropIntent | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

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

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
    const e = event.activatorEvent as PointerEvent | MouseEvent | undefined;
    if (e) pointerRef.current = { x: e.clientX, y: e.clientY };
  }

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
    setActiveId(null);
    setDropIntent(null);
    dropIntentRef.current = null;
    if (!moving) return;
    if (!overRoot && !intent) return;
    const move: ProjectMove | null = overRoot
      ? resolveProjectDrop(projects, moving, null, true)
      : resolveProjectDrop(projects, moving, intent, false);
    if (!move || moving.id === move.parentId || !canPlaceProject(projects, moving, move.parentId)) return;
    await onMove(moving, move.parentId, move.position);
  }

  return {
    activeId, dropIntent, draggingDescendantIds, activeDescendants,
    sensors,
    collisionDetection: hitTest,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragCancel: () => { setActiveId(null); setDropIntent(null); },
    onDragEnd: handleDragEnd,
  };
}

export function ProjectDragOverlay({
  activeItem, descendants,
}: {
  activeItem: { project: Project; name: string } | null;
  descendants: { project: Project; depth: number }[];
}) {
  return (
    <DragOverlay adjustScale={false} dropAnimation={{ duration: 160, easing: "ease-out" }} modifiers={[snapCenterToCursor]}>
      {activeItem ? (
        <div className="pointer-events-none w-64 max-w-[calc(100vw-1rem)] rounded-lg bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center gap-2 px-3 py-2">
            <GripVertical className="text-muted-foreground size-4 shrink-0" />
            <ProjectIcon icon={activeItem.project.icon} className="size-4 shrink-0" />
            <span className="min-w-0 truncate text-sm font-medium">{activeItem.name}</span>
          </div>
          {descendants.map(({ project: child, depth }) => (
            <div key={child.id} className="border-t border-foreground/5 flex items-center gap-2 px-3 py-1.5">
              <span className="w-4 shrink-0" style={{ marginLeft: `${depth * 8}px` }} />
              <ProjectIcon icon={child.icon} className="size-3.5 shrink-0" />
              <span className="text-muted-foreground min-w-0 truncate text-xs">{child.name}</span>
            </div>
          ))}
        </div>
      ) : null}
    </DragOverlay>
  );
}

export { ROOT_DROP_ID, DropRootHint };