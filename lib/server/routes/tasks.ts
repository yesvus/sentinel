import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { body, error, noContent } from "./http";
import { projectIdError } from "./ownership";
import { MAX_DESCRIPTION_LENGTH, MAX_TASK_TITLE_LENGTH, optionalTextError, periodStartError } from "./validation";

const TASK_COLUMNS = "id, period_start, project_id, title, description, completed_at";

export async function taskRoutes(request: NextRequest, parts: string[], userId: number) {
  if (parts[1] === "backlog" && request.method === "POST") {
    const data = await body(request);
    if (typeof data.before !== "string" || /^\d{4}-\d{2}-\d{2}$/.test(data.before) === false) return error("before must be a YYYY-MM-DD date");
    const candidates = await db.execute({
      sql: `SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? AND period_start IS NOT NULL AND period_start < ? AND completed_at IS NULL ORDER BY created_at`,
      args: [userId, data.before],
    });
    await db.batch([
      { sql: "DELETE FROM session_tasks WHERE task_id IN (SELECT id FROM tasks WHERE user_id = ? AND period_start IS NOT NULL AND period_start < ? AND completed_at IS NULL)", args: [userId, data.before] },
      { sql: "UPDATE tasks SET period_start = NULL WHERE user_id = ? AND period_start IS NOT NULL AND period_start < ? AND completed_at IS NULL", args: [userId, data.before] },
    ], "write");
    return NextResponse.json({ moved: candidates.rows.map((task) => ({ ...task, period_start: null })) });
  }
  if (parts[1] === "backlog" && request.method === "GET") {
    const result = await db.execute({ sql: `SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? AND period_start IS NULL AND completed_at IS NULL ORDER BY created_at`, args: [userId] });
    return NextResponse.json(result.rows);
  }
  const id = parts[1] ? Number(parts[1]) : null;
  if (id === null && request.method === "GET") {
    const result = await db.execute({ sql: `SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? ORDER BY created_at`, args: [userId] });
    return NextResponse.json(result.rows);
  }
  if (id === null && request.method === "POST") {
    const data = await body(request);
    const periodStartInvalid = periodStartError(data.periodStart);
    if (periodStartInvalid) return periodStartInvalid;
    if (typeof data.title !== "string" || !data.title.trim()) return error("Title is required");
    if (data.title.trim().length > MAX_TASK_TITLE_LENGTH) return error(`Title must be at most ${MAX_TASK_TITLE_LENGTH} characters`);
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const invalidProject = await projectIdError(userId, data.projectId);
    if (invalidProject) return invalidProject;
    if (data.completed !== undefined && typeof data.completed !== "boolean") return error("completed must be a boolean");
    let attachedSessionId: number | null = null;
    if (data.sessionId !== undefined) {
      attachedSessionId = Number(data.sessionId);
      if (!Number.isInteger(attachedSessionId)) return error("sessionId must be an integer");
      const selectedSession = await db.execute({ sql: "SELECT ended_at FROM sessions WHERE id = ? AND user_id = ?", args: [attachedSessionId, userId] });
      if (!selectedSession.rows.length) return error("Session not found", 404);
      if (selectedSession.rows[0].ended_at !== null && data.completed !== true) return error("Tasks added to a completed session must be completed");
    }
    const completedAt = data.completed === true ? new Date().toISOString() : null;
    const results = await db.batch([
      {
        sql: "INSERT INTO tasks (user_id, period_start, project_id, title, description, completed_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [userId, data.periodStart as string | null ?? null, data.projectId == null ? null : Number(data.projectId), data.title.trim(), typeof data.description === "string" ? data.description.trim() || null : null, completedAt],
      },
      ...(attachedSessionId === null ? [] : [{
        sql: "INSERT INTO session_tasks (session_id, task_id) VALUES (?, last_insert_rowid())",
        args: [attachedSessionId],
      }]),
    ], "write");
    const taskId = Number(results[0].lastInsertRowid);
    const created = await db.execute({ sql: `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`, args: [taskId] });
    return NextResponse.json(created.rows[0], { status: 201 });
  }
  if (!Number.isInteger(id)) return error("Not found", 404);
  if (request.method === "PATCH") {
    const data = await body(request);
    const existing = await db.execute({ sql: "SELECT title, description, project_id, period_start, completed_at FROM tasks WHERE id = ? AND user_id = ?", args: [id!, userId] });
    const row = existing.rows[0];
    if (!row) return error("Task not found", 404);
    const title = data.title !== undefined ? (typeof data.title === "string" ? data.title.trim() : "") : row.title as string;
    if (!title) return error("Title is required");
    if (title.length > MAX_TASK_TITLE_LENGTH) return error(`Title must be at most ${MAX_TASK_TITLE_LENGTH} characters`);
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const description = data.description !== undefined ? (typeof data.description === "string" ? data.description.trim() || null : null) : row.description;
    if (data.projectId !== undefined) return error("A task's project is fixed at creation");
    const periodStartInvalid = periodStartError(data.periodStart);
    if (periodStartInvalid) return periodStartInvalid;
    const periodStart = data.periodStart !== undefined ? data.periodStart : row.period_start;
    if (data.completed !== undefined && typeof data.completed !== "boolean") return error("completed must be a boolean");
    const completedAt = data.completed !== undefined ? (data.completed ? new Date().toISOString() : null) : row.completed_at;
    let attachedSessionId: number | null = null;
    if (data.sessionId !== undefined) {
      attachedSessionId = Number(data.sessionId);
      if (!Number.isInteger(attachedSessionId)) return error("sessionId must be an integer");
      const selectedSession = await db.execute({ sql: "SELECT ended_at FROM sessions WHERE id = ? AND user_id = ?", args: [attachedSessionId, userId] });
      const sessionRow = selectedSession.rows[0];
      if (!sessionRow) return error("Session not found", 404);
      if (sessionRow.ended_at !== null) return error("Only an active session can accept tasks");
    }
    const statements = [
      { sql: "UPDATE tasks SET title = ?, description = ?, project_id = ?, period_start = ?, completed_at = ? WHERE id = ? AND user_id = ?", args: [title, description, row.project_id, periodStart as string | null, completedAt, id!, userId] },
      ...(data.periodStart === null ? [{ sql: "DELETE FROM session_tasks WHERE task_id = ?", args: [id!] }] : []),
      ...(attachedSessionId === null ? [] : [{ sql: "INSERT OR IGNORE INTO session_tasks (session_id, task_id) VALUES (?, ?)", args: [attachedSessionId, id!] }]),
    ];
    await db.batch(statements, "write");
    const updated = await db.execute({ sql: `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`, args: [id!] });
    return NextResponse.json(updated.rows[0]);
  }
  if (request.method === "DELETE") {
    const owned = await db.execute({ sql: "SELECT 1 FROM tasks WHERE id = ? AND user_id = ?", args: [id!, userId] });
    if (!owned.rows.length) return error("Task not found", 404);
    await db.batch([
      { sql: "DELETE FROM session_tasks WHERE task_id = ?", args: [id!] },
      { sql: "DELETE FROM tasks WHERE id = ? AND user_id = ?", args: [id!, userId] },
    ], "write");
    return noContent();
  }
  return error("Not found", 404);
}
