import type { Project } from "@/lib/api";

export type ProjectTreeItem = {
  project: Project;
  treeDepth: number;
};

export function orderProjectsAsTree(projects: Project[]): ProjectTreeItem[] {
  const ids = new Set(projects.map((project) => project.id));
  const children = new Map<number | null, Project[]>();

  for (const project of projects) {
    const parentId = project.parentId !== null && ids.has(project.parentId)
      ? project.parentId
      : null;
    const branch = children.get(parentId) ?? [];
    branch.push(project);
    children.set(parentId, branch);
  }

  for (const branch of children.values()) {
    branch.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  const ordered: ProjectTreeItem[] = [];
  const append = (parentId: number | null, treeDepth: number) => {
    for (const project of children.get(parentId) ?? []) {
      ordered.push({ project, treeDepth });
      append(project.id, treeDepth + 1);
    }
  };
  append(null, 0);
  return ordered;
}

export function projectTreeWithMatches(projects: Project[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return orderProjectsAsTree(projects);

  const byId = new Map(projects.map((project) => [project.id, project]));
  const included = new Set<number>();
  for (const project of projects) {
    if (!project.path.toLowerCase().includes(normalized)) continue;
    let current: Project | undefined = project;
    while (current && !included.has(current.id)) {
      included.add(current.id);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
  }
  return orderProjectsAsTree(projects.filter((project) => included.has(project.id)));
}

export function projectBranchIds(projects: Project[], projectId: number) {
  const ids = new Set<number>([projectId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const project of projects) {
      if (project.parentId !== null && ids.has(project.parentId) && !ids.has(project.id)) {
        ids.add(project.id);
        changed = true;
      }
    }
  }
  return ids;
}

function projectDepthByParentChain(projects: Project[], projectId: number | null): number {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const seen = new Set<number>();
  let depth = 0;
  let cursor = projectId;
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    depth += 1;
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return depth;
}

function projectSubtreeHeight(projects: Project[], projectId: number): number {
  const children = projects.filter((project) => project.parentId === projectId);
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map((child) => projectSubtreeHeight(projects, child.id)));
}

/**
 * Mirrors the server's validateProjectParent (max 3 levels, no cycles) so the
 * UI can reject an invalid drop target before it ever highlights, instead of
 * optimistically reparenting and then flashing back on a 400.
 *
 * Depth is derived by walking parentId chains rather than trusting each
 * project's precomputed `depth` field: the client's optimistic move updates
 * parentId immediately but doesn't recompute depth for the moved subtree
 * until the follow-up refetch resolves, so a stale `depth` would otherwise
 * make this reject (or wrongly allow) drops right after any move.
 */
export function canPlaceProject(projects: Project[], moving: Project, parentId: number | null): boolean {
  if (parentId === moving.id) return false;
  const branch = projectBranchIds(projects, moving.id);
  if (parentId !== null && branch.has(parentId)) return false;
  const subtreeHeight = projectSubtreeHeight(projects, moving.id);
  const parentDepth = projectDepthByParentChain(projects, parentId);
  return parentDepth + subtreeHeight <= 3;
}

export function projectTreeText(project: Project, treeDepth = project.depth - 1) {
  return `${treeDepth > 0 ? `${"  ".repeat(treeDepth - 1)}↳ ` : ""}${project.name}`;
}
