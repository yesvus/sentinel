import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

// The embedded local-file driver and Turso's remote HTTP driver report constraint
// violations differently (only the former reliably sets `extendedCode`), so this
// checks the top-level code plus the specific column the message names instead.
function isUniqueConstraintError(err: unknown) {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as { code?: string }).code === "SQLITE_CONSTRAINT" &&
    err.message.includes("sessions.user_id")
  );
}

async function fetchActiveSession(userId: number) {
  const result = await db.execute({
    sql: `
      SELECT sessions.id, started_at, ended_at, duration_seconds, description,
             project_id, projects.name AS project_name, projects.icon AS project_icon
      FROM sessions
      LEFT JOIN projects ON projects.id = sessions.project_id
      WHERE sessions.user_id = ? AND sessions.ended_at IS NULL
    `,
    args: [userId],
  });
  return result.rows[0] ?? null;
}

sessionsRouter.post("/start", async (req: AuthRequest, res) => {
  const { description, projectId } = req.body ?? {};
  const startedAt = new Date().toISOString();

  try {
    const result = await db.execute({
      sql: "INSERT INTO sessions (user_id, started_at, description, project_id) VALUES (?, ?, ?, ?)",
      args: [req.userId!, startedAt, description ?? null, projectId ?? null],
    });

    const id = Number(result.lastInsertRowid);
    res.status(201).json({ id, startedAt });
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;

    // Another request (possibly from a different device) already started a session
    // for this user; the DB-level unique index is what actually prevents the race.
    const active = await fetchActiveSession(req.userId!);
    res.status(409).json({ error: "A session is already in progress", session: active });
  }
});

sessionsRouter.get("/active", async (req: AuthRequest, res) => {
  const active = await fetchActiveSession(req.userId!);
  res.json(active);
});

sessionsRouter.post("/", async (req: AuthRequest, res) => {
  const { startedAt, endedAt, description, projectId } = req.body ?? {};

  if (typeof startedAt !== "string" || typeof endedAt !== "string") {
    return res.status(400).json({ error: "startedAt and endedAt are required" });
  }

  const start = new Date(startedAt);
  const end = new Date(endedAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return res.status(400).json({ error: "startedAt and endedAt must be valid dates" });
  }
  if (end <= start) {
    return res.status(400).json({ error: "endedAt must be after startedAt" });
  }

  const durationSeconds = Math.round((end.getTime() - start.getTime()) / 1000);

  const result = await db.execute({
    sql: "INSERT INTO sessions (user_id, started_at, ended_at, duration_seconds, description, project_id) VALUES (?, ?, ?, ?, ?, ?)",
    args: [req.userId!, start.toISOString(), end.toISOString(), durationSeconds, description ?? null, projectId ?? null],
  });

  const id = Number(result.lastInsertRowid);
  res.status(201).json({
    id,
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    durationSeconds,
  });
});

sessionsRouter.patch("/:id", async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { description, projectId, startedAt, endedAt } = req.body ?? {};

  const existing = await db.execute({
    sql: "SELECT started_at, ended_at FROM sessions WHERE id = ? AND user_id = ?",
    args: [id, req.userId!],
  });

  const session = existing.rows[0];
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const start = new Date(startedAt ?? (session.started_at as string));
  const wasActive = session.ended_at === null;
  const end = endedAt !== undefined ? new Date(endedAt) : wasActive ? null : new Date(session.ended_at as string);

  if (Number.isNaN(start.getTime()) || (end !== null && Number.isNaN(end.getTime()))) {
    return res.status(400).json({ error: "startedAt and endedAt must be valid dates" });
  }
  if (end !== null && end <= start) {
    return res.status(400).json({ error: "endedAt must be after startedAt" });
  }

  const durationSeconds = end !== null ? Math.round((end.getTime() - start.getTime()) / 1000) : null;

  await db.execute({
    sql: "UPDATE sessions SET description = ?, project_id = ?, started_at = ?, ended_at = ?, duration_seconds = ? WHERE id = ?",
    args: [
      description ?? null,
      projectId ?? null,
      start.toISOString(),
      end !== null ? end.toISOString() : null,
      durationSeconds,
      id,
    ],
  });

  res.json({
    id,
    description: description ?? null,
    projectId: projectId ?? null,
    startedAt: start.toISOString(),
    endedAt: end !== null ? end.toISOString() : null,
    durationSeconds,
  });
});

sessionsRouter.patch("/:id/stop", async (req: AuthRequest, res) => {
  const id = Number(req.params.id);

  const existing = await db.execute({
    sql: "SELECT started_at FROM sessions WHERE id = ? AND user_id = ?",
    args: [id, req.userId!],
  });

  const session = existing.rows[0];

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const endedAt = new Date();
  const startedAt = new Date(session.started_at as string);
  const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

  await db.execute({
    sql: "UPDATE sessions SET ended_at = ?, duration_seconds = ? WHERE id = ?",
    args: [endedAt.toISOString(), durationSeconds, id],
  });

  res.json({ id, endedAt: endedAt.toISOString(), durationSeconds });
});

sessionsRouter.get("/", async (req: AuthRequest, res) => {
  const result = await db.execute({
    sql: `
      SELECT sessions.id, started_at, ended_at, duration_seconds, description,
             project_id, projects.name AS project_name, projects.icon AS project_icon
      FROM sessions
      LEFT JOIN projects ON projects.id = sessions.project_id
      WHERE sessions.user_id = ?
      ORDER BY started_at DESC
    `,
    args: [req.userId!],
  });

  res.json(result.rows);
});

sessionsRouter.delete("/:id", async (req: AuthRequest, res) => {
  const id = Number(req.params.id);

  const result = await db.execute({
    sql: "DELETE FROM sessions WHERE id = ? AND user_id = ?",
    args: [id, req.userId!],
  });

  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.status(204).send();
});
