import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { body, error, noContent } from "./http";
import { projectIdError, taskIdsError } from "./ownership";
import { MAX_DESCRIPTION_LENGTH, optionalTextError, periodStartError, productionPercentageError } from "./validation";

function sessionCursor(startedAt: string, id: number) {
  return Buffer.from(JSON.stringify([startedAt, id])).toString("base64url");
}

function parseSessionCursor(cursor: string | null): [string, number] | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown;
    if (Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "number" && Number.isInteger(value[1])) return [value[0], value[1]];
  } catch {}
  return null;
}

async function finalizeExpiredPause(userId: number, sessionId?: number) {
  const result = await db.execute({
    sql: `SELECT sessions.id, sessions.started_at, sessions.paused_at, sessions.paused_seconds,
                 users.session_pause_timeout_minutes
          FROM sessions JOIN users ON users.id = sessions.user_id
          WHERE sessions.user_id = ? AND sessions.ended_at IS NULL AND sessions.paused_at IS NOT NULL
          ${sessionId === undefined ? "" : "AND sessions.id = ?"}
          LIMIT 1`,
    args: sessionId === undefined ? [userId] : [userId, sessionId],
  });
  const session = result.rows[0];
  if (!session) return null;
  const pausedAt = new Date(session.paused_at as string).getTime();
  const timeoutSeconds = Number(session.session_pause_timeout_minutes ?? 30) * 60;
  const endedAt = pausedAt + timeoutSeconds * 1000;
  if (endedAt > Date.now()) return null;
  const pausedSeconds = Number(session.paused_seconds ?? 0) + timeoutSeconds;
  const durationSeconds = Math.max(0, Math.round((endedAt - new Date(session.started_at as string).getTime()) / 1000) - pausedSeconds);
  await db.batch([
    {
      sql: "UPDATE sessions SET ended_at = ?, duration_seconds = ?, paused_at = NULL, paused_seconds = ? WHERE id = ? AND user_id = ? AND ended_at IS NULL",
      args: [new Date(endedAt).toISOString(), durationSeconds, pausedSeconds, Number(session.id), userId],
    },
    {
      sql: "DELETE FROM session_tasks WHERE session_id = ? AND task_id IN (SELECT id FROM tasks WHERE user_id = ? AND completed_at IS NULL)",
      args: [Number(session.id), userId],
    },
  ], "write");
  return { id: Number(session.id), endedAt: new Date(endedAt).toISOString(), durationSeconds };
}

async function activeSession(userId: number) {
  await finalizeExpiredPause(userId);
  const result = await db.execute({
    sql: `SELECT sessions.id, sessions.started_at, sessions.ended_at,
                 sessions.duration_seconds, sessions.description, sessions.production_percentage,
                 sessions.paused_at, sessions.paused_seconds,
                 project_id, projects.name AS project_name, projects.icon AS project_icon,
                 projects.archived AS project_archived,
                 CASE WHEN grandparent.id IS NOT NULL THEN grandparent.name || ' / ' || parent.name || ' / ' || projects.name
                      WHEN parent.id IS NOT NULL THEN parent.name || ' / ' || projects.name ELSE projects.name END AS project_path,
                 COALESCE(grandparent.id, parent.id, projects.id) AS root_project_id,
                 COALESCE(grandparent.name, parent.name, projects.name) AS root_project_name,
                 COALESCE(grandparent.icon, parent.icon, projects.icon) AS root_project_icon
          FROM sessions LEFT JOIN projects ON projects.id = sessions.project_id AND projects.user_id = sessions.user_id
          LEFT JOIN projects parent ON parent.id = projects.parent_id AND parent.user_id = sessions.user_id
          LEFT JOIN projects grandparent ON grandparent.id = parent.parent_id AND grandparent.user_id = sessions.user_id
          WHERE sessions.user_id = ? AND sessions.ended_at IS NULL`,
    args: [userId],
  });
  return result.rows[0] ?? null;
}

function uniqueActiveError(value: unknown) {
  return value instanceof Error && "code" in value && (value as { code?: string }).code === "SQLITE_CONSTRAINT" && value.message.includes("sessions.user_id");
}

