import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { activeSession, uniqueActiveError } from "../session-helpers";
import { body, error, noContent } from "./http";
import { projectIdError, taskIdsError } from "./ownership";
import { MAX_DESCRIPTION_LENGTH, optionalTextError, periodStartError, plannedSessionDurationError } from "./validation";

type PlannedSessionRow = {
  id: number;
  date_key: string;
  project_id: number;
  estimated_seconds: number;
  description: string | null;
  sort_order: number;
};

function idsFrom(value: unknown) {
  return Array.isArray(value) ? Array.from(new Set(value.map(Number))) : [];
}

async function planById(userId: number, id: number) {
  const result = await db.execute({
    sql: `SELECT id, date_key, project_id, estimated_seconds, description, sort_order
          FROM planned_sessions WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
  return result.rows[0] as unknown as PlannedSessionRow | undefined;
}

async function plansForDay(userId: number, dateKey: string) {
  const plans = await db.execute({
    sql: `SELECT id, date_key, project_id, estimated_seconds, description, sort_order
          FROM planned_sessions WHERE user_id = ? AND date_key = ? ORDER BY sort_order, id`,
    args: [userId, dateKey],
  });
  const rows = plans.rows as unknown as PlannedSessionRow[];
  if (!rows.length) return [];
  const membership = await db.execute({
    sql: `SELECT planned_session_tasks.planned_session_id, tasks.id, tasks.period_start, tasks.project_id,
                 tasks.title, tasks.description, tasks.completed_at, tasks.sort_order
          FROM planned_session_tasks
          JOIN tasks ON tasks.id = planned_session_tasks.task_id
          WHERE planned_session_tasks.planned_session_id IN (${rows.map(() => "?").join(",")})
          ORDER BY tasks.sort_order, tasks.id`,
    args: rows.map((plan) => plan.id),
  });
  const tasksByPlan = new Map<number, unknown[]>();
  for (const task of membership.rows) {
    const planId = Number(task.planned_session_id);
    const tasks = tasksByPlan.get(planId) ?? [];
    tasks.push(task);
    tasksByPlan.set(planId, tasks);
  }
  return rows.map((plan) => ({ ...plan, tasks: tasksByPlan.get(plan.id) ?? [] }));
}

async function planWithTasks(userId: number, plan: PlannedSessionRow) {
  return (await plansForDay(userId, plan.date_key)).find((item) => item.id === plan.id) ?? null;
}

async function taskMembershipError(userId: number, taskIds: number[], targetDateKey: string, currentPlanId?: number, sourceDateKey?: string) {
  if (!taskIds.length) return null;
  const tasks = await db.execute({
    sql: `SELECT id, period_start, completed_at FROM tasks WHERE user_id = ? AND id IN (${taskIds.map(() => "?").join(",")})`,
    args: [userId, ...taskIds],
  });
  const allowedDates = new Set([targetDateKey, sourceDateKey].filter(Boolean));
  if (tasks.rows.length !== taskIds.length || tasks.rows.some((task) => task.completed_at !== null || !allowedDates.has(String(task.period_start)))) {
    return error("Planned sessions can only contain unfinished tasks from this day");
  }
  const assigned = await db.execute({
    sql: `SELECT planned_session_id FROM planned_session_tasks WHERE task_id IN (${taskIds.map(() => "?").join(",")})`,
    args: taskIds,
  });
  if (assigned.rows.some((row) => Number(row.planned_session_id) !== currentPlanId)) {
    return error("A task is already assigned to another planned session");
  }
  return null;
}

async function createPlan(userId: number, data: Record<string, unknown>) {
  const dateError = periodStartError(data.dateKey);
  if (dateError || typeof data.dateKey !== "string") return dateError ?? error("dateKey is required");
  if (data.projectId === undefined || data.projectId === null) return error("projectId is required");
  const projectError = await projectIdError(userId, data.projectId);
  if (projectError) return projectError;
  const durationError = plannedSessionDurationError(data.estimatedSeconds);
  if (durationError) return durationError;
  const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
  if (descriptionError) return descriptionError;
  const tasksError = await taskIdsError(userId, data.taskIds ?? []);
  if (tasksError) return tasksError;
  const taskIds = idsFrom(data.taskIds);
  const membershipError = await taskMembershipError(userId, taskIds, data.dateKey);
  if (membershipError) return membershipError;
  const nextOrder = await db.execute({ sql: "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM planned_sessions WHERE user_id = ? AND date_key = ?", args: [userId, data.dateKey] });
  const created = await db.batch([
    {
      sql: "INSERT INTO planned_sessions (user_id, date_key, project_id, estimated_seconds, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
      args: [userId, data.dateKey, Number(data.projectId), Number(data.estimatedSeconds), typeof data.description === "string" ? data.description.trim() || null : null, Number(nextOrder.rows[0].next_order)],
    },
    ...(taskIds.length ? [{
      sql: `INSERT INTO planned_session_tasks (planned_session_id, task_id) VALUES ${taskIds.map(() => "(last_insert_rowid(), ?)").join(",")}`,
      args: taskIds,
    }] : []),
  ], "write");
  const plan = await planById(userId, Number(created[0].lastInsertRowid));
  return NextResponse.json(await planWithTasks(userId, plan!), { status: 201 });
}

async function updatePlan(userId: number, id: number, data: Record<string, unknown>) {
  const existing = await planById(userId, id);
  if (!existing) return error("Planned session not found", 404);
  const dateKey = data.dateKey === undefined ? existing.date_key : data.dateKey;
  const dateError = periodStartError(dateKey);
  if (dateError || typeof dateKey !== "string") return dateError ?? error("dateKey is required");
  const projectId = data.projectId === undefined ? existing.project_id : data.projectId;
  const projectError = await projectIdError(userId, projectId);
  if (projectError) return projectError;
  const estimatedSeconds = data.estimatedSeconds === undefined ? existing.estimated_seconds : data.estimatedSeconds;
  const durationError = plannedSessionDurationError(estimatedSeconds);
  if (durationError) return durationError;
  const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
  if (descriptionError) return descriptionError;
  const existingTasks = await db.execute({ sql: "SELECT task_id FROM planned_session_tasks WHERE planned_session_id = ?", args: [id] });
  const taskIds = data.taskIds === undefined ? existingTasks.rows.map((row) => Number(row.task_id)) : idsFrom(data.taskIds);
  const tasksError = await taskIdsError(userId, taskIds);
  if (tasksError) return tasksError;
  const membershipError = await taskMembershipError(userId, taskIds, dateKey, id, existing.date_key);
  if (membershipError) return membershipError;
  const description = data.description === undefined ? existing.description : typeof data.description === "string" ? data.description.trim() || null : null;
  await db.batch([
    { sql: "UPDATE planned_sessions SET date_key = ?, project_id = ?, estimated_seconds = ?, description = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?", args: [dateKey, Number(projectId), Number(estimatedSeconds), description, id, userId] },
    { sql: "DELETE FROM planned_session_tasks WHERE planned_session_id = ?", args: [id] },
    ...taskIds.map((taskId) => ({ sql: "INSERT INTO planned_session_tasks (planned_session_id, task_id) VALUES (?, ?)", args: [id, taskId] })),
    ...(dateKey === existing.date_key ? [] : taskIds.map((taskId) => ({ sql: "UPDATE tasks SET period_start = ? WHERE id = ? AND user_id = ?", args: [dateKey, taskId, userId] }))),
  ], "write");
  const updated = await planById(userId, id);
  return NextResponse.json(await planWithTasks(userId, updated!));
}

async function startPlan(userId: number, id: number) {
  const plan = await planById(userId, id);
  if (!plan) return error("Planned session not found", 404);
  const membership = await db.execute({ sql: "SELECT task_id FROM planned_session_tasks WHERE planned_session_id = ?", args: [id] });
  const taskIds = membership.rows.map((row) => Number(row.task_id));
  const startedAt = new Date().toISOString();
  try {
    const result = await db.batch([
      { sql: "INSERT INTO sessions (user_id, started_at, description, project_id) VALUES (?, ?, ?, ?)", args: [userId, startedAt, plan.description, plan.project_id] },
      ...taskIds.map((taskId) => ({ sql: "INSERT INTO session_tasks (session_id, task_id) VALUES ((SELECT id FROM sessions WHERE user_id = ? AND ended_at IS NULL), ?)", args: [userId, taskId] })),
      { sql: "DELETE FROM planned_session_tasks WHERE planned_session_id = ?", args: [id] },
      { sql: "DELETE FROM planned_sessions WHERE id = ? AND user_id = ?", args: [id, userId] },
    ], "write");
    return NextResponse.json({ id: Number(result[0].lastInsertRowid), startedAt });
  } catch (caught) {
    if (!uniqueActiveError(caught)) throw caught;
    return NextResponse.json({ error: "A session is already in progress", session: await activeSession(userId) }, { status: 409 });
  }
}

export async function plannedSessionRoutes(request: NextRequest, parts: string[], userId: number) {
  const action = parts[1];
  if (!action && request.method === "GET") {
    const dateKey = request.nextUrl.searchParams.get("date");
    const dateError = periodStartError(dateKey);
    if (dateError || !dateKey) return dateError ?? error("date is required");
    return NextResponse.json(await plansForDay(userId, dateKey));
  }
  if (!action && request.method === "POST") return createPlan(userId, await body(request));
  if (action === "reorder" && request.method === "PATCH") {
    const data = await body(request);
    if (!Array.isArray(data.entries) || data.entries.some((entry) => !entry || !Number.isInteger(entry.id) || !Number.isInteger(entry.sortOrder) || entry.sortOrder < 0)) return error("entries must contain integer id and sortOrder values");
    await db.batch(data.entries.map((entry) => ({ sql: "UPDATE planned_sessions SET sort_order = ? WHERE id = ? AND user_id = ?", args: [entry.sortOrder, entry.id, userId] })), "write");
    return noContent();
  }
  const id = Number(action);
  if (!Number.isInteger(id)) return error("Not found", 404);
  if (parts[2] === "start" && request.method === "POST") return startPlan(userId, id);
  if (request.method === "PATCH") return updatePlan(userId, id, await body(request));
  if (request.method === "DELETE") {
    const existing = await planById(userId, id);
    if (!existing) return error("Planned session not found", 404);
    await db.batch([
      { sql: "DELETE FROM planned_session_tasks WHERE planned_session_id = ?", args: [id] },
      { sql: "DELETE FROM planned_sessions WHERE id = ? AND user_id = ?", args: [id, userId] },
    ], "write");
    return noContent();
  }
  return error("Not found", 404);
}
