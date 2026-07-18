import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../db.js";
import { requireAuth, AuthRequest } from "../middleware/auth.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me";
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Email and a password of at least 8 characters are required" });
  }

  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [email],
  });

  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await db.execute({
    sql: "INSERT INTO users (email, password_hash) VALUES (?, ?)",
    args: [email, passwordHash],
  });

  const userId = Number(result.lastInsertRowid);
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });

  res.cookie("token", token, COOKIE_OPTIONS);
  res.status(201).json({ id: userId, email });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const result = await db.execute({
    sql: "SELECT id, password_hash FROM users WHERE email = ?",
    args: [email],
  });

  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash as string))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

  res.cookie("token", token, COOKIE_OPTIONS);
  res.json({ id: user.id, email });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.status(204).send();
});

authRouter.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const result = await db.execute({
    sql: "SELECT id, email FROM users WHERE id = ?",
    args: [req.userId],
  });

  const user = result.rows[0];

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({ id: user.id, email: user.email });
});
