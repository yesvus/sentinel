import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";

const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_SECONDS,
  path: "/",
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getUserId(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return null;
  const result = await db.execute({
    sql: "SELECT user_id FROM auth_sessions WHERE token_hash = ? AND expires_at > datetime('now')",
    args: [tokenHash(token)],
  });
  if (!result.rows[0]) return null;
  void db.execute({
    sql: "UPDATE auth_sessions SET last_used_at = datetime('now') WHERE token_hash = ?",
    args: [tokenHash(token)],
  });
  return Number(result.rows[0].user_id);
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  await db.execute("DELETE FROM auth_sessions WHERE expires_at <= datetime('now')");
  await db.execute({
    sql: "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+7 days'))",
    args: [userId, tokenHash(token)],
  });
  return token;
}

export async function revokeSession(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return;
  await db.execute({ sql: "DELETE FROM auth_sessions WHERE token_hash = ?", args: [tokenHash(token)] });
}

export async function revokeUserSessions(userId: number) {
  await db.execute({ sql: "DELETE FROM auth_sessions WHERE user_id = ?", args: [userId] });
}

export function unauthorized() {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}
