import { describe, expect, it } from "vitest";
import type { StudySession, Task } from "@/lib/api";
import {
  initialSessionForm,
  ongoingSessionAgeError,
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
    expect(validateSessionFormDates(new Date(Number.NaN), null, now)).toBe("Enter a valid date and time.");
    expect(validateSessionFormDates(new Date("2026-08-02T12:01:00"), null, now)).toBe("Start time cannot be in the future.");
    expect(validateSessionFormDates(new Date("2026-08-02T10:00:00"), new Date("2026-08-02T10:00:00"), now)).toBe("End time must be after start time.");
    expect(validateSessionFormDates(new Date("2026-08-02T10:00:00"), new Date("2026-08-02T11:00:00"), now)).toBeNull();
  });

  it("prevents old completed sessions from being marked ongoing", () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    expect(ongoingSessionAgeError(new Date("2026-08-03T00:00:00.000Z"), now)).toBeNull();
    expect(ongoingSessionAgeError(new Date("2026-08-02T23:59:59.000Z"), now))
      .toBe("Sessions started more than 12 hours ago cannot be marked ongoing.");
  });

  it("creates local dates on the selected calendar day", () => {
    const dates = sessionFormDates("2026-08-02", "09:00", "10:30", false);
    expect(dates.endedAt!.getTime() - dates.startedAt.getTime()).toBe(90 * 60 * 1000);
    expect([
      dates.startedAt.getFullYear(),
      dates.startedAt.getMonth(),
      dates.startedAt.getDate(),
      dates.startedAt.getHours(),
      dates.startedAt.getMinutes(),
    ]).toEqual([2026, 7, 2, 9, 0]);
  });
});
