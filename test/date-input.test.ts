// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { combineLocalDateAndTime, dateInputValue, parseLocalDateTime, timeInputValue } from "@/lib/date";
import { sessionFormDates, validateSessionFormDates } from "@/lib/session-form";

const originalTimezone = process.env.TZ;

describe("local date/time inputs", () => {
  beforeAll(() => { process.env.TZ = "America/New_York"; });
  afterAll(() => { process.env.TZ = originalTimezone; });

  it("formats input values from local fields instead of the UTC day", () => {
    const instant = new Date("2026-01-01T02:30:00.000Z");
    expect(dateInputValue(instant)).toBe("2025-12-31");
    expect(timeInputValue(instant)).toBe("21:30");
  });

  it("round-trips local fields and combines time without changing the calendar day", () => {
    const parsed = parseLocalDateTime("2026-08-02", "07:15");
    const combined = combineLocalDateAndTime(new Date("2026-08-03T03:45:00.000Z"), "07:15");
    expect(dateInputValue(parsed)).toBe("2026-08-02");
    expect(timeInputValue(parsed)).toBe("07:15");
    expect(dateInputValue(combined)).toBe("2026-08-02");
  });

  it("rejects normalized calendar values and nonexistent local times", () => {
    expect(parseLocalDateTime("2026-02-30", "07:15").getTime()).toBeNaN();
    expect(parseLocalDateTime("2026-03-08", "02:30").getTime()).toBeNaN();
    expect(parseLocalDateTime("not-a-date", "07:15").getTime()).toBeNaN();
  });

  it("uses real local elapsed time across DST and still rejects overnight ranges", () => {
    const spring = sessionFormDates("2026-03-08", "01:30", "03:30", false);
    expect(spring.endedAt!.getTime() - spring.startedAt.getTime()).toBe(60 * 60 * 1000);

    const overnight = sessionFormDates("2026-08-02", "23:30", "00:30", false);
    expect(validateSessionFormDates(overnight.startedAt, overnight.endedAt, new Date("2026-08-03T12:00:00-04:00")))
      .toBe("End time must be after start time.");
  });
});
