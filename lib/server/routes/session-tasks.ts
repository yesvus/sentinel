import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { error } from "./http";

export async function sessionTaskRoutes(request: NextRequest, parts: string[], userId: number) {
  const id = Number(parts[1]);
  if (!Number.isInteger(id) || parts[2] !== "tasks" || request.method !== "GET") {
    return error("Not found", 404);
  }
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
