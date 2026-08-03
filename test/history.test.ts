import { describe, expect, it } from "vitest";
import type { Note, StudySession } from "@/lib/api";
import {
  filterHistorySessions,
  groupHistorySessions,
  historyExportFilename,
  historyNotesForDay,
  historyNotesForWeek,
} from "@/lib/history";

function session(id: number, startedAt: string, durationSeconds: number): StudySession {
  return {
    id,
    started_at: startedAt,
    ended_at: new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString(),
    duration_seconds: durationSeconds,
    description: null,
    project_id: null,
    project_name: null,
    project_icon: null,
  };
}

describe("history transformations", () => {
  it("groups sessions in first-seen week and day order and totals durations", () => {
    const sessions = [
      session(1, "2026-08-05T10:00:00", 1200),
      session(2, "2026-08-05T08:00:00", 600),
      session(3, "2026-07-29T08:00:00", 300),
    ];

    const weeks = groupHistorySessions(sessions, Date.now());

    expect(weeks).toHaveLength(2);
    expect(weeks[0].sessions.map(({ id }) => id)).toEqual([1, 2]);
    expect(weeks[0].days).toHaveLength(1);
    expect(weeks[0].days[0].totalSeconds).toBe(1800);
    expect(weeks[0].totalSeconds).toBe(1800);
    expect(weeks[1].sessions.map(({ id }) => id)).toEqual([3]);
  });

  it("selects notes for day and week exports", () => {
    const notes = [
      { id: 1, scope: "week", date_key: "2026-08-03", content: "Week" },
      { id: 2, scope: "day", date_key: "2026-08-05", content: "Day" },
      { id: 3, scope: "day", date_key: "2026-07-31", content: "Earlier" },
    ] as Note[];

    expect(historyNotesForDay(notes, "2026-08-05").map(({ id }) => id)).toEqual([2]);
    expect(historyNotesForWeek(notes, "2026-08-03").map(({ id }) => id)).toEqual([1, 2]);
  });

  it("builds stable export filenames for each scope", () => {
    expect(historyExportFilename("all", "", "2026-08-02")).toBe("sentinel-sessions-all-2026-08-02.csv");
    expect(historyExportFilename("week", "2026-07-27", "2026-08-02")).toBe("sentinel-sessions-week-2026-07-27.csv");
    expect(historyExportFilename("day", "2026-08-01", "2026-08-02")).toBe("sentinel-sessions-2026-08-01.csv");
  });

  it("filters by description, project, and completion status", () => {
    const completed = {
      ...session(1, "2026-08-05T10:00:00", 1200),
      description: "Write release notes",
      project_id: 7,
      project_name: "Sentinel",
      project_path: "Work / Sentinel",
    };
    const ongoing = {
      ...session(2, "2026-08-05T11:00:00", 600),
      ended_at: null,
      duration_seconds: null,
      description: "Read a chapter",
    };

    expect(filterHistorySessions([completed, ongoing], {
      query: "sentinel",
      project: "all",
      status: "all",
    }).map(({ id }) => id)).toEqual([1]);
    expect(filterHistorySessions([completed, ongoing], {
      query: "",
      project: "7",
      status: "completed",
    }).map(({ id }) => id)).toEqual([1]);
    expect(filterHistorySessions([completed, ongoing], {
      query: "",
      project: "none",
      status: "ongoing",
    }).map(({ id }) => id)).toEqual([2]);
  });
});
