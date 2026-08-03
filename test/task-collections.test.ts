import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/api";
import {
  removeTask,
  removeTaskFromSessions,
  replaceSessionTasks,
  replaceTaskInSessions,
  upsertTask,
  upsertTasks,
} from "@/lib/task-collections";

const task = (id: number, title = `Task ${id}`): Task => ({
  id, title, description: null, project_id: null, period_start: null, completed_at: null, sort_order: 0,
});

describe("task collections", () => {
  it("upserts one or many tasks without duplicate appends", () => {
    expect(upsertTask([task(1)], task(1, "Changed"))).toEqual([task(1, "Changed")]);
    expect(upsertTasks([task(1)], [task(1, "Changed"), task(2)])).toEqual([task(1, "Changed"), task(2)]);
    expect(removeTask([task(1), task(2)], 1)).toEqual([task(2)]);
  });

  it("replaces and removes a task across every nested session list", () => {
    const sessions = { 10: [task(1), task(2)], 11: [task(1)] };
    expect(replaceTaskInSessions(sessions, task(1, "Changed"))).toEqual({
      10: [task(1, "Changed"), task(2)], 11: [task(1, "Changed")],
    });
    expect(removeTaskFromSessions(sessions, 1)).toEqual({ 10: [task(2)], 11: [] });
    expect(replaceSessionTasks(sessions, 10, [task(2), task(2, "Latest")])[10]).toEqual([task(2, "Latest")]);
  });
});
