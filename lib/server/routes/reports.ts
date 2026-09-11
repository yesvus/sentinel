import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { error } from "./http";
import { addDateKeyDays, dayKey, isValidTimeZone } from "@/lib/date";
import { sessionSecondsOnDay } from "@/lib/session-stats";

function mondayForDateKey(key: string) {
  const date = new Date(`${key}T00:00:00.000Z`);
  const day = date.getUTCDay();
  return addDateKeyDays(key, -(day === 0 ? 6 : day - 1));
}

export async function reportRoutes(request: NextRequest, parts: string[], userId: number) {
  if (parts[1] !== "weekly" || request.method !== "GET") return error("Not found", 404);
  const timezone = request.nextUrl.searchParams.get("timezone") || "UTC";
  if (!isValidTimeZone(timezone)) {
    return error("Invalid timezone");
  }
  const result = await db.execute({
    sql: `SELECT s.id, s.started_at, s.ended_at, s.duration_seconds, s.production_percentage, project.name AS project_name
          FROM sessions s LEFT JOIN projects project ON project.id = s.project_id AND project.user_id = s.user_id
          WHERE s.user_id = ? AND s.ended_at IS NOT NULL AND s.started_at < ?`, args: [userId, new Date().toISOString()],
  });
  const now = Date.now();
  const sessions = result.rows.map((row) => ({
    id: Number(row.id),
    started_at: row.started_at as string,
    ended_at: row.ended_at as string | null,
    duration_seconds: Number(row.duration_seconds ?? 0),
    production_percentage: row.production_percentage === null ? null : Number(row.production_percentage),
    project_name: row.project_name as string | null,
    project_id: null,
    project_icon: null,
    description: null,
  }));
  const currentMonday = mondayForDateKey(dayKey(new Date(), timezone));
  const todayKey = dayKey(new Date(), timezone);
  for (let offset = 1; offset <= 12; offset += 1) {
    const weekStart = addDateKeyDays(currentMonday, -7 * offset);
    const weekEnd = addDateKeyDays(weekStart, 6);
    const daysInWeek = Array.from({ length: 7 }, (_, i) => addDateKeyDays(weekStart, i));
    const weekSessions = sessions.filter((session) =>
      daysInWeek.some((day) => sessionSecondsOnDay(session, day, now, timezone) > 0),
    );
    const countableDayKeys = new Set<string>();
    let learningSeconds = 0;
    let producingSeconds = 0;
    const projects = new Map<string, number>();

    for (const session of weekSessions) {
      for (const day of daysInWeek) {
        const seconds = sessionSecondsOnDay(session, day, now, timezone);
        if (seconds > 0) {
          if (day <= todayKey) countableDayKeys.add(day);
          const producing = Math.round(seconds * (session.production_percentage ?? 0) / 100);
          producingSeconds += producing;
          learningSeconds += seconds - producing;
          if (session.project_name) {
            projects.set(session.project_name, (projects.get(session.project_name) ?? 0) + seconds);
          }
        }
      }
    }
    const activeDays = countableDayKeys.size;
    const durations = weekSessions.map((session) => session.duration_seconds).sort((a, b) => a - b);
    const middle = Math.floor(durations.length / 2);
    const medianSeconds = durations.length === 0 ? null : durations.length % 2 ? durations[middle] : Math.round((durations[middle - 1] + durations[middle]) / 2);
    const topProject = Array.from(projects.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    const data = {
      weekStart, weekEnd, timezone, totalSeconds: learningSeconds + producingSeconds,
      activeDays, medianSeconds, learningSeconds, producingSeconds, topProject, sessionCount: weekSessions.length,
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
