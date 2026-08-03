import { NextRequest, NextResponse } from "next/server";
import { unauthorized } from "../auth";
import { db } from "../db";
import { error, noContent } from "./http";

function icsEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function calendarRoutes(request: NextRequest, parts: string[], userId: number | null) {
  if (parts[1] === "feed" && request.method === "GET") {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) return error("Calendar token is required", 401);
    const owner = await db.execute({ sql: "SELECT id FROM users WHERE calendar_token = ?", args: [token] });
    if (!owner.rows[0]) return error("Calendar feed not found", 404);
    const sessions = await db.execute({
      sql: `SELECT sessions.id, sessions.started_at, sessions.ended_at, sessions.description,
                   CASE WHEN grandparent.id IS NOT NULL THEN grandparent.name || ' / ' || parent.name || ' / ' || project.name
                        WHEN parent.id IS NOT NULL THEN parent.name || ' / ' || project.name ELSE project.name END AS project_path
            FROM sessions LEFT JOIN projects project ON project.id = sessions.project_id AND project.user_id = sessions.user_id
            LEFT JOIN projects parent ON parent.id = project.parent_id AND parent.user_id = sessions.user_id
            LEFT JOIN projects grandparent ON grandparent.id = parent.parent_id AND grandparent.user_id = sessions.user_id
            WHERE sessions.user_id = ? AND sessions.ended_at IS NOT NULL ORDER BY sessions.started_at DESC LIMIT 1000`,
      args: [owner.rows[0].id],
    });
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sentinel//Activity Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Sentinel Activity"];
    for (const session of sessions.rows) {
      const project = session.project_path ? String(session.project_path) : "Focus session";
      lines.push(
        "BEGIN:VEVENT", `UID:session-${session.id}@sentinel`, `DTSTAMP:${icsDate(session.ended_at as string)}`,
        `DTSTART:${icsDate(session.started_at as string)}`, `DTEND:${icsDate(session.ended_at as string)}`,
        `SUMMARY:${icsEscape(project)}`, `DESCRIPTION:${icsEscape(session.description ? String(session.description) : "Sentinel activity")}`, "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    return new NextResponse(`${lines.join("\r\n")}\r\n`, {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "inline; filename=\"sentinel-activity.ics\"" },
    });
  }
  if (parts[1] === "token" && userId !== null && request.method === "POST") {
    const existing = await db.execute({ sql: "SELECT calendar_token FROM users WHERE id = ?", args: [userId] });
    const token = existing.rows[0]?.calendar_token || crypto.randomUUID().replace(/-/g, "");
    await db.execute({ sql: "UPDATE users SET calendar_token = ? WHERE id = ?", args: [token, userId] });
    return NextResponse.json({ token });
  }
  if (parts[1] === "token" && userId !== null && request.method === "DELETE") {
    await db.execute({ sql: "UPDATE users SET calendar_token = NULL WHERE id = ?", args: [userId] });
    return noContent();
  }
  return userId === null ? unauthorized() : error("Not found", 404);
}
