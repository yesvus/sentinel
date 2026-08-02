import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { body, error, noContent } from "./http";
import { MAX_NOTE_LENGTH } from "./validation";

export async function noteRoutes(request: NextRequest, parts: string[], userId: number) {
  if (!parts[1] && request.method === "GET") {
    const result = await db.execute({ sql: "SELECT id, scope, date_key, content, updated_at FROM notes WHERE user_id = ?", args: [userId] });
    return NextResponse.json(result.rows);
  }
  const scope = parts[1];
  const dateKey = parts[2];
  const validDateKey = scope === "long-term" ? dateKey === "long-term" : /^\d{4}-\d{2}-\d{2}$/.test(dateKey ?? "");
  if ((scope !== "day" && scope !== "week" && scope !== "long-term") || !validDateKey) return error("Invalid note scope or date");
  if (request.method === "DELETE") {
    await db.execute({ sql: "DELETE FROM notes WHERE user_id = ? AND scope = ? AND date_key = ?", args: [userId, scope, dateKey] });
    return noContent();
  }
  if (request.method === "PUT") {
    const data = await body(request);
    if (typeof data.content !== "string") return error("content is required");
    if (data.content.length > MAX_NOTE_LENGTH) return error(`content must be at most ${MAX_NOTE_LENGTH} characters`);
    const content = data.content.trim();
    if (!content) {
      await db.execute({ sql: "DELETE FROM notes WHERE user_id = ? AND scope = ? AND date_key = ?", args: [userId, scope, dateKey] });
      return noContent();
    }
    const updatedAt = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO notes (user_id, scope, date_key, content, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (user_id, scope, date_key) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
      args: [userId, scope, dateKey, content, updatedAt],
    });
    const result = await db.execute({ sql: "SELECT id, scope, date_key, content, updated_at FROM notes WHERE user_id = ? AND scope = ? AND date_key = ?", args: [userId, scope, dateKey] });
    return NextResponse.json(result.rows[0]);
  }
  return error("Not found", 404);
}
