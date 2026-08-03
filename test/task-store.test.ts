import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/api";
import { tasks as tasksApi } from "@/lib/api";
import {
  removeTask,
  removeTaskFromSessions,
  replaceSessionTasks,
  replaceTaskInSessions,
  setAttachedTaskCompletion,
  setTaskCompletion,
  taskStore,
  upsertTask,
  upsertTasks,
} from "@/lib/task-store";

const task = (id: number, title = `Task ${id}`): Task => ({
  id, title, description: null, project_id: null, period_start: null, completed_at: null, sort_order: 0,
});

const mutationTask = (completed: boolean): Task => ({
  id: 7, title: "Task", description: null, project_id: null, period_start: "2026-08-02",
  completed_at: completed ? "2026-08-02T12:00:00.000Z" : null, sort_order: 0,
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

describe("task mutations", () => {
  afterEach(() => vi.restoreAllMocks());

  it("marks completed tasks undone and returns them to backlog in one request", async () => {
    const update = vi.spyOn(tasksApi, "update").mockResolvedValue({ ...mutationTask(true), completed_at: null, period_start: null });
    await setTaskCompletion(mutationTask(true));
    expect(update).toHaveBeenCalledWith(7, { completed: false, periodStart: null });
  });

  it("uses focused payloads for scheduling and active-session attachment", async () => {
    const update = vi.spyOn(tasksApi, "update").mockResolvedValue(mutationTask(false));
    await taskStore.schedule(mutationTask(false), "2026-08-03");
    await taskStore.attachToActiveSession(mutationTask(false), 4, "2026-08-02");
    expect(update).toHaveBeenNthCalledWith(1, 7, { periodStart: "2026-08-03" });
    expect(update).toHaveBeenNthCalledWith(2, 7, { sessionId: 4, periodStart: "2026-08-02" });
  });

  it("defines moving to backlog as a single authoritative period change", async () => {
    const update = vi.spyOn(tasksApi, "update").mockResolvedValue({ ...mutationTask(false), period_start: null });
    await taskStore.moveToBacklog(mutationTask(false));
    expect(update).toHaveBeenCalledWith(7, { periodStart: null });
  });

  it("unchecks an attached task without moving or detaching it", async () => {
    const update = vi.spyOn(tasksApi, "update").mockResolvedValue({ ...mutationTask(true), completed_at: null });
    await setAttachedTaskCompletion(mutationTask(true));
    expect(update).toHaveBeenCalledWith(7, { completed: false });
  });
});
