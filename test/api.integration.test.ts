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
  options: { body?: unknown; cookie?: string; origin?: string; contentLength?: number } = {},
) {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.origin) headers.set("origin", options.origin);
  if (options.contentLength !== undefined) headers.set("content-length", String(options.contentLength));
  const nextRequest = new NextRequest(`http://localhost:3000/api/${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
  for (const table of ["auth_rate_limits", "auth_sessions", "weekly_reports", "friendships", "notes", "sessions", "projects", "users"]) {
    await db.execute(`DELETE FROM ${table}`);
  }
});

describe("Next API", () => {
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

  it("persists project metadata and day notes", async () => {
    const cookie = await register("projects@example.test");
    const project = await request("POST", "projects", {
      cookie,
      body: { name: "Thesis", description: "Long-term research", icon: "book" },
    });
    const note = await request("PUT", "notes/day/2026-07-30", {
      cookie,
      body: { content: "Finished the outline" },
    });

    expect(project.body).toMatchObject({
      name: "Thesis",
      description: "Long-term research",
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
    expect((await request("DELETE", `projects/${root.body.id}`, { cookie })).response.status).toBe(409);
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
    expect(hidden.body[0].description).toBeNull();

    await request("PATCH", "auth/privacy", {
      cookie: bob,
      body: { shareSessionDescriptions: true },
    });
    const shared = await request("GET", "social/activity", { cookie: alice });
    expect(shared.body[0].description).toBe("Private draft");
  });
});