export async function sessionRoutes(request: NextRequest, parts: string[], userId: number) {
  const action = parts[1];
  if (action === "active" && request.method === "GET") return NextResponse.json(await activeSession(userId));
  if (action === "start" && request.method === "POST") {
    const data = await body(request);
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const invalidProject = await projectIdError(userId, data.projectId);
    if (invalidProject) return invalidProject;
    const invalidTasks = await taskIdsError(userId, data.taskIds);
    if (invalidTasks) return invalidTasks;
    const taskPeriodStartInvalid = periodStartError(data.taskPeriodStart);
    if (taskPeriodStartInvalid) return taskPeriodStartInvalid;
    const startedAt = new Date().toISOString();
    try {
      const uniqueTaskIds = new Set<number>();
      if (Array.isArray(data.taskIds)) for (const rawTaskId of data.taskIds) uniqueTaskIds.add(Number(rawTaskId));
      const taskIds = Array.from(uniqueTaskIds);
      const results = await db.batch([
        {
          sql: "INSERT INTO sessions (user_id, started_at, description, project_id) VALUES (?, ?, ?, ?)",
          args: [userId, startedAt, data.description as string | null ?? null, data.projectId == null ? null : Number(data.projectId)],
        },
        ...(taskIds.length ? [{
          sql: `INSERT INTO session_tasks (session_id, task_id)
                SELECT (SELECT id FROM sessions WHERE user_id = ? AND ended_at IS NULL), id
                FROM tasks WHERE user_id = ? AND id IN (${taskIds.map(() => "?").join(",")})`,
          args: [userId, userId, ...taskIds],
        }] : []),
      ], "write");
      const sessionId = Number(results[0].lastInsertRowid);
      return NextResponse.json({ id: sessionId, startedAt }, { status: 201 });
    } catch (caught) {
      if (!uniqueActiveError(caught)) throw caught;
      return NextResponse.json({ error: "A session is already in progress", session: await activeSession(userId) }, { status: 409 });
    }
  }
  if (!action && request.method === "GET") {
    await finalizeExpiredPause(userId);
    const requestedLimit = request.nextUrl.searchParams.get("limit");
    const limit = requestedLimit ? Number(requestedLimit) : null;
    if (requestedLimit && (!Number.isInteger(limit) || limit! < 1 || limit! > 100)) return error("limit must be an integer between 1 and 100");
    const cursorParam = request.nextUrl.searchParams.get("cursor");
    const cursor = parseSessionCursor(cursorParam);
    if (cursorParam && !cursor) return error("Invalid session cursor");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    if ((from && Number.isNaN(new Date(from).getTime())) || (to && Number.isNaN(new Date(to).getTime()))) return error("from and to must be valid dates");
    const cursorClause = cursor ? "AND (sessions.started_at < ? OR (sessions.started_at = ? AND sessions.id < ?))" : "";
    const rangeClause = `${from ? "AND sessions.started_at >= ?" : ""} ${to ? "AND sessions.started_at < ?" : ""}`;
    const args: (string | number)[] = [userId];
    if (from) args.push(new Date(from).toISOString());
    if (to) args.push(new Date(to).toISOString());
    if (cursor) args.push(cursor[0], cursor[0], cursor[1]);
    if (limit !== null) args.push(limit + 1);
    const result = await db.execute({
      sql: `SELECT sessions.id, sessions.started_at, sessions.ended_at,
                   sessions.duration_seconds, sessions.description, sessions.production_percentage,
                   sessions.paused_at, sessions.paused_seconds,
                   project_id, projects.name AS project_name, projects.icon AS project_icon,
                   projects.archived AS project_archived,
                   CASE WHEN grandparent.id IS NOT NULL THEN grandparent.name || ' / ' || parent.name || ' / ' || projects.name
                        WHEN parent.id IS NOT NULL THEN parent.name || ' / ' || projects.name ELSE projects.name END AS project_path,
                   COALESCE(grandparent.id, parent.id, projects.id) AS root_project_id,
                   COALESCE(grandparent.name, parent.name, projects.name) AS root_project_name,
                   COALESCE(grandparent.icon, parent.icon, projects.icon) AS root_project_icon
            FROM sessions LEFT JOIN projects ON projects.id = sessions.project_id AND projects.user_id = sessions.user_id
            LEFT JOIN projects parent ON parent.id = projects.parent_id AND parent.user_id = sessions.user_id
            LEFT JOIN projects grandparent ON grandparent.id = parent.parent_id AND grandparent.user_id = sessions.user_id
            WHERE sessions.user_id = ? ${rangeClause} ${cursorClause}
            ORDER BY sessions.started_at DESC, sessions.id DESC
            ${limit !== null ? "LIMIT ?" : ""}`,
      args,
    });
    if (limit !== null) {
      const hasMore = result.rows.length > limit;
      const items = result.rows.slice(0, limit);
      const last = items.at(-1);
      return NextResponse.json({ items, nextCursor: hasMore && last ? sessionCursor(last.started_at as string, Number(last.id)) : null });
    }
    return NextResponse.json(result.rows);
  }
  if (!action && request.method === "POST") {
    const data = await body(request);
    const allocationError = productionPercentageError(data.productionPercentage);
    if (allocationError) return allocationError;
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const invalidProject = await projectIdError(userId, data.projectId);
    if (invalidProject) return invalidProject;
    if (typeof data.startedAt !== "string" || typeof data.endedAt !== "string") return error("startedAt and endedAt are required");
    const start = new Date(data.startedAt);
    const end = new Date(data.endedAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return error("startedAt and endedAt must be valid dates");
    if (end <= start) return error("endedAt must be after startedAt");
    const durationSeconds = Math.round((end.getTime() - start.getTime()) / 1000);
    const result = await db.execute({
      sql: "INSERT INTO sessions (user_id, started_at, ended_at, duration_seconds, description, project_id, production_percentage) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [userId, start.toISOString(), end.toISOString(), durationSeconds, data.description as string | null ?? null, data.projectId == null ? null : Number(data.projectId), data.productionPercentage as number | null ?? null],
    });
    return NextResponse.json({ id: Number(result.lastInsertRowid), startedAt: start.toISOString(), endedAt: end.toISOString(), durationSeconds, productionPercentage: data.productionPercentage ?? null }, { status: 201 });
  }

  const id = Number(action);
  if (!Number.isInteger(id)) return error("Not found", 404);
  if (parts[2] === "pause" && request.method === "PATCH") {
    await finalizeExpiredPause(userId, id);
    const existing = await db.execute({ sql: "SELECT paused_at, paused_seconds FROM sessions WHERE id = ? AND user_id = ? AND ended_at IS NULL", args: [id, userId] });
    const session = existing.rows[0];
    if (!session) return error("Active session not found", 404);
    const pausedAt = session.paused_at ?? new Date().toISOString();
    if (session.paused_at === null) await db.execute({ sql: "UPDATE sessions SET paused_at = ? WHERE id = ? AND user_id = ? AND ended_at IS NULL AND paused_at IS NULL", args: [pausedAt, id, userId] });
    return NextResponse.json({ id, pausedAt, pausedSeconds: Number(session.paused_seconds ?? 0) });
  }
  if (parts[2] === "resume" && request.method === "PATCH") {
    const expired = await finalizeExpiredPause(userId, id);
    if (expired) return error("Session ended after reaching the pause limit", 409);
    const existing = await db.execute({ sql: "SELECT paused_at, paused_seconds FROM sessions WHERE id = ? AND user_id = ? AND ended_at IS NULL", args: [id, userId] });
    const session = existing.rows[0];
    if (!session) return error("Active session not found", 404);
    const previousPausedSeconds = Number(session.paused_seconds ?? 0);
    if (session.paused_at === null) return NextResponse.json({ id, pausedAt: null, pausedSeconds: previousPausedSeconds });
    const pausedSeconds = previousPausedSeconds + Math.max(0, Math.round((Date.now() - new Date(session.paused_at as string).getTime()) / 1000));
    await db.execute({ sql: "UPDATE sessions SET paused_at = NULL, paused_seconds = ? WHERE id = ? AND user_id = ? AND ended_at IS NULL", args: [pausedSeconds, id, userId] });
    return NextResponse.json({ id, pausedAt: null, pausedSeconds });
  }
  if (parts[2] === "expire-pause" && request.method === "PATCH") {
    const expired = await finalizeExpiredPause(userId, id);
    if (expired) return NextResponse.json({ ended: true, ...expired });
    const existing = await db.execute({ sql: "SELECT ended_at, duration_seconds FROM sessions WHERE id = ? AND user_id = ?", args: [id, userId] });
    if (!existing.rows[0]) return error("Session not found", 404);
    if (existing.rows[0].ended_at !== null) return NextResponse.json({ ended: true, endedAt: existing.rows[0].ended_at, durationSeconds: Number(existing.rows[0].duration_seconds ?? 0) });
    return NextResponse.json({ ended: false });
  }
  if (parts[2] === "stop" && request.method === "PATCH") {
    const expired = await finalizeExpiredPause(userId, id);
    if (expired) return error("Session ended after reaching the pause limit", 409);
    const data = await body(request);
    const allocationError = productionPercentageError(data.productionPercentage);
    if (allocationError) return allocationError;
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const existing = await db.execute({ sql: "SELECT started_at, ended_at, description, paused_at, paused_seconds FROM sessions WHERE id = ? AND user_id = ?", args: [id, userId] });
    if (!existing.rows[0]) return error("Session not found", 404);
    if (existing.rows[0].ended_at !== null) return error("Session already ended", 409);
    const endedAt = new Date();
    const currentPauseSeconds = existing.rows[0].paused_at === null ? 0 : Math.max(0, Math.round((endedAt.getTime() - new Date(existing.rows[0].paused_at as string).getTime()) / 1000));
    const pausedSeconds = Number(existing.rows[0].paused_seconds ?? 0) + currentPauseSeconds;
    const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - new Date(existing.rows[0].started_at as string).getTime()) / 1000) - pausedSeconds);
    const description = data.description !== undefined ? data.description : existing.rows[0].description;
    await db.batch([
      {
        sql: "UPDATE sessions SET ended_at = ?, duration_seconds = ?, description = ?, production_percentage = ?, paused_at = NULL, paused_seconds = ? WHERE id = ? AND user_id = ?",
        args: [endedAt.toISOString(), durationSeconds, description as string | null ?? null, data.productionPercentage as number | null ?? null, pausedSeconds, id, userId],
      },
      {
        sql: "DELETE FROM session_tasks WHERE session_id = ? AND task_id IN (SELECT id FROM tasks WHERE user_id = ? AND completed_at IS NULL)",
        args: [id, userId],
      },
    ], "write");
    return NextResponse.json({ id, endedAt: endedAt.toISOString(), durationSeconds, description: description ?? null, productionPercentage: data.productionPercentage ?? null });
  }
  if (request.method === "DELETE") {
    const existing = await db.execute({ sql: "SELECT 1 FROM sessions WHERE id = ? AND user_id = ?", args: [id, userId] });
    if (!existing.rows.length) return error("Session not found", 404);
    await db.batch([
      { sql: "DELETE FROM session_tasks WHERE session_id = ?", args: [id] },
      { sql: "DELETE FROM sessions WHERE id = ? AND user_id = ?", args: [id, userId] },
    ], "write");
    return noContent();
  }
  if (request.method === "PATCH") return updateSession(request, id, userId);
  return error("Not found", 404);
}

