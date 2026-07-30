import { describe, expect, it } from "vitest";
import { sessionsToCsv } from "@/lib/export";
import { dailyAllocationTotals, dailyTotals, projectTotals, splitSessionDuration } from "@/lib/session-stats";
import { scheduledTheme } from "@/lib/theme-context";
import type { Project, StudySession } from "@/lib/api";

const session: StudySession = {
  id: 1,
  started_at: "2026-07-30T08:00:00.000Z",
  ended_at: "2026-07-30T09:00:00.000Z",
  duration_seconds: 3600,
  description: "Focused work",
  project_id: 2,
  project_name: "Thesis",
  project_icon: "book",
};
const project: Project = {
  id: 2,
  name: "Thesis",
  icon: "book",
  description: "Research project",
};

describe("statistics and exports", () => {
  it("aggregates daily and project duration without losing seconds", () => {
    const now = new Date("2026-07-30T10:00:00.000Z").getTime();
    expect([...dailyTotals([session], now).values()]).toEqual([3600]);
    expect(projectTotals([session], now)[0]).toMatchObject({ name: "Thesis", seconds: 3600 });
  });

  it("appends used project descriptions to CSV metadata rows", () => {
    const csv = sessionsToCsv([session], [], [project], Date.now());
    expect(csv).toContain("Session");
    expect(csv).toContain("Project,,,,,,Thesis,Research project");
  });

  it("splits classified time without losing rounding seconds", () => {
    const classified = { ...session, duration_seconds: 61, production_percentage: 30 };
    expect(splitSessionDuration(classified, Date.now())).toEqual({
      learning: 43,
      producing: 18,
      unclassified: 0,
      total: 61,
    });
    expect(dailyAllocationTotals([classified], Date.now()).values().next().value).toMatchObject({
      learning: 43,
      producing: 18,
      total: 61,
    });
  });

  it("counts sessions without a selection as Learning", () => {
    expect(splitSessionDuration(session, Date.now())).toEqual({
      learning: 3600,
      producing: 0,
      unclassified: 0,
      total: 3600,
    });
  });
});

describe("scheduled theme", () => {
  const schedule = { darkFrom: "20:00", lightFrom: "06:00" };

  it("uses dark overnight and light during the day", () => {
    expect(scheduledTheme(schedule, new Date(2026, 6, 30, 23, 0))).toBe("dark");
    expect(scheduledTheme(schedule, new Date(2026, 6, 30, 5, 59))).toBe("dark");
    expect(scheduledTheme(schedule, new Date(2026, 6, 30, 12, 0))).toBe("light");
  });
});
