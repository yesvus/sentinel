import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";

export const notesRouter = Router();

notesRouter.use(requireAuth);

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

notesRouter.get("/", async (req: AuthRequest, res) => {
  const result = await db.execute({
    sql: "SELECT id, scope, date_key, content, updated_at FROM notes WHERE user_id = ?",
    args: [req.userId!],
  });

  res.json(result.rows);
});

notesRouter.put("/:scope/:dateKey", async (req: AuthRequest, res) => {
  const scope = req.params.scope as string;
  const dateKey = req.params.dateKey as string;
  const { content } = req.body ?? {};

  if (scope !== "day" && scope !== "week") {
    return res.status(400).json({ error: "scope must be 'day' or 'week'" });
  }
  if (!DATE_KEY_RE.test(dateKey)) {
    return res.status(400).json({ error: "dateKey must be in YYYY-MM-DD format" });
  }
  if (typeof content !== "string") {
    return res.status(400).json({ error: "content is required" });
  }

  const trimmed = content.trim();

  if (trimmed.length === 0) {
    await db.execute({
      sql: "DELETE FROM notes WHERE user_id = ? AND scope = ? AND date_key = ?",
      args: [req.userId!, scope, dateKey],
    });
    return res.status(204).send();
  }

  const updatedAt = new Date().toISOString();

  await db.execute({
    sql: `
      INSERT INTO notes (user_id, scope, date_key, content, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (user_id, scope, date_key)
      DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
    `,
    args: [req.userId!, scope, dateKey, trimmed, updatedAt],
  });

  const result = await db.execute({
    sql: "SELECT id, scope, date_key, content, updated_at FROM notes WHERE user_id = ? AND scope = ? AND date_key = ?",
    args: [req.userId!, scope, dateKey],
  });

  res.json(result.rows[0]);
});

notesRouter.delete("/:scope/:dateKey", async (req: AuthRequest, res) => {
  const scope = req.params.scope as string;
  const dateKey = req.params.dateKey as string;

  await db.execute({
    sql: "DELETE FROM notes WHERE user_id = ? AND scope = ? AND date_key = ?",
    args: [req.userId!, scope, dateKey],
  });

  res.status(204).send();
});
