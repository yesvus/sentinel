import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { error } from "./http";

function dateKeyInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDateKeyDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayForDateKey(key: string) {
  const date = new Date(`${key}T00:00:00.000Z`);
  const day = date.getUTCDay();
  return addDateKeyDays(key, -(day === 0 ? 6 : day - 1));
}

export async function reportRoutes(request: NextRequest, parts: string[], userId: number) {
  if (parts[1] !== "weekly" || request.method !== "GET") return error("Not found", 404);
  const timezone = request.nextUrl.searchParams.get("timezone") || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    return error("Invalid timezone");
  }
  const result = await db.execute({
    sql: `SELECT s.started_at, s.duration_seconds, s.production_percentage, project.name AS project_name
          FROM sessions s LEFT JOIN projects project ON project.id = s.project_id AND project.user_id = s.user_id
          WHERE s.user_id = ? AND s.ended_at IS NOT NULL`, args: [userId],
  });
  const sessions = result.rows.map((row) => ({
    startedAt: row.started_at as string, duration: Number(row.duration_seconds ?? 0),
    production: row.production_percentage === null ? 0 : Number(row.production_percentage), project: row.project_name as string | null,
  }));
  const currentMonday = mondayForDateKey(dateKeyInTimezone(new Date(), timezone));
  for (let offset = 1; offset <= 12; offset += 1) {
    const weekStart = addDateKeyDays(currentMonday, -7 * offset);
    const weekEnd = addDateKeyDays(weekStart, 6);
    const weekSessions = sessions.filter((session) => mondayForDateKey(dateKeyInTimezone(new Date(session.startedAt), timezone)) === weekStart);
    const durations = weekSessions.map((session) => session.duration).sort((a, b) => a - b);
    const middle = Math.floor(durations.length / 2);
    const medianSeconds = durations.length === 0 ? null : durations.length % 2 ? durations[middle] : Math.round((durations[middle - 1] + durations[middle]) / 2);
    let learningSeconds = 0;
    let producingSeconds = 0;
    const projects = new Map<string, number>();
    for (const session of weekSessions) {
      const producing = Math.round(session.duration * session.production / 100);
      producingSeconds += producing;
      learningSeconds += session.duration - producing;
      if (session.project) projects.set(session.project, (projects.get(session.project) ?? 0) + session.duration);
    }
    const topProject = Array.from(projects.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    const data = {
      weekStart, weekEnd, timezone, totalSeconds: learningSeconds + producingSeconds,
      activeDays: new Set(weekSessions.map((session) => dateKeyInTimezone(new Date(session.startedAt), timezone))).size,
      medianSeconds, learningSeconds, producingSeconds, topProject, sessionCount: weekSessions.length,
    };
    await db.execute({
      sql: "INSERT OR IGNORE INTO weekly_reports (user_id, week_start, timezone, calculation_version, data_json) VALUES (?, ?, ?, 2, ?)",
      args: [userId, weekStart, timezone, JSON.stringify(data)],
    });
  }
  const reports = await db.execute({
    sql: "SELECT data_json, finalized_at FROM weekly_reports WHERE user_id = ? AND timezone = ? AND calculation_version = 2 ORDER BY week_start DESC LIMIT 12",
    args: [userId, timezone],
  });
  return NextResponse.json(reports.rows.map((row) => ({ ...JSON.parse(row.data_json as string), finalizedAt: row.finalized_at })));
}
