"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

export function SortableTaskRow({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children?: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id,
    // dnd-kit's post-drop "layout change" animation re-derives a transform from a
    // stale pre-drag rect vs. the item's true new position, which can visibly fly the
    // just-dropped row in from the wrong direction (e.g. from the top on an upward
    // drag). We already animate the move ourselves during the drag; skip this extra one.
    animateLayoutChanges: () => false,
  });
  // useDraggable's own transform scales the dragged node to match whatever row it's
  // currently hovering over (see adjustScale in @dnd-kit/core), which stretches/squishes
  // rows of unequal height. We only want the translate; force the scale to identity.
  const style = {
    transform: transform ? CSS.Transform.toString({ ...transform, scaleX: 1, scaleY: 1 }) : undefined,
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className={className}
    >
      {children}
    </div>
  );
}