async function updateSession(request: NextRequest, id: number, userId: number) {
  const data = await body(request);
  const allocationError = productionPercentageError(data.productionPercentage);
  if (allocationError) return allocationError;
  const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
  if (descriptionError) return descriptionError;
  const invalidProject = await projectIdError(userId, data.projectId);
  if (invalidProject) return invalidProject;
  const invalidTasks = await taskIdsError(userId, data.taskIds);
  if (invalidTasks) return invalidTasks;
  const existing = await db.execute({ sql: "SELECT started_at, ended_at, description, project_id, production_percentage, paused_at, paused_seconds FROM sessions WHERE id = ? AND user_id = ?", args: [id, userId] });
  const session = existing.rows[0];
  if (!session) return error("Session not found", 404);
  const start = new Date((data.startedAt ?? session.started_at) as string);
  const wasActive = session.ended_at === null;
  const end = data.endedAt === null ? null : data.endedAt !== undefined ? new Date(data.endedAt as string) : wasActive ? null : new Date(session.ended_at as string);
  if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) return error("startedAt and endedAt must be valid dates");
  if (end === null && start.getTime() > Date.now()) return error("startedAt cannot be in the future");
  if (!wasActive && end === null && Date.now() - start.getTime() > 12 * 60 * 60 * 1000) {
    return error("Sessions started more than 12 hours ago cannot be marked ongoing");
  }
  if (end && end <= start) return error("endedAt must be after startedAt");
  const selectedTaskIds: number[] | null = Array.isArray(data.taskIds) ? Array.from(new Set<number>(data.taskIds.map((value: unknown) => Number(value)))) : null;
  if (selectedTaskIds && end === null) return error("Completed tasks can only be assigned to a completed session");
  let selectedTasks: Array<{ id: number; completed_at: string | null; period_start: string | null }> = [];
  if (selectedTaskIds?.length) {
    const placeholders = selectedTaskIds.map(() => "?").join(",");
    const selected = await db.execute({ sql: `SELECT id, completed_at, period_start FROM tasks WHERE user_id = ? AND id IN (${placeholders})`, args: [userId, ...selectedTaskIds] });
    selectedTasks = selected.rows.map((row) => ({ id: Number(row.id), completed_at: row.completed_at as string | null, period_start: row.period_start as string | null }));
    if (selectedTasks.some((task) => task.completed_at === null && task.period_start !== null)) return error("Only completed tasks or Backlog tasks can be assigned to a completed session");
    if (selectedTasks.some((task) => task.completed_at === null) && typeof data.taskPeriodStart !== "string") return error("taskPeriodStart is required when assigning Backlog tasks");
  }
  const pausedSeconds = Number(session.paused_seconds ?? 0);
  const durationSeconds = end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000) - pausedSeconds) : null;
  const description = data.description !== undefined ? data.description : session.description;
  const projectId = data.projectId !== undefined ? (data.projectId === null ? null : Number(data.projectId)) : session.project_id;
  const productionPercentage = end === null ? null : data.productionPercentage !== undefined ? data.productionPercentage : session.production_percentage;
  let attachedTasks: Record<string, unknown>[] | undefined;
  let changedTasks: Record<string, unknown>[] | undefined;
  try {
    const statements = [
      { sql: "UPDATE sessions SET description = ?, project_id = ?, started_at = ?, ended_at = ?, duration_seconds = ?, production_percentage = ? WHERE id = ? AND user_id = ?", args: [description as string | null ?? null, projectId ?? null, start.toISOString(), end?.toISOString() ?? null, durationSeconds, productionPercentage as number | null ?? null, id, userId] },
    ];
    if (selectedTaskIds) {
      const backlogTaskIds = selectedTasks.filter((task) => task.completed_at === null).map((task) => task.id);
      if (backlogTaskIds.length) {
        const placeholders = backlogTaskIds.map(() => "?").join(",");
        statements.push({ sql: `UPDATE tasks SET completed_at = ?, period_start = ? WHERE user_id = ? AND id IN (${placeholders})`, args: [new Date().toISOString(), data.taskPeriodStart as string, userId, ...backlogTaskIds] });
      }
      statements.push({ sql: "DELETE FROM session_tasks WHERE session_id = ?", args: [id] });
      for (const taskId of selectedTaskIds) statements.push({ sql: "INSERT INTO session_tasks (session_id, task_id) VALUES (?, ?)", args: [id, taskId] });
      await db.batch(statements, "write");
      if (selectedTaskIds.length) {
        const placeholders = selectedTaskIds.map(() => "?").join(",");
        const authoritative = await db.execute({ sql: `SELECT id, period_start, project_id, title, description, completed_at FROM tasks WHERE user_id = ? AND id IN (${placeholders})`, args: [userId, ...selectedTaskIds] });
        const byId = new Map<number, Record<string, unknown>>(authoritative.rows.map((task) => [Number(task.id), task as Record<string, unknown>]));
        attachedTasks = selectedTaskIds.map((taskId) => byId.get(taskId)).filter((task): task is Record<string, unknown> => task !== undefined);
        const changedIds = new Set(backlogTaskIds);
        changedTasks = attachedTasks.filter((task) => changedIds.has(Number(task.id)));
      } else {
        attachedTasks = [];
        changedTasks = [];
      }
    } else {
      await db.batch(statements, "write");
    }
  } catch (caught) {
    if (!uniqueActiveError(caught)) throw caught;
    return NextResponse.json({ error: "A session is already in progress", session: await activeSession(userId) }, { status: 409 });
  }
  return NextResponse.json({
    id, description: description ?? null, projectId: projectId ?? null, startedAt: start.toISOString(), endedAt: end?.toISOString() ?? null, durationSeconds,
    productionPercentage: productionPercentage ?? null, pausedAt: session.paused_at ?? null, pausedSeconds,
    activeSession: await activeSession(userId),
    ...(attachedTasks === undefined ? {} : { attachedTasks, changedTasks }),
  });
}
