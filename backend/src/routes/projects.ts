import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get("/", async (req: AuthRequest, res) => {
  const result = await db.execute({
    sql: "SELECT id, name FROM projects WHERE user_id = ? ORDER BY name",
    args: [req.userId!],
  });

  res.json(result.rows);
});

projectsRouter.post("/", async (req: AuthRequest, res) => {
  const { name } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Name is required" });
  }

  const result = await db.execute({
    sql: "INSERT INTO projects (user_id, name) VALUES (?, ?)",
    args: [req.userId!, name.trim()],
  });

  res.status(201).json({ id: Number(result.lastInsertRowid), name: name.trim() });
});

projectsRouter.patch("/:id", async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { name } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Name is required" });
  }

  const result = await db.execute({
    sql: "UPDATE projects SET name = ? WHERE id = ? AND user_id = ?",
    args: [name.trim(), id, req.userId!],
  });

  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Project not found" });
  }

  res.json({ id, name: name.trim() });
});

projectsRouter.delete("/:id", async (req: AuthRequest, res) => {
  const id = Number(req.params.id);

  await db.execute({
    sql: "UPDATE sessions SET project_id = NULL WHERE project_id = ? AND user_id = ?",
    args: [id, req.userId!],
  });

  const result = await db.execute({
    sql: "DELETE FROM projects WHERE id = ? AND user_id = ?",
    args: [id, req.userId!],
  });

  if (result.rowsAffected === 0) {
    return res.status(404).json({ error: "Project not found" });
  }

  res.status(204).send();
});
