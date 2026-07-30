import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { sessionsRouter } from "./routes/sessions.js";
import { projectsRouter } from "./routes/projects.js";
import { notesRouter } from "./routes/notes.js";

export const app = express();
app.set("etag", false);

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Every response here depends on the auth cookie, never let a CDN or browser cache it.
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use("/api/auth", authRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/notes", notesRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
