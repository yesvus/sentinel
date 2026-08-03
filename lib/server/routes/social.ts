import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { rateLimited, rateLimitKey, recordRateLimitAttempt } from "../rate-limit";
import { body, clientAddress, error, noContent } from "./http";
import { validEmail } from "./validation";

function socialUser(row: Record<string, unknown>) {
  return { id: Number(row.user_id), name: row.name ?? null, email: row.email, avatar: row.avatar ?? null };
}

function activityCursor(activeRank: number, startedAt: string, id: number) {
  return Buffer.from(JSON.stringify([activeRank, startedAt, id])).toString("base64url");
}

function parseActivityCursor(cursor: string | null): [number, string, number] | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown;
    if (Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "string" && typeof value[2] === "number" && Number.isInteger(value[2])) return [value[0], value[1], value[2]];
  } catch {}
  return null;
}

export async function socialRoutes(request: NextRequest, parts: string[], userId: number) {
  const section = parts[1];
  const id = parts[2] ? Number(parts[2]) : null;
  if (section === "nudges" && id !== null && request.method === "POST") {
    if (id === userId) return error("You cannot nudge yourself");
    const friendship = await db.execute({
      sql: `SELECT 1 FROM friendships WHERE status = 'accepted'
            AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`, args: [userId, id, id, userId],
    });
    if (!friendship.rows.length) return error("You can only nudge friends", 403);
    const recentNudge = await db.execute({
      sql: `SELECT 1 FROM social_notifications WHERE user_id = ? AND actor_id = ? AND type = 'nudge'
            AND created_at > datetime('now', '-30 seconds') LIMIT 1`, args: [id, userId],
    });
    if (recentNudge.rows.length) return error("You can nudge this friend again in 30 seconds", 429);
    const attemptKey = rateLimitKey("nudge", `${userId}:${id}`);
    if (await rateLimited(attemptKey, 10)) return error("Too many nudges. Give your friend a moment.", 429);
    await recordRateLimitAttempt(attemptKey);
    const result = await db.execute({ sql: "INSERT INTO social_notifications (user_id, actor_id, type) VALUES (?, ?, 'nudge')", args: [id, userId] });
    return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
  }
  if (section === "notifications" && id === null && request.method === "GET") {
    const result = await db.execute({
      sql: `SELECT n.id, n.type, n.read_at, n.created_at, u.id AS actor_id, u.name AS actor_name,
                   u.email AS actor_email, u.avatar AS actor_avatar
            FROM social_notifications n JOIN users u ON u.id = n.actor_id
            WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 50`, args: [userId],
    });
    return NextResponse.json(result.rows.map((row) => ({
      id: Number(row.id), type: row.type, readAt: row.read_at ?? null, createdAt: row.created_at,
      actor: { id: Number(row.actor_id), name: row.actor_name ?? null, email: row.actor_email, avatar: row.actor_avatar ?? null },
    })));
  }
  if (section === "notifications" && id === null && request.method === "PATCH") {
    await db.execute({ sql: "UPDATE social_notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL", args: [userId] });
    return noContent();
  }
  if (section === "notifications" && id !== null && request.method === "DELETE") {
    const result = await db.execute({ sql: "DELETE FROM social_notifications WHERE id = ? AND user_id = ?", args: [id, userId] });
    return result.rowsAffected ? noContent() : error("Notification not found", 404);
  }
  if (section === "notifications" && id === null && request.method === "DELETE") {
    await db.execute({ sql: "DELETE FROM social_notifications WHERE user_id = ?", args: [userId] });
    return noContent();
  }
  if (section === "connections" && id === null && request.method === "GET") {
    const result = await db.execute({
      sql: `SELECT f.id, f.status, f.requester_id, f.addressee_id, u.id AS user_id, u.name, u.email, u.avatar
            FROM friendships f JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
            WHERE f.requester_id = ? OR f.addressee_id = ? ORDER BY f.created_at DESC`, args: [userId, userId, userId],
    });
    return NextResponse.json(result.rows.map((row) => ({
      friendshipId: Number(row.id), status: row.status,
      direction: row.status === "accepted" ? "friend" : Number(row.requester_id) === userId ? "outgoing" : "incoming",
      user: socialUser(row),
    })));
  }
  if (section === "requests" && id === null && request.method === "POST") {
    const data = await body(request);
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    if (!validEmail(email)) return error("A valid email is required");
    const attemptKey = rateLimitKey("friend-request", `${clientAddress(request)}:${userId}`);
    if (await rateLimited(attemptKey, 20)) return error("Too many friend requests. Try again later.", 429);
    await recordRateLimitAttempt(attemptKey);
    const found = await db.execute({ sql: "SELECT id, name, email, avatar FROM users WHERE lower(email) = ?", args: [email] });
    const target = found.rows[0];
    if (!target) return error("No Sentinel user has that email", 404);
    const targetId = Number(target.id);
    if (targetId === userId) return error("You cannot send a friend request to yourself");
    const existing = await db.execute({
      sql: "SELECT id, status, requester_id FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)",
      args: [userId, targetId, targetId, userId],
    });
    const connection = existing.rows[0];
    if (connection?.status === "accepted") return error("You are already friends", 409);
    if (connection && Number(connection.requester_id) === targetId) {
      await db.execute({ sql: "UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE id = ?", args: [connection.id] });
      return NextResponse.json({ friendshipId: Number(connection.id), status: "accepted", direction: "friend", user: { id: targetId, name: target.name, email: target.email, avatar: target.avatar } });
    }
    if (connection) return error("Friend request already sent", 409);
    const result = await db.execute({ sql: "INSERT INTO friendships (requester_id, addressee_id) VALUES (?, ?)", args: [userId, targetId] });
    return NextResponse.json({ friendshipId: Number(result.lastInsertRowid), status: "pending", direction: "outgoing", user: { id: targetId, name: target.name, email: target.email, avatar: target.avatar } }, { status: 201 });
  }
  if (section === "requests" && id !== null && request.method === "PATCH") {
    const data = await body(request);
    if (data.action !== "accept" && data.action !== "decline") return error("Action must be accept or decline");
    const found = await db.execute({ sql: "SELECT id FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'", args: [id, userId] });
    if (!found.rows[0]) return error("Friend request not found", 404);
    if (data.action === "accept") await db.execute({ sql: "UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE id = ?", args: [id] });
    else await db.execute({ sql: "DELETE FROM friendships WHERE id = ?", args: [id] });
    return noContent();
  }
  if (section === "connections" && id !== null && request.method === "DELETE") {
    const result = await db.execute({ sql: "DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)", args: [id, userId, userId] });
    return result.rowsAffected ? noContent() : error("Connection not found", 404);
  }
  if (section === "activity" && request.method === "GET") {
    const requestedLimit = request.nextUrl.searchParams.get("limit");
    const limit = requestedLimit ? Number(requestedLimit) : 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return error("limit must be an integer between 1 and 100");
    const cursorParam = request.nextUrl.searchParams.get("cursor");
    const cursor = parseActivityCursor(cursorParam);
    if (cursorParam && !cursor) return error("Invalid activity cursor");
    const activeRank = "(CASE WHEN s.ended_at IS NULL THEN 1 ELSE 0 END)";
    const cursorClause = cursor ? `AND (${activeRank} < ? OR (${activeRank} = ? AND (s.started_at < ? OR (s.started_at = ? AND s.id < ?))))` : "";
    const args: (string | number)[] = [userId, userId, userId];
    if (cursor) args.push(cursor[0], cursor[0], cursor[1], cursor[1], cursor[2]);
    args.push(limit + 1);
    const result = await db.execute({
      sql: `SELECT s.id, s.user_id, s.started_at, s.ended_at, s.duration_seconds, s.paused_at, s.paused_seconds,
                   CASE WHEN u.share_session_descriptions = 1 THEN s.description ELSE NULL END AS description,
                   p.name AS project_name, p.icon AS project_icon, u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar
            FROM friendships f JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
            JOIN sessions s ON s.user_id = u.id LEFT JOIN projects p ON p.id = s.project_id AND p.user_id = s.user_id
            WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?) ${cursorClause}
            ORDER BY ${activeRank} DESC, s.started_at DESC, s.id DESC LIMIT ?`, args,
    });
    const hasMore = result.rows.length > limit;
    const items = result.rows.slice(0, limit);
    const last = items.at(-1);
    return NextResponse.json({ items, nextCursor: hasMore && last ? activityCursor(last.ended_at === null ? 1 : 0, last.started_at as string, Number(last.id)) : null });
  }
  return error("Not found", 404);
}
