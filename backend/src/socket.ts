import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { parseCookie } from "cookie";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me";
const POLL_INTERVAL_MS = 3000;

let io: Server | null = null;

type SessionSnapshot = {
  id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  project_id: number | null;
  description: string | null;
};

async function fetchLatestSession(userId: number): Promise<SessionSnapshot | null> {
  const result = await db.execute({
    sql: `SELECT id, started_at, ended_at, duration_seconds, project_id, description
          FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 1`,
    args: [userId],
  });
  return (result.rows[0] as unknown as SessionSnapshot) ?? null;
}

export function createSocketServer(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000", credentials: true },
  });

  io.use((socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? "");
    const token = cookies.token;

    if (!token) return next(new Error("Not authenticated"));

    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as number;
    socket.join(`user:${userId}`);

    // Polling here (instead of relying only on direct notifyUser calls) means real-time
    // updates work regardless of which backend process/deployment handled the write,
    // important since the REST API and the socket server can be on separate hosts.
    let lastSnapshot: SessionSnapshot | null = null;

    const interval = setInterval(async () => {
      try {
        const current = await fetchLatestSession(userId);
        if (JSON.stringify(current) === JSON.stringify(lastSnapshot)) return;

        const wasRunning = lastSnapshot && lastSnapshot.ended_at === null;
        const isRunning = current && current.ended_at === null;

        if (isRunning && (!wasRunning || current!.id !== lastSnapshot?.id)) {
          socket.emit("session:started", {
            id: current!.id,
            startedAt: current!.started_at,
            projectId: current!.project_id,
            description: current!.description,
          });
        } else if (!isRunning && wasRunning) {
          socket.emit("session:stopped", {
            id: lastSnapshot!.id,
            durationSeconds: current?.duration_seconds ?? 0,
          });
        } else if (isRunning && current) {
          socket.emit("session:updated", {
            id: current.id,
            projectId: current.project_id,
            description: current.description,
          });
        }

        lastSnapshot = current;
      } catch {
        // best-effort; try again next tick
      }
    }, POLL_INTERVAL_MS);

    socket.on("disconnect", () => clearInterval(interval));
  });

  return io;
}

export function notifyUser(userId: number, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}
