// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH, POST, PUT } from "@/app/api/[...path]/route";
import { db, ensureDb } from "@/lib/server/db";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const handlers = { GET, POST, PUT, PATCH, DELETE };

async function request(method: Method, path: string, options: { body?: unknown; cookie?: string } = {}) {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  const nextRequest = new NextRequest(`http://localhost:3000/api/${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const response = await handlers[method](nextRequest, {
    params: Promise.resolve({ path: path.split("/") }),
  });
  const responseBody = response.status === 204 ? null : await response.json();
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
  for (const table of ["friendships", "notes", "sessions", "projects", "users"]) {
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
    });
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
