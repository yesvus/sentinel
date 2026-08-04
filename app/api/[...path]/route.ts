import { NextRequest, NextResponse } from "next/server";
import { getUserId, unauthorized } from "@/lib/server/auth";
import { ensureDb } from "@/lib/server/db";
import { authRoutes } from "@/lib/server/routes/auth";
import { calendarRoutes } from "@/lib/server/routes/calendar";
import { error, MAX_BODY_BYTES, RouteContext } from "@/lib/server/routes/http";
import { noiseUsageRoutes } from "@/lib/server/routes/noise-usage";
import { noteRoutes } from "@/lib/server/routes/notes";
import { projectRoutes } from "@/lib/server/routes/projects";
import { plannedSessionRoutes } from "@/lib/server/routes/planned-sessions";
import { reportRoutes } from "@/lib/server/routes/reports";
import { sessionTaskRoutes } from "@/lib/server/routes/session-tasks";
import { sessionRoutes } from "@/lib/server/routes/sessions";
import { socialRoutes } from "@/lib/server/routes/social";
import { taskRoutes } from "@/lib/server/routes/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: NextRequest, context: RouteContext) {
  await ensureDb();
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return error("Request body is too large", 413);
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return error("Invalid request origin", 403);
  }

  const { path } = await context.params;
  if (path[0] === "health") return NextResponse.json({ ok: true });
  if (path[0] === "auth") return authRoutes(request, path);
  if (path[0] === "calendar" && path[1] === "feed") return calendarRoutes(request, path, null);

  const userId = await getUserId(request);
  if (!userId) return unauthorized();
  if (path[0] === "sessions" && path[2] === "tasks") return sessionTaskRoutes(request, path, userId);
  if (path[0] === "sessions") return sessionRoutes(request, path, userId);
  if (path[0] === "projects") return projectRoutes(request, path, userId);
  if (path[0] === "notes") return noteRoutes(request, path, userId);
  if (path[0] === "tasks") return taskRoutes(request, path, userId);
  if (path[0] === "planned-sessions") return plannedSessionRoutes(request, path, userId);
  if (path[0] === "noise-usage") return noiseUsageRoutes(request, path, userId);
  if (path[0] === "social") return socialRoutes(request, path, userId);
  if (path[0] === "reports") return reportRoutes(request, path, userId);
  if (path[0] === "calendar") return calendarRoutes(request, path, userId);
  return error("Not found", 404);
}

async function safely(request: NextRequest, context: RouteContext) {
  try {
    const response = await handle(request, context);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (caught) {
    console.error(caught);
    return error("Internal server error", 500);
  }
}

export const GET = safely;
export const POST = safely;
export const PUT = safely;
export const PATCH = safely;
export const DELETE = safely;
