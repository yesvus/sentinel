import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/api";
import { tasks as tasksApi } from "@/lib/api";
import { setAttachedTaskCompletion, setTaskCompletion, taskMutations } from "@/lib/task-mutations";

const task = (completed: boolean): Task => ({
  id: 7, title: "Task", description: null, project_id: null, period_start: "2026-08-02",
  completed_at: completed ? "2026-08-02T12:00:00.000Z" : null, sort_order: 0,
});

describe("semantic task mutations", () => {
  afterEach(() => vi.restoreAllMocks());

  it("marks completed tasks undone and returns them to backlog in one request", async () => {
    const update = vi.spyOn(tasksApi, "update").mockResolvedValue({ ...task(true), completed_at: null, period_start: null });
    await setTaskCompletion(task(true));
    expect(update).toHaveBeenCalledWith(7, { completed: false, periodStart: null });
  });

  it("uses focused payloads for scheduling and active-session attachment", async () => {
    const update = vi.spyOn(tasksApi, "update").mockResolvedValue(task(false));
    await taskMutations.schedule(task(false), "2026-08-03");
    await taskMutations.attachToActiveSession(task(false), 4, "2026-08-02");
    expect(update).toHaveBeenNthCalledWith(1, 7, { periodStart: "2026-08-03" });
    expect(update).toHaveBeenNthCalledWith(2, 7, { sessionId: 4, periodStart: "2026-08-02" });
  });

  it("defines moving to backlog as a single authoritative period change", async () => {
    const update = vi.spyOn(tasksApi, "update").mockResolvedValue({ ...task(false), period_start: null });
    await taskMutations.moveToBacklog(task(false));
    expect(update).toHaveBeenCalledWith(7, { periodStart: null });
  });

  it("unchecks an attached task without moving or detaching it", async () => {
    const update = vi.spyOn(tasksApi, "update").mockResolvedValue({ ...task(true), completed_at: null });
    await setAttachedTaskCompletion(task(true));
    expect(update).toHaveBeenCalledWith(7, { completed: false });
  });
});
