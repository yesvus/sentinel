import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { tokenHash } from "../auth";
import { body, error, noContent } from "./http";
import { MAX_API_TOKEN_NAME_LENGTH } from "./validation";

type ApiTokenRow = {
  id: number;
  name: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
};

function serializeToken(row: ApiTokenRow) {
  return {
    id: Number(row.id),
    name: row.name,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function expiry(value: unknown): { value: string | null } | { error: NextResponse } {
  if (value === undefined || value === null || value === "") return { value: null as string | null };
  if (typeof value !== "string") return { error: error("expiresAt must be an ISO 8601 date-time or null") };
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
    return { error: error("expiresAt must be a future ISO 8601 date-time") };
  }
  return { value: parsed.toISOString().slice(0, 19).replace("T", " ") };
}

export async function apiTokenRoutes(request: NextRequest, parts: string[], userId: number): Promise<NextResponse> {
  const pathId = parts[2];
  const id = pathId ? Number(pathId) : null;
  if (pathId && (!Number.isInteger(id) || id === null || id <= 0)) return error("Not found", 404);

  if (!parts[2] && request.method === "GET") {
    await db.execute("DELETE FROM api_tokens WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')");
    const result = await db.execute({
      sql: "SELECT id, name, last_used_at, expires_at, created_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC, id DESC",
      args: [userId],
    });
    return NextResponse.json(result.rows.map((row) => serializeToken(row as unknown as ApiTokenRow)));
  }

  if (!parts[2] && request.method === "POST") {
    const data = await body(request);
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!name || name.length > MAX_API_TOKEN_NAME_LENGTH) {
      return error(`Name is required and must be at most ${MAX_API_TOKEN_NAME_LENGTH} characters`);
    }
    const parsedExpiry = expiry(data.expiresAt);
    if ("error" in parsedExpiry) return parsedExpiry.error;

    const token = `sent_v1_${randomBytes(32).toString("base64url")}`;
    const result = await db.execute({
      sql: "INSERT INTO api_tokens (user_id, token_hash, name, expires_at) VALUES (?, ?, ?, ?) RETURNING id, name, last_used_at, expires_at, created_at",
      args: [userId, tokenHash(token), name, parsedExpiry.value],
    });
    return NextResponse.json({ ...serializeToken(result.rows[0] as unknown as ApiTokenRow), token }, { status: 201 });
  }

  if (id !== null && request.method === "DELETE") {
    const result = await db.execute({ sql: "DELETE FROM api_tokens WHERE id = ? AND user_id = ?", args: [id, userId] });
    if (Number(result.rowsAffected) === 0) return error("Not found", 404);
    return noContent();
  }

  return error("Not found", 404);
}
