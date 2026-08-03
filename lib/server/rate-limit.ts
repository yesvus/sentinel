import { createHash } from "node:crypto";
import { db } from "./db";

export function rateLimitKey(scope: string, value: string) {
  return createHash("sha256").update(`${scope}:${value}`).digest("hex");
}

export async function rateLimited(key: string, maximum: number) {
  await db.execute("DELETE FROM auth_rate_limits WHERE reset_at <= datetime('now')");
  const result = await db.execute({
    sql: "SELECT attempts FROM auth_rate_limits WHERE key_hash = ? AND reset_at > datetime('now')",
    args: [key],
  });
  return Number(result.rows[0]?.attempts ?? 0) >= maximum;
}

export async function recordRateLimitAttempt(key: string) {
  await db.execute({
    sql: `INSERT INTO auth_rate_limits (key_hash, attempts, reset_at)
          VALUES (?, 1, datetime('now', '+15 minutes'))
          ON CONFLICT (key_hash) DO UPDATE SET
            attempts = CASE WHEN reset_at <= datetime('now') THEN 1 ELSE attempts + 1 END,
            reset_at = CASE WHEN reset_at <= datetime('now') THEN datetime('now', '+15 minutes') ELSE reset_at END`,
    args: [key],
  });
}

export async function clearRateLimit(key: string) {
  await db.execute({ sql: "DELETE FROM auth_rate_limits WHERE key_hash = ?", args: [key] });
}
