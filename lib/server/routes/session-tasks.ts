import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { error } from "./http";

export async function sessionTaskRoutes(request: NextRequest, parts: string[], userId: number) {
  const id = Number(parts[1]);
  if (!Number.isInteger(id) || parts[2] !== "tasks") {
    return error("Not found", 404);
  }
  if (request.method === "DELETE") {
    const taskId = Number(parts[3]);
    if (!Number.isInteger(taskId)) return error("Not found", 404);
    const active = await db.execute({
      sql: "SELECT 1 FROM sessions WHERE id = ? AND user_id = ? AND ended_at IS NULL",
      args: [id, userId],
    });
    if (!active.rows.length) return error("Active session not found", 404);
    await db.execute({
      sql: "DELETE FROM session_tasks WHERE session_id = ? AND task_id = ?",
      args: [id, taskId],
    });
    return new NextResponse(null, { status: 204 });
  }
  if (request.method !== "GET" || parts[3] !== undefined) return error("Not found", 404);
  const result = await db.execute({
    sql: `SELECT tasks.id, tasks.period_start, tasks.project_id, tasks.title, tasks.description, tasks.completed_at
          FROM session_tasks
          JOIN tasks ON tasks.id = session_tasks.task_id
          JOIN sessions ON sessions.id = session_tasks.session_id
          WHERE session_tasks.session_id = ? AND sessions.user_id = ?
          ORDER BY tasks.id`,
    args: [id, userId],
  });
  return NextResponse.json(result.rows);
}
