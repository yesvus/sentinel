import { db } from "../db";
import { error } from "./http";

export async function projectIdError(userId: number, value: unknown) {
  if (value === undefined || value === null) return null;
  const projectId = Number(value);
  if (!Number.isInteger(projectId) || projectId < 1) return error("Invalid project");
  const project = await db.execute({
    sql: "SELECT 1 FROM projects WHERE id = ? AND user_id = ?",
    args: [projectId, userId],
  });
  return project.rows.length ? null : error("Project not found", 404);
}

export async function taskIdsError(userId: number, value: unknown) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return error("taskIds must be an array");
  if (value.length > 20) return error("Too many tasks selected");
  const ids = value.map(Number);
  if (ids.some((taskId) => !Number.isInteger(taskId) || taskId < 1)) return error("Invalid task id");
  if (!ids.length) return null;
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.execute({
    sql: `SELECT id FROM tasks WHERE user_id = ? AND id IN (${placeholders})`,
    args: [userId, ...ids],
  });
  return rows.rows.length === new Set(ids).size ? null : error("One or more tasks not found", 404);
}
