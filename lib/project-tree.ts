import type { Project } from "@/lib/api";

export type ProjectTreeItem = {
  project: Project;
  treeDepth: number;
  childCount: number;
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
      ordered.push({
        project,
        treeDepth,
        childCount: (children.get(project.id) ?? []).length,
      });
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

export function projectTreeText(project: Project, treeDepth = project.depth - 1) {
  return `${treeDepth > 0 ? `${"  ".repeat(treeDepth - 1)}↳ ` : ""}${project.name}`;
}
