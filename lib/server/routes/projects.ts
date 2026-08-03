import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { body, error, noContent } from "./http";
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, MAX_PROJECT_RESOURCES_LENGTH, optionalTextError } from "./validation";

const PROJECT_ICON_TYPES = new Set(["book", "code", "calculator", "flask", "music", "dumbbell", "globe", "pen", "briefcase", "palette", "languages", "atom"]);

type ProjectRow = {
  id: number; name: string; icon: string | null; description: string | null; resources: string | null;
  parent_id: number | null; pinned: number; archived: number; sort_order: number; last_used_at: string | null;
};

async function userProjects(userId: number) {
  const result = await db.execute({
    sql: `SELECT projects.id, projects.name, projects.icon, projects.description, projects.resources,
                 projects.parent_id, projects.pinned, projects.archived, projects.sort_order,
                 MAX(sessions.started_at) AS last_used_at
          FROM projects LEFT JOIN sessions ON sessions.project_id = projects.id
          WHERE projects.user_id = ? GROUP BY projects.id`,
    args: [userId],
  });
  return result.rows.map((row) => ({
    ...row, id: Number(row.id), parent_id: row.parent_id === null ? null : Number(row.parent_id),
    pinned: Number(row.pinned), archived: Number(row.archived), sort_order: Number(row.sort_order),
  })) as unknown as ProjectRow[];
}

