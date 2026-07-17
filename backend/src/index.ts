import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initDb } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { sessionsRouter } from "./routes/sessions.js";
import { projectsRouter } from "./routes/projects.js";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/projects", projectsRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

initDb().then(() => {
  app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
});
