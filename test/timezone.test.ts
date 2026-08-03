// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKey,
  effectiveTimeZone,
  elapsedDaysInWeek,
  formatDayLabel,
  formatTime,
  isValidTimeZone,
  parseDateKey,
  startOfWeek,
  timeZoneOffsetLabel,
  weekKey,
} from "@/lib/date";
import { activityStreak, dailyTotals, weekStatsFor } from "@/lib/session-stats";
import type { StudySession } from "@/lib/api";

function session(id: number, startedAt: string): StudySession {
  return {
    id,
    started_at: startedAt,
    ended_at: new Date(new Date(startedAt).getTime() + 3_600_000).toISOString(),
    duration_seconds: 3600,
    description: null,
    project_id: null,
    project_name: null,
    project_icon: null,
  };
}

describe("timezone calendar helpers", () => {
  it("formats current UTC offsets for timezone labels", () => {
    const winter = new Date("2026-01-15T12:00:00.000Z");
    expect(timeZoneOffsetLabel("UTC", winter)).toBe("UTC+00:00");
    expect(timeZoneOffsetLabel("Europe/Istanbul", winter)).toBe("UTC+03:00");
    expect(timeZoneOffsetLabel("America/New_York", winter)).toBe("UTC−05:00");
  });
  it("validates Intl-supported IANA zones and resolves Auto", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Europe/Istanbul")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone(" America/New_York ")).toBe(false);
    expect(effectiveTimeZone(null, "Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(effectiveTimeZone("UTC", "Asia/Tokyo")).toBe("UTC");
  });

  it("assigns one instant to the selected zone's calendar day and formats its time", () => {
    const instant = new Date("2026-08-03T01:30:00.000Z");
    expect(dayKey(instant, "America/Los_Angeles")).toBe("2026-08-02");
    expect(dayKey(instant, "Asia/Tokyo")).toBe("2026-08-03");
    expect(formatTime(instant.toISOString(), "America/Los_Angeles")).toBe("18:30");
  });

  it("uses real zoned midnights across spring and fall DST transitions", () => {
    const spring = parseDateKey("2026-03-08", "America/New_York");
    const springNext = addDays(spring, 1, "America/New_York");
    expect(spring.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(springNext.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(springNext.getTime() - spring.getTime()).toBe(23 * 3_600_000);

    const fall = parseDateKey("2026-11-01", "America/New_York");
    const fallNext = addDays(fall, 1, "America/New_York");
    expect(fallNext.getTime() - fall.getTime()).toBe(25 * 3_600_000);

    const midnightGap = parseDateKey("2018-11-04", "America/Sao_Paulo");
    expect(midnightGap.toISOString()).toBe("2018-11-04T03:00:00.000Z");
    expect(dayKey(midnightGap, "America/Sao_Paulo")).toBe("2018-11-04");
  });

  it("derives Monday weeks and relative labels in the selected zone", () => {
    const sundayNightUtc = new Date("2026-08-03T01:00:00.000Z");
    expect(weekKey(sundayNightUtc, "America/Los_Angeles")).toBe("2026-07-27");
    expect(dayKey(startOfWeek(sundayNightUtc, "Asia/Tokyo"), "Asia/Tokyo")).toBe("2026-08-03");
    expect(formatDayLabel(
      new Date("2026-08-03T15:00:00.000Z"),
      new Date("2026-08-03T20:00:00.000Z"),
      "America/Los_Angeles",
    )).toBe("Today");
  });

  it("keeps daily totals, weeks, and streaks on selected-zone boundaries", () => {
    const sessions = [
      session(1, "2026-03-09T03:30:00.000Z"),
      session(2, "2026-03-09T05:30:00.000Z"),
    ];
    expect([...dailyTotals(sessions, Date.now(), "America/New_York").keys()]).toEqual([
      "2026-03-08",
      "2026-03-09",
    ]);
    expect(activityStreak(sessions, new Date("2026-03-09T16:00:00.000Z"), "America/New_York")).toBe(2);

    const weekStart = startOfWeek(new Date("2026-03-09T16:00:00.000Z"), "America/New_York");
    expect(weekStatsFor(sessions, weekStart, Date.now(), "America/New_York").trackedSeconds).toBe(3600);
  });

  it("counts elapsed days in a partial week instead of always assuming 7", () => {
    const monday = new Date("2026-08-03T00:00:00.000Z");
    const mondayNoon = new Date("2026-08-03T12:00:00.000Z").getTime();
    expect(elapsedDaysInWeek(monday, mondayNoon)).toBe(1);

    const wednesdayNoon = new Date("2026-08-05T12:00:00.000Z").getTime();
    expect(elapsedDaysInWeek(monday, wednesdayNoon)).toBe(3);

    const nextMondayNoon = new Date("2026-08-10T12:00:00.000Z").getTime();
    expect(elapsedDaysInWeek(monday, nextMondayNoon)).toBe(7);

    // A week that hasn't started yet still yields at least 1, to keep averages from dividing by zero.
    expect(elapsedDaysInWeek(monday, new Date("2026-07-27T12:00:00.000Z").getTime())).toBe(1);
  });
});