function decorateProjects(rows: ProjectRow[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathFor = (row: ProjectRow) => {
    const names = [row.name];
    let parentId = row.parent_id;
    const seen = new Set([row.id]);
    while (parentId !== null && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parent_id;
    }
    return names;
  };
  return rows.map((row) => {
    const names = pathFor(row);
    return {
      id: row.id, name: row.name, icon: row.icon, description: row.description, resources: row.resources,
      parentId: row.parent_id, pinned: Boolean(row.pinned), archived: Boolean(row.archived),
      path: names.join(" / "), depth: names.length, sortOrder: row.sort_order, lastUsedAt: row.last_used_at,
    };
  }).sort((a, b) => a.depth - b.depth || Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder || a.path.localeCompare(b.path));
}

function validateProjectParent(rows: ProjectRow[], id: number | null, parentId: number | null) {
  if (parentId === null) return null;
  if (parentId === id) return "A project cannot be its own parent";
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (!byId.has(parentId)) return "Parent project not found";
  let depth = 1;
  let cursor: number | null = parentId;
  const ancestors = new Set<number>();
  while (cursor !== null) {
    if (cursor === id) return "A project cannot be moved below its descendant";
    if (ancestors.has(cursor)) return "Project hierarchy contains a cycle";
    ancestors.add(cursor);
    cursor = byId.get(cursor)?.parent_id ?? null;
    depth += 1;
  }
  const descendants = (projectId: number): number =>
    1 + Math.max(0, ...rows.filter((row) => row.parent_id === projectId).map((row) => descendants(row.id)));
  const subtreeDepth = id === null ? 1 : descendants(id);
  return depth - 1 + subtreeDepth > 3 ? "Projects can be nested to a maximum of three levels" : null;
}

export async function projectRoutes(request: NextRequest, parts: string[], userId: number) {
  const id = parts[1] ? Number(parts[1]) : null;
  if (id === null && request.method === "GET") return NextResponse.json(decorateProjects(await userProjects(userId)));
  if (id === null && request.method === "POST") {
    const data = await body(request);
    if (typeof data.name !== "string" || !data.name.trim()) return error("Name is required");
    if (data.name.trim().length > MAX_NAME_LENGTH) return error(`Name must be at most ${MAX_NAME_LENGTH} characters`);
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const resourcesError = optionalTextError(data.resources, "Resources", MAX_PROJECT_RESOURCES_LENGTH);
    if (resourcesError) return resourcesError;
    if (data.icon !== undefined && data.icon !== null && !PROJECT_ICON_TYPES.has(data.icon as string)) return error("Invalid project icon");
    if (data.pinned !== undefined && typeof data.pinned !== "boolean") return error("pinned must be a boolean");
    const parentId = data.parentId == null ? null : Number(data.parentId);
    const rows = await userProjects(userId);
    const parentError = validateProjectParent(rows, null, parentId);
    if (parentError) return error(parentError);
    if (rows.some((row) => row.parent_id === parentId && row.name.toLowerCase() === data.name!.toString().trim().toLowerCase())) return error("A project with this name already exists under that parent", 409);
    const description = typeof data.description === "string" ? data.description.trim() || null : null;
    const resources = typeof data.resources === "string" ? data.resources.trim() || null : null;
    const siblingOrders = rows.filter((row) => row.parent_id === parentId && !row.pinned).map((row) => row.sort_order);
    const sortOrder = siblingOrders.length ? Math.max(...siblingOrders) + 1 : 0;
    const result = await db.execute({
      sql: "INSERT INTO projects (user_id, name, icon, description, resources, parent_id, pinned, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [userId, data.name.trim(), data.icon as string | null ?? null, description, resources, parentId, data.pinned ? 1 : 0, sortOrder],
    });
    const projects = decorateProjects(await userProjects(userId));
    return NextResponse.json(projects.find((project) => project.id === Number(result.lastInsertRowid)), { status: 201 });
  }
  if (!Number.isInteger(id)) return error("Not found", 404);
  if (request.method === "PATCH") {
    const data = await body(request);
    const rows = await userProjects(userId);
    const existing = rows.find((row) => row.id === id);
    if (!existing) return error("Project not found", 404);
    const parentId = data.parentId !== undefined ? (data.parentId === null ? null : Number(data.parentId)) : existing.parent_id;
    const parentError = validateProjectParent(rows, id, parentId);
    if (parentError) return error(parentError);
    const name = data.name !== undefined ? (typeof data.name === "string" ? data.name.trim() : "") : existing.name;
    if (!name) return error("Name is required");
    if (name.length > MAX_NAME_LENGTH) return error(`Name must be at most ${MAX_NAME_LENGTH} characters`);
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const resourcesError = optionalTextError(data.resources, "Resources", MAX_PROJECT_RESOURCES_LENGTH);
    if (resourcesError) return resourcesError;
    if (data.icon !== undefined && data.icon !== null && !PROJECT_ICON_TYPES.has(data.icon as string)) return error("Invalid project icon");
    if (data.pinned !== undefined && typeof data.pinned !== "boolean") return error("pinned must be a boolean");
    if (data.archived !== undefined && typeof data.archived !== "boolean") return error("archived must be a boolean");
    if (data.position !== undefined && (!Number.isInteger(data.position) || Number(data.position) < 0)) return error("position must be a non-negative integer");
    if (rows.some((row) => row.id !== id && row.parent_id === parentId && row.name.toLowerCase() === name.toLowerCase())) return error("A project with this name already exists under that parent", 409);
    const description = data.description !== undefined ? (typeof data.description === "string" ? data.description.trim() || null : null) : existing.description;
    const resources = data.resources !== undefined ? (typeof data.resources === "string" ? data.resources.trim() || null : null) : existing.resources;
    const archived = data.archived !== undefined ? Boolean(data.archived) : Boolean(existing.archived);
    const targetPinned = data.pinned !== undefined ? Boolean(data.pinned) : Boolean(existing.pinned);
    const targetSiblings = rows.filter((row) => row.id !== id && row.parent_id === parentId && Boolean(row.pinned) === targetPinned).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const targetPosition = data.position !== undefined ? Math.min(Number(data.position), targetSiblings.length) : existing.parent_id === parentId && Boolean(existing.pinned) === targetPinned ? Math.min(existing.sort_order, targetSiblings.length) : targetSiblings.length;
    targetSiblings.splice(targetPosition, 0, existing);
    for (let position = 0; position < targetSiblings.length; position += 1) {
      if (targetSiblings[position].id === id) continue;
      await db.execute({ sql: "UPDATE projects SET sort_order = ? WHERE id = ? AND user_id = ?", args: [position, targetSiblings[position].id, userId] });
    }
    const result = await db.execute({
      sql: "UPDATE projects SET name = ?, icon = ?, description = ?, resources = ?, parent_id = ?, pinned = ?, archived = ?, sort_order = ? WHERE id = ? AND user_id = ?",
      args: [name, data.icon !== undefined ? data.icon as string | null : existing.icon, description, resources, parentId, data.pinned !== undefined ? (data.pinned ? 1 : 0) : existing.pinned, archived ? 1 : 0, targetPosition, id!, userId],
    });
    if (!result.rowsAffected) return error("Project not found", 404);
    if (data.archived !== undefined) {
      const descendants = new Set<number>([id!]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) if (row.parent_id !== null && descendants.has(row.parent_id) && !descendants.has(row.id)) { descendants.add(row.id); changed = true; }
      }
      for (const descendantId of descendants) await db.execute({ sql: "UPDATE projects SET archived = ? WHERE id = ? AND user_id = ?", args: [archived ? 1 : 0, descendantId, userId] });
    }
    return NextResponse.json(decorateProjects(await userProjects(userId)).find((project) => project.id === id));
  }
  if (request.method === "DELETE") {
    const rows = await userProjects(userId);
    const existing = rows.find((row) => row.id === id);
    if (!existing) return error("Project not found", 404);
    if (!existing.archived) return error("Archive this project before deleting it", 409);
    const branch = new Set<number>([id!]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) if (row.parent_id !== null && branch.has(row.parent_id) && !branch.has(row.id)) { branch.add(row.id); changed = true; }
    }
    const branchRows = rows.filter((row) => branch.has(row.id)).sort((a, b) => {
      const depth = (row: ProjectRow) => decorateProjects(rows).find((project) => project.id === row.id)?.depth ?? 1;
      return depth(b) - depth(a);
    });
    if (branchRows.some((row) => !row.archived)) return error("Restore or archive the entire project branch before deleting it", 409);
    const branchIds = branchRows.map((row) => row.id);
    const placeholders = branchIds.map(() => "?").join(", ");
    await db.batch([
      { sql: `DELETE FROM session_tasks WHERE task_id IN (SELECT id FROM tasks WHERE user_id = ? AND project_id IN (${placeholders}))`, args: [userId, ...branchIds] },
      { sql: `DELETE FROM tasks WHERE user_id = ? AND project_id IN (${placeholders})`, args: [userId, ...branchIds] },
      { sql: `UPDATE sessions SET project_id = NULL WHERE user_id = ? AND project_id IN (${placeholders})`, args: [userId, ...branchIds] },
      ...branchRows.map((row) => ({ sql: "DELETE FROM projects WHERE id = ? AND user_id = ?", args: [row.id, userId] })),
    ], "write");
    return noContent();
  }
  return error("Not found", 404);
}
