import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { body, error, noContent } from "./http";
import { FOCUS_AUDIO_TYPES } from "./validation";

export async function noiseUsageRoutes(request: NextRequest, parts: string[], userId: number) {
  if (parts[1] === "start" && request.method === "POST") {
    const data = await body(request);
    if (typeof data.audioType !== "string" || !FOCUS_AUDIO_TYPES.has(data.audioType)) return error("Invalid focus audio type");
    await db.execute({
      sql: `UPDATE focus_noise_usage SET ended_at = last_heartbeat_at,
                   duration_seconds = MAX(0, unixepoch(last_heartbeat_at) - unixepoch(started_at))
            WHERE user_id = ? AND ended_at IS NULL`, args: [userId],
    });
    const now = new Date().toISOString();
    const result = await db.execute({ sql: "INSERT INTO focus_noise_usage (user_id, audio_type, started_at, last_heartbeat_at) VALUES (?, ?, ?, ?)", args: [userId, data.audioType, now, now] });
    return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
  }
  const id = Number(parts[1]);
  if (!Number.isInteger(id) || id < 1) return error("Not found", 404);
  if (parts[2] === "heartbeat" && request.method === "POST") {
    await db.execute({ sql: "UPDATE focus_noise_usage SET last_heartbeat_at = ? WHERE id = ? AND user_id = ? AND ended_at IS NULL", args: [new Date().toISOString(), id, userId] });
    return noContent();
  }
  if (parts[2] === "stop" && request.method === "POST") {
    const endedAt = new Date().toISOString();
    await db.execute({ sql: "UPDATE focus_noise_usage SET ended_at = ?, last_heartbeat_at = ?, duration_seconds = MAX(0, unixepoch(?) - unixepoch(started_at)) WHERE id = ? AND user_id = ? AND ended_at IS NULL", args: [endedAt, endedAt, endedAt, id, userId] });
    return noContent();
  }
  return error("Not found", 404);
}
