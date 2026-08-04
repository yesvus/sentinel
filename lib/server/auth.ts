import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";
import { rateLimitKey, rateLimited, recordRateLimitAttempt } from "./rate-limit";

const SESSION_SECONDS = 7 * 24 * 60 * 60;
const API_TOKEN_REQUEST_LIMIT = 120;
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_SECONDS,
  path: "/",
};

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type AuthenticationResult = { userId: number | null; rateLimited: boolean };

export async function authenticateRequest(request: NextRequest): Promise<AuthenticationResult> {
  const token = request.cookies.get("token")?.value;
  if (token) {
    const hash = tokenHash(token);
    const result = await db.execute({
      sql: "SELECT user_id FROM auth_sessions WHERE token_hash = ? AND expires_at > datetime('now')",
      args: [hash],
    });
    if (!result.rows[0]) return { userId: null, rateLimited: false };
    void db.execute({
      sql: "UPDATE auth_sessions SET last_used_at = datetime('now') WHERE token_hash = ?",
      args: [hash],
    });
    return { userId: Number(result.rows[0].user_id), rateLimited: false };
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
  if (!bearer) return { userId: null, rateLimited: false };
  const hash = tokenHash(bearer);
  const result = await db.execute({
    sql: "SELECT id, user_id FROM api_tokens WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > datetime('now'))",
    args: [hash],
  });
  const row = result.rows[0];
  if (!row) return { userId: null, rateLimited: false };

  const key = rateLimitKey("api-token", hash);
  if (await rateLimited(key, API_TOKEN_REQUEST_LIMIT)) return { userId: null, rateLimited: true };
  await recordRateLimitAttempt(key);
  void db.execute({
    sql: "UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?",
    args: [Number(row.id)],
  });
  return { userId: Number(row.user_id), rateLimited: false };
}

export async function getUserId(request: NextRequest) {
  return (await authenticateRequest(request)).userId;
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
