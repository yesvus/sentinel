// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH, POST, PUT } from "@/app/api/[...path]/route";
import { db, ensureDb } from "@/lib/server/db";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const handlers = { GET, POST, PUT, PATCH, DELETE };

async function request(
  method: Method,
  path: string,
  options: { body?: unknown; rawBody?: string; cookie?: string; origin?: string; contentLength?: number } = {},
) {
  const headers = new Headers();
  if (options.body !== undefined || options.rawBody !== undefined) headers.set("content-type", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.origin) headers.set("origin", options.origin);
  if (options.contentLength !== undefined) headers.set("content-length", String(options.contentLength));
  const nextRequest = new NextRequest(`http://localhost:3000/api/${path}`, {
    method,
    headers,
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  const response = await handlers[method](nextRequest, {
    params: Promise.resolve({ path: path.split("?")[0].split("/") }),
  });
  const responseBody = response.status === 204
    ? null
    : response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : await response.text();
  return { response, body: responseBody };
}

async function register(email: string) {
  const result = await request("POST", "auth/register", {
    body: { email, password: "password1" },
  });
  expect(result.response.status).toBe(201);
  return result.response.headers.get("set-cookie")!.split(";")[0];
}

beforeEach(async () => {
  await ensureDb();
  for (const table of ["auth_rate_limits", "auth_sessions", "weekly_reports", "social_notifications", "friendships", "notes", "focus_noise_usage", "session_tasks", "tasks", "sessions", "projects", "users"]) {
    await db.execute(`DELETE FROM ${table}`);
  }
});

describe("Next API", () => {
  it("keeps public and authenticated dispatcher behavior stable", async () => {
    const health = await request("GET", "health");
    expect(health.response.status).toBe(200);
    expect(health.body).toEqual({ ok: true });
    expect(health.response.headers.get("cache-control")).toBe("no-store");

    const anonymousUnknown = await request("GET", "unknown");
    expect(anonymousUnknown.response.status).toBe(401);
    expect(anonymousUnknown.body).toEqual({ error: "Not authenticated" });

    const cookie = await register("dispatcher@example.test");
    const authenticatedUnknown = await request("GET", "unknown", { cookie });
    expect(authenticatedUnknown.response.status).toBe(404);
    expect(authenticatedUnknown.body).toEqual({ error: "Not found" });
    expect(authenticatedUnknown.response.headers.get("cache-control")).toBe("no-store");
  });

  it("treats malformed JSON like an empty request body", async () => {
    const malformed = await request("POST", "auth/login", { rawBody: "{" });
    const empty = await request("POST", "auth/login", { body: {} });

    expect(malformed.response.status).toBe(400);
    expect(malformed.body).toEqual({ error: "Email and password are required" });
    expect(malformed.body).toEqual(empty.body);
    expect(malformed.response.headers.get("cache-control")).toBe("no-store");
  });

  it("serves calendar feeds without an authenticated cookie", async () => {
    const cookie = await register("calendar-dispatch@example.test");
    const token = await request("POST", "calendar/token", { cookie });
    const feed = await request("GET", `calendar/feed?token=${token.body.token}`);

    expect(feed.response.status).toBe(200);
    expect(feed.response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(feed.response.headers.get("cache-control")).toBe("no-store");
    expect(feed.body).toContain("BEGIN:VCALENDAR\r\n");
  });

  it("registers a user and authenticates the cookie", async () => {
    const cookie = await register("person@example.test");
    const me = await request("GET", "auth/me", { cookie });

    expect(me.response.status).toBe(200);
    expect(me.body).toMatchObject({
      email: "person@example.test",
      shareSessionDescriptions: false,
      autoStartNoise: false,
      focusAudioType: "speech-blocker",
      defaultSessionType: "learning",
      sessionPauseTimeoutMinutes: 30,
    });
  });

  it("rejects cross-origin mutations and oversized bodies", async () => {
    const crossOrigin = await request("POST", "auth/login", {
      origin: "https://attacker.example",
      body: { email: "person@example.test", password: "password1" },
    });
    expect(crossOrigin.response.status).toBe(403);

    const oversized = await request("POST", "auth/login", {
      contentLength: 65 * 1024,
      body: { email: "person@example.test", password: "password1" },
    });
    expect(oversized.response.status).toBe(413);
  });

  it("validates profile fields", async () => {
    const cookie = await register("profile@example.test");
    expect((await request("PATCH", "auth/me", {
      cookie,
      body: { name: "x".repeat(101) },
    })).response.status).toBe(400);
    expect((await request("PATCH", "auth/me", {
      cookie,
      body: { avatar: "https://attacker.example/avatar.svg" },
    })).response.status).toBe(400);
  });

  it("revokes the server-side session on logout", async () => {
    const cookie = await register("logout@example.test");
    expect((await request("GET", "auth/me", { cookie })).response.status).toBe(200);
    await request("POST", "auth/logout", { cookie });
    expect((await request("GET", "auth/me", { cookie })).response.status).toBe(401);
  });

  it("persists login throttling after repeated failures", async () => {
    await register("throttled@example.test");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await request("POST", "auth/login", {
        body: { email: "throttled@example.test", password: "wrong-password" },
      });
      expect(failed.response.status).toBe(401);
    }
    const limited = await request("POST", "auth/login", {
      body: { email: "throttled@example.test", password: "password1" },
    });
    expect(limited.response.status).toBe(429);
  });

  it("saves the default session type", async () => {
    const cookie = await register("session-default@example.test");
    const updated = await request("PATCH", "auth/session-settings", {
      cookie,
      body: { defaultSessionType: "producing" },
    });
    expect(updated.body.defaultSessionType).toBe("producing");
    expect((await request("GET", "auth/me", { cookie })).body.defaultSessionType).toBe("producing");
  });

  it("saves the paused session timeout", async () => {
    const cookie = await register("pause-setting@example.test");
    const updated = await request("PATCH", "auth/session-settings", {
      cookie,
      body: { sessionPauseTimeoutMinutes: 45 },
    });
    expect(updated.body.sessionPauseTimeoutMinutes).toBe(45);
    expect((await request("GET", "auth/me", { cookie })).body.sessionPauseTimeoutMinutes).toBe(45);
  });

  it("persists project metadata and day notes", async () => {
    const cookie = await register("projects@example.test");
    const project = await request("POST", "projects", {
      cookie,
      body: { name: "Thesis", description: "Long-term research", resources: "https://example.com/brief", icon: "book" },
    });
    const note = await request("PUT", "notes/day/2026-07-30", {
      cookie,
      body: { content: "Finished the outline" },
    });

    expect(project.body).toMatchObject({
      name: "Thesis",
      description: "Long-term research",
      resources: "https://example.com/brief",
      icon: "book",
    });
    expect(note.body.content).toBe("Finished the outline");
  });

  it("does not allow sessions to reference another user's project", async () => {
    const alice = await register("project-owner@example.test");
    const bob = await register("project-attacker@example.test");
    const project = await request("POST", "projects", {
      cookie: alice,
      body: { name: "Private project" },
    });

    const started = await request("POST", "sessions/start", {
      cookie: bob,
      body: { projectId: project.body.id },
    });
    expect(started.response.status).toBe(404);

    const imported = await request("POST", "sessions", {
      cookie: bob,
      body: {
        startedAt: "2026-07-30T08:00:00.000Z",
        endedAt: "2026-07-30T09:00:00.000Z",
        projectId: project.body.id,
      },
    });
    expect(imported.response.status).toBe(404);
  });

  it("supports three project levels and rejects invalid hierarchy moves", async () => {
    const cookie = await register("hierarchy@example.test");
    const root = await request("POST", "projects", { cookie, body: { name: "Erasmus", pinned: true } });
    const child = await request("POST", "projects", {
      cookie, body: { name: "Web Programming", parentId: root.body.id },
    });
    const leaf = await request("POST", "projects", {
      cookie, body: { name: "Authentication", parentId: child.body.id },
    });
    expect(leaf.body).toMatchObject({
      path: "Erasmus / Web Programming / Authentication",
      depth: 3,
    });

    const fourth = await request("POST", "projects", {
      cookie, body: { name: "Tokens", parentId: leaf.body.id },
    });
    expect(fourth.response.status).toBe(400);
    const duplicate = await request("POST", "projects", {
      cookie, body: { name: "web programming", parentId: root.body.id },
    });
    expect(duplicate.response.status).toBe(409);

    const cycle = await request("PATCH", `projects/${root.body.id}`, {
      cookie, body: { parentId: leaf.body.id },
    });
    expect(cycle.response.status).toBe(400);

    await request("PATCH", `projects/${root.body.id}`, { cookie, body: { archived: true } });
    const projects = await request("GET", "projects", { cookie });
    expect(projects.body.filter((project: { archived: boolean }) => project.archived)).toHaveLength(3);
    expect((await request("DELETE", `projects/${root.body.id}`, { cookie })).response.status).toBe(204);
    expect((await request("GET", "projects", { cookie })).body).toHaveLength(0);
  });

  it("keeps pinned projects first and reorders within sibling groups", async () => {
    const cookie = await register("project-order@example.test");
    const first = await request("POST", "projects", { cookie, body: { name: "First" } });
    const pinnedA = await request("POST", "projects", { cookie, body: { name: "Pinned A", pinned: true } });
    const pinnedB = await request("POST", "projects", { cookie, body: { name: "Pinned B", pinned: true } });
    await request("PATCH", `projects/${pinnedB.body.id}`, { cookie, body: { parentId: null, position: 0 } });

    const projects = (await request("GET", "projects", { cookie })).body;
    const ordered = [...projects].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder);
    expect(ordered.map((project) => project.id)).toEqual([pinnedB.body.id, pinnedA.body.id, first.body.id]);
  });

  it("records private focus audio usage intervals", async () => {
    const cookie = await register("focus-audio-metrics@example.test");
    const started = await request("POST", "noise-usage/start", {
      cookie,
      body: { audioType: "brown" },
    });
    expect(started.response.status).toBe(201);
    expect((await request("POST", `noise-usage/${started.body.id}/heartbeat`, { cookie })).response.status).toBe(204);
    expect((await request("POST", `noise-usage/${started.body.id}/stop`, { cookie })).response.status).toBe(204);

    const usage = await db.execute({
      sql: "SELECT audio_type, ended_at, duration_seconds FROM focus_noise_usage WHERE id = ?",
      args: [started.body.id],
    });
    expect(usage.rows[0]).toMatchObject({
      audio_type: "brown",
      ended_at: expect.any(String),
      duration_seconds: expect.any(Number),
    });
  });

  it("moves only past incomplete tasks into the backlog", async () => {
    const cookie = await register("backlog@example.test");
    const project = await request("POST", "projects", {
      cookie,
      body: { name: "Thesis" },
    });
    const past = await request("POST", "tasks", {
      cookie,
      body: { title: "Revise outline", periodStart: "2026-08-01", projectId: project.body.id },
    });
    const completed = await request("POST", "tasks", {
      cookie,
      body: { title: "Collect sources", periodStart: "2026-07-31", projectId: project.body.id },
    });
    await request("PATCH", `tasks/${completed.body.id}`, { cookie, body: { completed: true } });
    await request("POST", "tasks", {
      cookie,
      body: { title: "Write introduction", periodStart: "2026-08-02", projectId: project.body.id },
    });
    await request("POST", "tasks", {
      cookie,
      body: { title: "Unscheduled reading", periodStart: null },
    });

    const moved = await request("POST", "tasks/backlog", {
      cookie,
      body: { before: "2026-08-02" },
    });
    const tasks = await request("GET", "tasks", { cookie });

    expect(moved.response.status).toBe(200);
    expect(moved.body.moved).toEqual([
      expect.objectContaining({ id: past.body.id, period_start: null, project_id: project.body.id }),
    ]);
    expect(tasks.body.find((task: { id: number }) => task.id === past.body.id).period_start).toBeNull();
    expect(tasks.body.find((task: { id: number }) => task.id === completed.body.id).period_start).toBe("2026-07-31");
    expect(tasks.body.find((task: { title: string }) => task.title === "Write introduction").period_start).toBe("2026-08-02");
  });

  it("creates and updates optional task descriptions", async () => {
    const cookie = await register("task-description@example.test");
    const created = await request("POST", "tasks", {
      cookie,
      body: {
        title: "Draft the findings section",
        description: "Summarize the three strongest interview patterns.",
        periodStart: "2026-08-02",
      },
    });

    expect(created.response.status).toBe(201);
    expect(created.body.description).toBe("Summarize the three strongest interview patterns.");

    const updated = await request("PATCH", `tasks/${created.body.id}`, {
      cookie,
      body: { description: "  Link each pattern to supporting quotes.  " },
    });
    expect(updated.body.description).toBe("Link each pattern to supporting quotes.");

    const cleared = await request("PATCH", `tasks/${created.body.id}`, {
      cookie,
      body: { description: "" },
    });
    expect(cleared.body.description).toBeNull();
  });

  it("keeps a task's project fixed after creation", async () => {
    const cookie = await register("fixed-task-project@example.test");
    const first = await request("POST", "projects", { cookie, body: { name: "First" } });
    const second = await request("POST", "projects", { cookie, body: { name: "Second" } });
    const task = await request("POST", "tasks", {
      cookie,
      body: { title: "Fixed assignment", projectId: first.body.id },
    });
    const changed = await request("PATCH", `tasks/${task.body.id}`, {
      cookie,
      body: { projectId: second.body.id },
    });

    expect(changed.response.status).toBe(400);
    expect(changed.body.error).toBe("A task's project is fixed at creation");
    expect((await request("GET", "tasks", { cookie })).body[0].project_id).toBe(first.body.id);
  });

  it("returns an undone completed task to backlog and detaches it from sessions", async () => {
    const cookie = await register("undo-completed-task@example.test");
    const started = await request("POST", "sessions/start", { cookie });
    const task = await request("POST", "tasks", {
      cookie,
      body: { title: "Reopen this", periodStart: "2026-08-02", sessionId: started.body.id },
    });
    await request("PATCH", `tasks/${task.body.id}`, { cookie, body: { completed: true } });

    const undone = await request("PATCH", `tasks/${task.body.id}`, {
      cookie,
      body: { completed: false, periodStart: null },
    });
    expect(undone.body).toMatchObject({ completed_at: null, period_start: null });
    expect((await request("GET", `sessions/${started.body.id}/tasks`, { cookie })).body).toEqual([]);
  });

  it("treats every move to backlog as an authoritative session detach", async () => {
    const cookie = await register("backlog-detach@example.test");
    const started = await request("POST", "sessions/start", { cookie });
    const task = await request("POST", "tasks", {
      cookie,
      body: { title: "Detach this", periodStart: "2026-08-02", sessionId: started.body.id },
    });

    const moved = await request("PATCH", `tasks/${task.body.id}`, {
      cookie,
      body: { periodStart: null },
    });
    expect(moved.body).toMatchObject({ id: task.body.id, period_start: null });
    expect((await request("GET", `sessions/${started.body.id}/tasks`, { cookie })).body).toEqual([]);
  });

  it("rolls back task creation when attaching it fails", async () => {
    const cookie = await register("atomic-create-attach@example.test");
    const started = await request("POST", "sessions/start", { cookie });
    await db.execute("CREATE TEMP TRIGGER fail_task_attach BEFORE INSERT ON session_tasks BEGIN SELECT RAISE(ABORT, 'attach failed'); END");
    try {
      const failed = await request("POST", "tasks", {
        cookie,
        body: { title: "Must roll back", periodStart: "2026-08-02", sessionId: started.body.id },
      });
      expect(failed.response.status).toBe(500);
      expect((await request("GET", "tasks", { cookie })).body).toEqual([]);
    } finally {
      await db.execute("DROP TRIGGER fail_task_attach");
    }
  });

  it("rolls back session and task changes when membership replacement fails", async () => {
    const cookie = await register("atomic-session-membership@example.test");
    const session = await request("POST", "sessions", {
      cookie,
      body: { startedAt: "2026-08-02T08:00:00.000Z", endedAt: "2026-08-02T09:00:00.000Z", description: "Original" },
    });
    const backlogTask = await request("POST", "tasks", { cookie, body: { title: "Still backlog" } });
    await db.execute("CREATE TEMP TRIGGER fail_session_attach BEFORE INSERT ON session_tasks BEGIN SELECT RAISE(ABORT, 'membership failed'); END");
    try {
      const failed = await request("PATCH", `sessions/${session.body.id}`, {
        cookie,
        body: { description: "Must roll back", taskIds: [backlogTask.body.id], taskPeriodStart: "2026-08-02" },
      });
      expect(failed.response.status).toBe(500);
      expect((await request("GET", "sessions", { cookie })).body[0].description).toBe("Original");
      expect((await request("GET", "tasks", { cookie })).body[0]).toMatchObject({ completed_at: null, period_start: null });
    } finally {
      await db.execute("DROP TRIGGER fail_session_attach");
    }
  });

  it("attaches tasks created during an active session", async () => {
    const cookie = await register("active-session-task@example.test");
    const started = await request("POST", "sessions/start", { cookie });
    const created = await request("POST", "tasks", {
      cookie,
      body: {
        title: "Record the decision",
        description: "Capture why this approach won.",
        periodStart: "2026-08-02",
        sessionId: started.body.id,
      },
    });
    const attached = await request("GET", `sessions/${started.body.id}/tasks`, { cookie });

    expect(created.response.status).toBe(201);
    expect(attached.body).toEqual([
      expect.objectContaining({
        id: created.body.id,
        title: "Record the decision",
        description: "Capture why this approach won.",
      }),
    ]);
  });

  it("attaches an existing backlog task to an active session", async () => {
    const cookie = await register("attach-backlog@example.test");
    const started = await request("POST", "sessions/start", { cookie });
    const task = await request("POST", "tasks", {
      cookie,
      body: { title: "Pull from backlog" },
    });
    expect(task.body.period_start).toBeNull();

    const attached = await request("PATCH", `tasks/${task.body.id}`, {
      cookie,
      body: { sessionId: started.body.id, periodStart: "2026-08-02" },
    });
    expect(attached.response.status).toBe(200);
    expect(attached.body.period_start).toBe("2026-08-02");
    expect((await request("GET", `sessions/${started.body.id}/tasks`, { cookie })).body).toEqual([
      expect.objectContaining({ id: task.body.id, title: "Pull from backlog" }),
    ]);
  });

  it("rejects attaching a task to a completed session", async () => {
    const cookie = await register("attach-completed@example.test");
    const session = await request("POST", "sessions", {
      cookie,
      body: { startedAt: "2026-08-02T08:00:00.000Z", endedAt: "2026-08-02T09:00:00.000Z" },
    });
    const task = await request("POST", "tasks", {
      cookie,
      body: { title: "Too late" },
    });
    const attached = await request("PATCH", `tasks/${task.body.id}`, {
      cookie,
      body: { sessionId: session.body.id, title: "Must not change", periodStart: "2026-08-02" },
    });
    expect(attached.response.status).toBe(400);
    expect((await request("GET", "tasks", { cookie })).body[0]).toMatchObject({
      id: task.body.id, title: "Too late", period_start: null,
    });
  });

  it("rejects an unknown attachment session before changing task fields", async () => {
    const cookie = await register("attach-missing@example.test");
    const task = await request("POST", "tasks", {
      cookie,
      body: { title: "Keep unchanged" },
    });

    const attached = await request("PATCH", `tasks/${task.body.id}`, {
      cookie,
      body: { sessionId: 999_999, title: "Must not change", periodStart: "2026-08-02" },
    });
    expect(attached.response.status).toBe(404);
    expect((await request("GET", "tasks", { cookie })).body[0]).toMatchObject({
      id: task.body.id, title: "Keep unchanged", period_start: null,
    });
  });

  it("assigns completed tasks while editing a completed session", async () => {
    const cookie = await register("completed-session-tasks@example.test");
    const session = await request("POST", "sessions", {
      cookie,
      body: {
        startedAt: "2026-08-02T08:00:00.000Z",
        endedAt: "2026-08-02T09:00:00.000Z",
      },
    });
    const completedTask = await request("POST", "tasks", {
      cookie,
      body: { title: "Finished work", periodStart: "2026-08-02" },
    });
    const openTask = await request("POST", "tasks", {
      cookie,
      body: { title: "Still open", periodStart: "2026-08-02" },
    });
    const backlogTask = await request("POST", "tasks", {
      cookie,
      body: { title: "Finished from backlog", periodStart: null },
    });
    await request("PATCH", `tasks/${completedTask.body.id}`, { cookie, body: { completed: true } });

    const updated = await request("PATCH", `sessions/${session.body.id}`, {
      cookie,
      body: { taskIds: [completedTask.body.id] },
    });
    expect(updated.response.status).toBe(200);
    expect((await request("GET", `sessions/${session.body.id}/tasks`, { cookie })).body)
      .toEqual([expect.objectContaining({ id: completedTask.body.id, title: "Finished work" })]);

    const rejected = await request("PATCH", `sessions/${session.body.id}`, {
      cookie,
      body: { taskIds: [openTask.body.id] },
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.body.error).toBe("Only completed tasks or Backlog tasks can be assigned to a completed session");

    const withBacklog = await request("PATCH", `sessions/${session.body.id}`, {
      cookie,
      body: {
        taskIds: [completedTask.body.id, backlogTask.body.id],
        taskPeriodStart: "2026-08-02",
      },
    });
    expect(withBacklog.response.status).toBe(200);
    expect(withBacklog.body.attachedTasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: backlogTask.body.id, period_start: "2026-08-02", completed_at: expect.any(String) }),
    ]));
    expect(withBacklog.body.changedTasks).toEqual([
      expect.objectContaining({ id: backlogTask.body.id, period_start: "2026-08-02", completed_at: expect.any(String) }),
    ]);
    const attached = (await request("GET", `sessions/${session.body.id}/tasks`, { cookie })).body;
    expect(attached).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: backlogTask.body.id, period_start: "2026-08-02", completed_at: expect.any(String) }),
    ]));
  });

  it("creates a forgotten completed task directly on a completed session", async () => {
    const cookie = await register("forgotten-completed-task@example.test");
    const session = await request("POST", "sessions", {
      cookie,
      body: {
        startedAt: "2026-08-02T08:00:00.000Z",
        endedAt: "2026-08-02T09:00:00.000Z",
      },
    });
    const created = await request("POST", "tasks", {
      cookie,
      body: {
        title: "Forgotten finished task",
        periodStart: "2026-08-02",
        sessionId: session.body.id,
        completed: true,
      },
    });

    expect(created.response.status).toBe(201);
    expect(created.body.completed_at).toEqual(expect.any(String));
    expect((await request("GET", `sessions/${session.body.id}/tasks`, { cookie })).body)
      .toEqual([expect.objectContaining({ id: created.body.id, title: "Forgotten finished task" })]);
  });

  it("saves the final description when stopping a session", async () => {
    const cookie = await register("stop@example.test");
    const started = await request("POST", "sessions/start", {
      cookie,
      body: { description: "Initial notes" },
    });
    const stopped = await request("PATCH", `sessions/${started.body.id}/stop`, {
      cookie,
      body: { description: "Goal: done\nOutputs: tests\nNext: review" },
    });
    const sessions = await request("GET", "sessions", { cookie });

    expect(stopped.response.status).toBe(200);
    expect(stopped.body.description).toContain("Outputs: tests");
    expect(sessions.body[0]).toMatchObject({
      ended_at: expect.any(String),
      description: "Goal: done\nOutputs: tests\nNext: review",
    });
  });

  it("excludes persisted interruption pauses from session time", async () => {
    const cookie = await register("pause-session@example.test");
    const started = await request("POST", "sessions/start", { cookie });
    await request("PATCH", `sessions/${started.body.id}/pause`, { cookie });
    const paused = await request("GET", "sessions/active", { cookie });
    expect(paused.body.paused_at).toEqual(expect.any(String));

    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString();
    await db.execute({
      sql: "UPDATE sessions SET started_at = ?, paused_at = ?, paused_seconds = 60 WHERE id = ?",
      args: [tenMinutesAgo, twoMinutesAgo, started.body.id],
    });
    const resumed = await request("PATCH", `sessions/${started.body.id}/resume`, { cookie });
    expect(resumed.body.pausedSeconds).toBeGreaterThanOrEqual(179);
    expect(resumed.body.pausedSeconds).toBeLessThanOrEqual(181);

    const stopped = await request("PATCH", `sessions/${started.body.id}/stop`, { cookie });
    expect(stopped.body.durationSeconds).toBeGreaterThanOrEqual(418);
    expect(stopped.body.durationSeconds).toBeLessThanOrEqual(422);
  });

  it("automatically ends a session at its configured pause deadline", async () => {
    const cookie = await register("pause-expiry@example.test");
    await request("PATCH", "auth/session-settings", {
      cookie,
      body: { sessionPauseTimeoutMinutes: 5 },
    });
    const started = await request("POST", "sessions/start", { cookie });
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const sixMinutesAgo = new Date(Date.now() - 6 * 60_000).toISOString();
    await db.execute({
      sql: "UPDATE sessions SET started_at = ?, paused_at = ? WHERE id = ?",
      args: [tenMinutesAgo, sixMinutesAgo, started.body.id],
    });

    expect((await request("GET", "sessions/active", { cookie })).body).toBeNull();
    const recorded = (await request("GET", "sessions", { cookie })).body[0];
    expect(recorded.duration_seconds).toBeGreaterThanOrEqual(238);
    expect(recorded.duration_seconds).toBeLessThanOrEqual(242);
    expect(recorded.paused_at).toBeNull();
    expect(recorded.paused_seconds).toBe(300);
  });

  it("validates and persists a Learning–Producing allocation", async () => {
    const cookie = await register("allocation@example.test");
    const started = await request("POST", "sessions/start", { cookie });
    const invalid = await request("PATCH", `sessions/${started.body.id}/stop`, {
      cookie,
      body: { productionPercentage: 35 },
    });
    expect(invalid.response.status).toBe(400);

    const stopped = await request("PATCH", `sessions/${started.body.id}/stop`, {
      cookie,
      body: { productionPercentage: 70 },
    });
    expect(stopped.body.productionPercentage).toBe(70);
    expect((await request("GET", "sessions", { cookie })).body[0].production_percentage).toBe(70);

    const updated = await request("PATCH", `sessions/${started.body.id}`, {
      cookie,
      body: { productionPercentage: 20 },
    });
    expect(updated.body.productionPercentage).toBe(20);
  });

  it("finalizes and reuses timezone-scoped weekly reports", async () => {
    const cookie = await register("reports@example.test");
    await request("POST", "sessions", {
      cookie,
      body: {
        startedAt: "2026-07-22T08:00:00.000Z",
        endedAt: "2026-07-22T09:00:00.000Z",
        productionPercentage: 50,
      },
    });
    const first = await request("GET", "reports/weekly?timezone=UTC", { cookie });
    const report = first.body.find((item: { weekStart: string }) => item.weekStart === "2026-07-20");
    expect(report).toMatchObject({
      totalSeconds: 3600,
      learningSeconds: 1800,
      producingSeconds: 1800,
      activeDays: 1,
    });
    const second = await request("GET", "reports/weekly?timezone=UTC", { cookie });
    expect(second.body.find((item: { weekStart: string }) => item.weekStart === "2026-07-20").finalizedAt)
      .toBe(report.finalizedAt);
  });

  it("creates and revokes a private iCalendar activity feed", async () => {
    const cookie = await register("calendar@example.test");
    await request("POST", "sessions", {
      cookie,
      body: {
        startedAt: "2026-07-29T08:00:00.000Z",
        endedAt: "2026-07-29T09:00:00.000Z",
        description: "Write outline",
      },
    });
    const token = await request("POST", "calendar/token", { cookie });
    const feed = await request("GET", `calendar/feed?token=${token.body.token}`);
    expect(feed.response.status).toBe(200);
    expect(feed.response.headers.get("content-type")).toContain("text/calendar");
    expect(feed.body).toContain("BEGIN:VEVENT");
    expect(feed.body).toContain("Write outline");

    await request("DELETE", "calendar/token", { cookie });
    expect((await request("GET", `calendar/feed?token=${token.body.token}`)).response.status).toBe(404);
  });

  it("edits an active session without finishing it", async () => {
    const cookie = await register("active-edit@example.test");
    const started = await request("POST", "sessions/start", {
      cookie,
      body: { description: "Original" },
    });
    const correctedStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const updated = await request("PATCH", `sessions/${started.body.id}`, {
      cookie,
      body: { startedAt: correctedStart, description: "Still running" },
    });
    const active = await request("GET", "sessions/active", { cookie });

    expect(updated.body).toMatchObject({
      startedAt: correctedStart,
      endedAt: null,
      durationSeconds: null,
      description: "Still running",
    });
    expect(active.body).toMatchObject({
      started_at: correctedStart,
      ended_at: null,
      duration_seconds: null,
      description: "Still running",
    });
  });

  it("rejects a future start time for an active session", async () => {
    const cookie = await register("future-edit@example.test");
    const started = await request("POST", "sessions/start", { cookie });
    const updated = await request("PATCH", `sessions/${started.body.id}`, {
      cookie,
      body: { startedAt: new Date(Date.now() + 60_000).toISOString() },
    });

    expect(updated.response.status).toBe(400);
    expect(updated.body.error).toBe("startedAt cannot be in the future");
    expect((await request("GET", "sessions/active", { cookie })).body.id).toBe(started.body.id);
  });

  it("turns a completed session into the only ongoing session", async () => {
    const cookie = await register("resume-completed@example.test");
    const completed = await request("POST", "sessions", {
      cookie,
      body: {
        startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        endedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        productionPercentage: 70,
      },
    });

    const updated = await request("PATCH", `sessions/${completed.body.id}`, {
      cookie,
      body: { endedAt: null, productionPercentage: null },
    });

    expect(updated.response.status).toBe(200);
    expect(updated.body).toMatchObject({
      id: completed.body.id,
      endedAt: null,
      durationSeconds: null,
      productionPercentage: null,
    });
    expect((await request("GET", "sessions/active", { cookie })).body.id).toBe(completed.body.id);
  });

  it("rejects making a completed session ongoing when another is active", async () => {
    const cookie = await register("duplicate-active-edit@example.test");
    const completed = await request("POST", "sessions", {
      cookie,
      body: {
        startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        endedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    });
    const active = await request("POST", "sessions/start", { cookie });

    const updated = await request("PATCH", `sessions/${completed.body.id}`, {
      cookie,
      body: { endedAt: null },
    });

    expect(updated.response.status).toBe(409);
    expect(updated.body.error).toBe("A session is already in progress");
    expect(updated.body.session.id).toBe(active.body.id);
  });

  it("paginates history with a stable cursor and no duplicates", async () => {
    const cookie = await register("pagination@example.test");
    const startedAt = "2026-07-30T08:00:00.000Z";
    for (let index = 1; index <= 5; index += 1) {
      await request("POST", "sessions", {
        cookie,
        body: {
          startedAt,
          endedAt: `2026-07-30T08:0${index}:00.000Z`,
          description: `Session ${index}`,
        },
      });
    }

    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const page = await request(
        "GET",
        `sessions?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        { cookie }
      );
      expect(page.response.status).toBe(200);
      expect(page.body.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.body.items.map((session: { id: number }) => session.id));
      cursor = page.body.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(seen).toEqual([...seen].sort((a, b) => b - a));
  });

  it("only shares descriptions with confirmed friends after opt-in", async () => {
    const alice = await register("alice@example.test");
    const bob = await register("bob@example.test");
    const sent = await request("POST", "social/requests", {
      cookie: alice,
      body: { email: "bob@example.test" },
    });
    await request("PATCH", `social/requests/${sent.body.friendshipId}`, {
      cookie: bob,
      body: { action: "accept" },
    });
    await request("POST", "sessions/start", {
      cookie: bob,
      body: { description: "Private draft" },
    });

    const hidden = await request("GET", "social/activity", { cookie: alice });
    expect(hidden.body.items[0].description).toBeNull();

    await request("PATCH", "auth/privacy", {
      cookie: bob,
      body: { shareSessionDescriptions: true },
    });
    const shared = await request("GET", "social/activity", { cookie: alice });
    expect(shared.body.items[0].description).toBe("Private draft");
  });

  it("delivers persistent nudges only between confirmed friends", async () => {
    const alice = await register("nudge-alice@example.test");
    const bob = await register("nudge-bob@example.test");

    const blocked = await request("POST", "social/nudges/999999", { cookie: alice });
    expect(blocked.response.status).toBe(403);

    const sent = await request("POST", "social/requests", {
      cookie: alice,
      body: { email: "nudge-bob@example.test" },
    });
    await request("PATCH", `social/requests/${sent.body.friendshipId}`, {
      cookie: bob,
      body: { action: "accept" },
    });

    const connection = (await request("GET", "social/connections", { cookie: alice }))
      .body.find((item: { user: { email: string } }) => item.user.email === "nudge-bob@example.test");
    const nudge = await request("POST", `social/nudges/${connection.user.id}`, { cookie: alice });
    expect(nudge.response.status).toBe(201);
    const repeated = await request("POST", `social/nudges/${connection.user.id}`, { cookie: alice });
    expect(repeated.response.status).toBe(429);
    expect(repeated.body.error).toBe("You can nudge this friend again in 30 seconds");

    expect((await request("GET", "social/notifications", { cookie: alice })).body).toEqual([]);
    const received = await request("GET", "social/notifications", { cookie: bob });
    expect(received.body).toHaveLength(1);
    expect(received.body[0]).toMatchObject({
      id: nudge.body.id,
      type: "nudge",
      readAt: null,
      actor: { email: "nudge-alice@example.test" },
    });

    expect((await request("PATCH", "social/notifications", { cookie: bob })).response.status).toBe(204);
    expect((await request("GET", "social/notifications", { cookie: bob })).body[0].readAt).not.toBeNull();
  });

  it("lets a user dismiss individual notifications and clear the rest", async () => {
    const alice = await register("clear-alice@example.test");
    const bob = await register("clear-bob@example.test");
    const sent = await request("POST", "social/requests", {
      cookie: alice,
      body: { email: "clear-bob@example.test" },
    });
    await request("PATCH", `social/requests/${sent.body.friendshipId}`, {
      cookie: bob,
      body: { action: "accept" },
    });
    const connection = (await request("GET", "social/connections", { cookie: alice }))
      .body.find((item: { user: { email: string } }) => item.user.email === "clear-bob@example.test");

    const first = await request("POST", `social/nudges/${connection.user.id}`, { cookie: alice });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const cannotDismissOthers = await request("DELETE", `social/notifications/${first.body.id}`, { cookie: alice });
    expect(cannotDismissOthers.response.status).toBe(404);

    expect((await request("DELETE", `social/notifications/${first.body.id}`, { cookie: bob })).response.status).toBe(204);
    expect((await request("GET", "social/notifications", { cookie: bob })).body).toEqual([]);

    await request("POST", `social/nudges/${connection.user.id}`, { cookie: alice });
    expect((await request("GET", "social/notifications", { cookie: bob })).body).toHaveLength(1);
    expect((await request("DELETE", "social/notifications", { cookie: bob })).response.status).toBe(204);
    expect((await request("GET", "social/notifications", { cookie: bob })).body).toEqual([]);
  });

  it("paginates friend activity with a stable cursor, keeping active sessions first", async () => {
    const alice = await register("activity-page-alice@example.test");
    const bob = await register("activity-page-bob@example.test");
    const sent = await request("POST", "social/requests", {
      cookie: alice,
      body: { email: "activity-page-bob@example.test" },
    });
    await request("PATCH", `social/requests/${sent.body.friendshipId}`, {
      cookie: bob,
      body: { action: "accept" },
    });

    for (let index = 1; index <= 4; index += 1) {
      await request("POST", "sessions", {
        cookie: bob,
        body: {
          startedAt: "2026-07-30T08:00:00.000Z",
          endedAt: `2026-07-30T08:0${index}:00.000Z`,
          description: `Session ${index}`,
        },
      });
    }
    await request("POST", "sessions/start", { cookie: bob, body: {} });

    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const page: { response: Response; body: { items: { id: number; ended_at: string | null }[]; nextCursor: string | null } } = await request(
        "GET",
        `social/activity?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        { cookie: alice },
      );
      expect(page.response.status).toBe(200);
      expect(page.body.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.body.items.map((item) => item.id));
      cursor = page.body.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);

    const firstPage = await request("GET", "social/activity?limit=1", { cookie: alice });
    expect(firstPage.body.items[0].ended_at).toBeNull();
  });
});
