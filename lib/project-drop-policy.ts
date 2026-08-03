import type { Project } from "@/lib/api";
import { canPlaceProject } from "@/lib/project-tree";

export type ProjectDropPosition = "before" | "inside" | "after";
export type ProjectDropIntent = { targetId: number; position: ProjectDropPosition };
export type ProjectMove = { parentId: number | null; position: number };

export function projectDropIntent(
  projects: Project[],
  moving: Project,
  target: Project,
  pointerRatio: number,
): ProjectDropIntent | null {
  if (moving.id === target.id) return null;
  let position: ProjectDropPosition = pointerRatio < 0.28 ? "before" : pointerRatio > 0.72 ? "after" : "inside";
  if (position === "inside" && !canPlaceProject(projects, moving, target.id)) {
    position = pointerRatio < 0.5 ? "before" : "after";
  }
  const parentId = position === "inside" ? target.id : target.parentId;
  return canPlaceProject(projects, moving, parentId) ? { targetId: target.id, position } : null;
}

export function resolveProjectDrop(
  projects: Project[],
  moving: Project,
  intent: ProjectDropIntent | null,
  dropAtRoot: boolean,
): ProjectMove | null {
  if (dropAtRoot) {
    return {
      parentId: null,
      position: projects.filter((project) => project.id !== moving.id && project.parentId === null && project.pinned === moving.pinned).length,
    };
  }
  if (!intent) return null;
  const target = projects.find((project) => project.id === intent.targetId);
  if (!target) return null;

  if (intent.position === "inside") {
    return {
      parentId: target.id,
      position: projects.filter((project) => project.id !== moving.id && project.parentId === target.id && project.pinned === moving.pinned).length,
    };
  }

  const siblings = projects
    .filter((project) => project.id !== moving.id && project.parentId === target.parentId && project.pinned === moving.pinned)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const targetIndex = siblings.findIndex((project) => project.id === target.id);
  return {
    parentId: target.parentId,
    position: targetIndex === -1
      ? (moving.pinned ? siblings.length : 0)
      : Math.max(0, targetIndex + (intent.position === "after" ? 1 : 0)),
  };
}
