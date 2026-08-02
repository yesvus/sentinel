import { describe, expect, it } from "vitest";
import type { StudySession, Task } from "@/lib/api";
import {
  initialSessionForm,
  resolveAttachedTasks,
  sessionFormDates,
  validateSessionFormDates,
} from "@/lib/session-form";

const session: StudySession = {
  id: 1,
  started_at: "2026-08-02T09:15:00",
  ended_at: null,
  duration_seconds: null,
  description: "Focus",
  project_id: null,
  project_name: null,
  project_icon: null,
};

function task(id: number, completedAt: string | null): Task {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    completed_at: completedAt,
    period_start: null,
    project_id: null,
    project_name: null,
    project_icon: null,
  } as Task;
}

describe("session form transformations", () => {
  it("initializes an ongoing session with the supplied current time", () => {
    const form = initialSessionForm(session, [task(3, "2026-08-02T10:00:00Z")], new Date("2026-08-02T11:45:00"));

    expect(form).toMatchObject({
      date: "2026-08-02",
      startTime: "09:15",
      endTime: "11:45",
      ongoing: true,
      description: "Focus",
      selectedTaskIds: [3],
    });
  });

  it("validates future starts and non-positive completed ranges", () => {
    const now = new Date("2026-08-02T12:00:00");
    expect(validateSessionFormDates(new Date("2026-08-02T12:01:00"), null, now)).toBe("Start time cannot be in the future.");
    expect(validateSessionFormDates(new Date("2026-08-02T10:00:00"), new Date("2026-08-02T10:00:00"), now)).toBe("End time must be after start time.");
    expect(validateSessionFormDates(new Date("2026-08-02T10:00:00"), new Date("2026-08-02T11:00:00"), now)).toBeNull();
  });

  it("creates dates and marks selected backlog tasks completed for the session day", () => {
    const dates = sessionFormDates("2026-08-02", "09:00", "10:30", false);
    expect(dates.endedAt!.getTime() - dates.startedAt.getTime()).toBe(90 * 60 * 1000);

    const completed = task(1, "2026-08-01T08:00:00Z");
    const backlog = task(2, null);
    const attached = resolveAttachedTasks([2, 999, 1], [backlog, completed], [], "2026-08-02", "2026-08-02T12:00:00Z");
    expect(attached.map(({ id }) => id)).toEqual([2, 1]);
    expect(attached[0]).toMatchObject({ completed_at: "2026-08-02T12:00:00Z", period_start: "2026-08-02" });
    expect(attached[1]!).toBe(completed);
  });
});
