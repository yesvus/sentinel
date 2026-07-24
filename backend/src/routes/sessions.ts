import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { notifyUser } from "../socket.js";

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

sessionsRouter.post("/start", async (req: AuthRequest, res) => {
  const { description, projectId } = req.body ?? {};
  const startedAt = new Date().toISOString();

  const result = await db.execute({
    sql: "INSERT INTO sessions (user_id, started_at, description, project_id) VALUES (?, ?, ?, ?)",
    args: [req.userId!, startedAt, description ?? null, projectId ?? null],
  });

  const id = Number(result.lastInsertRowid);
  notifyUser(req.userId!, "session:started", { id, startedAt, projectId: projectId ?? null, description: description ?? null });

  res.status(201).json({ id, startedAt });
});

sessionsRouter.patch("/:id", async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { description, projectId } = req.body ?? {};

  const result = await db.execute({
    sql: "UPDATE sessions SET description = ?, project_id = ? WHERE id = ? AND user_id = ?",
    args: [description ?? null, projectId ?? null, id, req.userId!],
  });

  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Session not found" });
  }

  notifyUser(req.userId!, "session:updated", { id, description: description ?? null, projectId: projectId ?? null });

  res.json({ id, description: description ?? null, projectId: projectId ?? null });
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

  notifyUser(req.userId!, "session:stopped", { id, endedAt: endedAt.toISOString(), durationSeconds });

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
