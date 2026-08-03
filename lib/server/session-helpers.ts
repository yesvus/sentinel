import { db } from "./db";

export const SESSION_MAX_DURATION_MS = 12 * 60 * 60 * 1000;

export function sessionCursor(startedAt: string, id: number) {
  return Buffer.from(JSON.stringify([startedAt, id])).toString("base64url");
}

export function parseSessionCursor(cursor: string | null): [string, number] | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown;
    if (Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "number" && Number.isInteger(value[1])) return [value[0], value[1]];
  } catch {}
  return null;
}

export async function finalizeExpiredPause(userId: number, sessionId?: number) {
  const result = await db.execute({
    sql: `SELECT sessions.id, sessions.started_at, sessions.paused_at, sessions.paused_seconds,
                 users.session_pause_timeout_minutes
          FROM sessions JOIN users ON users.id = sessions.user_id
          WHERE sessions.user_id = ? AND sessions.ended_at IS NULL AND sessions.paused_at IS NOT NULL
          ${sessionId === undefined ? "" : "AND sessions.id = ?"}
          LIMIT 1`,
    args: sessionId === undefined ? [userId] : [userId, sessionId],
  });
  const session = result.rows[0];
  if (!session) return null;
  const pausedAt = new Date(session.paused_at as string).getTime();
  const timeoutSeconds = Number(session.session_pause_timeout_minutes ?? 30) * 60;
  const endedAt = pausedAt + timeoutSeconds * 1000;
  if (endedAt > Date.now()) return null;
  const pausedSeconds = Number(session.paused_seconds ?? 0) + timeoutSeconds;
  const durationSeconds = Math.max(0, Math.round((endedAt - new Date(session.started_at as string).getTime()) / 1000) - pausedSeconds);
  await db.batch([
    {
      sql: "UPDATE sessions SET ended_at = ?, duration_seconds = ?, paused_at = NULL, paused_seconds = ? WHERE id = ? AND user_id = ? AND ended_at IS NULL",
      args: [new Date(endedAt).toISOString(), durationSeconds, pausedSeconds, Number(session.id), userId],
    },
    {
      sql: "DELETE FROM session_tasks WHERE session_id = ? AND task_id IN (SELECT id FROM tasks WHERE user_id = ? AND completed_at IS NULL)",
      args: [Number(session.id), userId],
    },
  ], "write");
  return { id: Number(session.id), endedAt: new Date(endedAt).toISOString(), durationSeconds };
}

export async function finalizeExpiredSession(userId: number) {
  const result = await db.execute({
    sql: `SELECT sessions.id, sessions.started_at, sessions.paused_at, sessions.paused_seconds,
                 users.session_pause_timeout_minutes
          FROM sessions JOIN users ON users.id = sessions.user_id
          WHERE sessions.user_id = ? AND sessions.ended_at IS NULL
          LIMIT 1`,
    args: [userId],
  });
  const session = result.rows[0];
  if (!session) return null;
  const startedAt = new Date(session.started_at as string).getTime();
  if (Date.now() - startedAt <= SESSION_MAX_DURATION_MS) {
    if (session.paused_at === null) return null;
    const pausedAt = new Date(session.paused_at as string).getTime();
    const timeoutSeconds = Number(session.session_pause_timeout_minutes ?? 30) * 60;
    if (Date.now() - pausedAt <= timeoutSeconds * 1000) return null;
    const pausedSeconds = Number(session.paused_seconds ?? 0) + timeoutSeconds;
    const durationSeconds = Math.max(0, Math.round((pausedAt + timeoutSeconds * 1000 - startedAt) / 1000) - pausedSeconds);
    await db.batch([
      {
        sql: "UPDATE sessions SET ended_at = ?, duration_seconds = ?, paused_at = NULL, paused_seconds = ? WHERE id = ? AND user_id = ? AND ended_at IS NULL",
        args: [new Date(pausedAt + timeoutSeconds * 1000).toISOString(), durationSeconds, pausedSeconds, Number(session.id), userId],
      },
      {
        sql: "DELETE FROM session_tasks WHERE session_id = ? AND task_id IN (SELECT id FROM tasks WHERE user_id = ? AND completed_at IS NULL)",
        args: [Number(session.id), userId],
      },
    ], "write");
    return { id: Number(session.id), endedAt: new Date(pausedAt + timeoutSeconds * 1000).toISOString(), durationSeconds };
  }
  const now = Date.now();
  const pausedSeconds = session.paused_at === null
    ? Number(session.paused_seconds ?? 0)
    : Number(session.paused_seconds ?? 0) + Math.max(0, Math.round((now - new Date(session.paused_at as string).getTime()) / 1000));
  const durationSeconds = Math.max(0, Math.round((now - startedAt) / 1000) - pausedSeconds);
  await db.batch([
    {
      sql: "UPDATE sessions SET ended_at = ?, duration_seconds = ?, paused_at = NULL, paused_seconds = ? WHERE id = ? AND user_id = ? AND ended_at IS NULL",
      args: [new Date(now).toISOString(), durationSeconds, pausedSeconds, Number(session.id), userId],
    },
    {
      sql: "DELETE FROM session_tasks WHERE session_id = ? AND task_id IN (SELECT id FROM tasks WHERE user_id = ? AND completed_at IS NULL)",
      args: [Number(session.id), userId],
    },
  ], "write");
  return { id: Number(session.id), endedAt: new Date(now).toISOString(), durationSeconds };
}

export const SESSION_PROJECT_SELECT = `
  CASE WHEN grandparent.id IS NOT NULL THEN grandparent.name || ' / ' || parent.name || ' / ' || projects.name
       WHEN parent.id IS NOT NULL THEN parent.name || ' / ' || projects.name ELSE projects.name END AS project_path,
  COALESCE(grandparent.id, parent.id, projects.id) AS root_project_id,
  COALESCE(grandparent.name, parent.name, projects.name) AS root_project_name,
  COALESCE(grandparent.icon, parent.icon, projects.icon) AS root_project_icon
`;

export const SESSION_JOIN_PROJECTS = `
  LEFT JOIN projects ON projects.id = sessions.project_id AND projects.user_id = sessions.user_id
  LEFT JOIN projects parent ON parent.id = projects.parent_id AND parent.user_id = sessions.user_id
  LEFT JOIN projects grandparent ON grandparent.id = parent.parent_id AND grandparent.user_id = sessions.user_id
`;

export async function activeSession(userId: number) {
  await finalizeExpiredSession(userId);
  const result = await db.execute({
    sql: `SELECT sessions.id, sessions.started_at, sessions.ended_at,
                 sessions.duration_seconds, sessions.description, sessions.production_percentage,
                 sessions.paused_at, sessions.paused_seconds,
                 project_id, projects.name AS project_name, projects.icon AS project_icon,
                 projects.archived AS project_archived,
                 ${SESSION_PROJECT_SELECT}
          FROM sessions ${SESSION_JOIN_PROJECTS}
          WHERE sessions.user_id = ? AND sessions.ended_at IS NULL`,
    args: [userId],
  });
  return result.rows[0] ?? null;
}

export function uniqueActiveError(value: unknown) {
  return value instanceof Error && "code" in value && (value as { code?: string }).code === "SQLITE_CONSTRAINT" && value.message.includes("sessions.user_id");
}