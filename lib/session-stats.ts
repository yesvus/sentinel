import { StudySession } from "./api";
import { addDateKeyDays, addDays, dayKey, parseDateKey } from "./date";

const NO_PROJECT_LABEL = "No project";

/** Live duration for an in-progress session, otherwise its stored duration. */
export function sessionDurationSeconds(session: StudySession, now: number) {
  return session.ended_at === null
    ? Math.max(0, Math.floor(
        ((session.paused_at ? new Date(session.paused_at).getTime() : now) - new Date(session.started_at).getTime()) / 1000
        - (session.paused_seconds ?? 0),
      ))
    : (session.duration_seconds ?? 0);
}

/**
 * Calculates the seconds of a session that occurred on a specific calendar day (YYYY-MM-DD).
 * For overnight sessions, this accurately splits the duration across the midnight boundary.
 * If pauses are present, they are prorated proportionally so the sum across days equals total duration.
 */
export function sessionSecondsOnDay(
  session: StudySession,
  targetDayKey: string,
  now: number,
  timeZone?: string,
): number {
  const start = new Date(session.started_at).getTime();
  if (Number.isNaN(start)) return 0;
  const end = session.ended_at !== null
    ? new Date(session.ended_at).getTime()
    : session.paused_at
      ? new Date(session.paused_at).getTime()
      : now;
  if (Number.isNaN(end) || end <= start) return 0;

  const startDay = dayKey(new Date(start), timeZone);
  const endDay = dayKey(new Date(end), timeZone);
  const netTotal = sessionDurationSeconds(session, now);
  if (netTotal <= 0) return 0;

  if (startDay === endDay) {
    return targetDayKey === startDay ? netTotal : 0;
  }

  if (targetDayKey !== startDay && targetDayKey !== endDay) {
    return 0;
  }

  const startDayObj = parseDateKey(startDay, timeZone);
  const nextDayObj = addDays(startDayObj, 1, timeZone);
  const midnight = nextDayObj.getTime();

  const rawTotal = Math.max(1, end - start);
  const rawDay1 = Math.max(0, midnight - start);

  const day1Seconds = Math.max(0, Math.min(netTotal, Math.round(netTotal * (rawDay1 / rawTotal))));
  const day2Seconds = Math.max(0, netTotal - day1Seconds);

  return targetDayKey === startDay ? day1Seconds : day2Seconds;
}

export function dailyTotals(sessionList: StudySession[], now: number, timeZone?: string) {
  const totals = new Map<string, number>();
  for (const session of sessionList) {
    const start = new Date(session.started_at).getTime();
    const end = session.ended_at !== null
      ? new Date(session.ended_at).getTime()
      : session.paused_at
        ? new Date(session.paused_at).getTime()
        : now;
    const startKey = dayKey(new Date(start), timeZone);
    const endKey = dayKey(new Date(end), timeZone);
    if (startKey === endKey) {
      totals.set(startKey, (totals.get(startKey) ?? 0) + sessionDurationSeconds(session, now));
    } else {
      const day1 = sessionSecondsOnDay(session, startKey, now, timeZone);
      const day2 = sessionSecondsOnDay(session, endKey, now, timeZone);
      if (day1 > 0) totals.set(startKey, (totals.get(startKey) ?? 0) + day1);
      if (day2 > 0) totals.set(endKey, (totals.get(endKey) ?? 0) + day2);
    }
  }
  return totals;
}

export type DailyAllocation = {
  learning: number;
  producing: number;
  unclassified: number;
  total: number;
};

export function splitSessionDuration(session: StudySession, now: number) {
  const total = sessionDurationSeconds(session, now);
  if (session.production_percentage == null) {
    return { learning: total, producing: 0, unclassified: 0, total };
  }
  const producing = Math.round(total * session.production_percentage / 100);
  return { learning: total - producing, producing, unclassified: 0, total };
}

export function dailyAllocationTotals(sessionList: StudySession[], now: number, timeZone?: string) {
  const totals = new Map<string, DailyAllocation>();
  function addAllocation(key: string, seconds: number, productionPercentage: number | null | undefined) {
    if (seconds <= 0) return;
    const producing = productionPercentage == null ? 0 : Math.round(seconds * productionPercentage / 100);
    const learning = seconds - producing;
    const current = totals.get(key) ?? { learning: 0, producing: 0, unclassified: 0, total: 0 };
    totals.set(key, {
      learning: current.learning + learning,
      producing: current.producing + producing,
      unclassified: 0,
      total: current.total + seconds,
    });
  }

  for (const session of sessionList) {
    const start = new Date(session.started_at).getTime();
    const end = session.ended_at !== null
      ? new Date(session.ended_at).getTime()
      : session.paused_at
        ? new Date(session.paused_at).getTime()
        : now;
    const startKey = dayKey(new Date(start), timeZone);
    const endKey = dayKey(new Date(end), timeZone);
    if (startKey === endKey) {
      addAllocation(startKey, sessionDurationSeconds(session, now), session.production_percentage);
    } else {
      const day1 = sessionSecondsOnDay(session, startKey, now, timeZone);
      const day2 = sessionSecondsOnDay(session, endKey, now, timeZone);
      addAllocation(startKey, day1, session.production_percentage);
      addAllocation(endKey, day2, session.production_percentage);
    }
  }
  return totals;
}

export type ProjectTotal = { key: string; name: string; icon: string | null; seconds: number };

export function isSessionOnDay(
  session: StudySession,
  targetDayKey: string,
  now: number,
  timeZone?: string,
): boolean {
  const startDay = dayKey(new Date(session.started_at), timeZone);
  if (startDay === targetDayKey) return true;
  return sessionSecondsOnDay(session, targetDayKey, now, timeZone) > 0;
}

export function projectTotals(
  sessionList: StudySession[],
  now: number,
  targetDayKey?: string,
  timeZone?: string,
): ProjectTotal[] {
  const totals = new Map<string, ProjectTotal>();
  for (const session of sessionList) {
    const key = session.project_id !== null ? String(session.project_id) : "none";
    const existing = totals.get(key);
    let seconds = sessionDurationSeconds(session, now);
    if (targetDayKey && isSessionOnDay(session, targetDayKey, now, timeZone)) {
      seconds = sessionSecondsOnDay(session, targetDayKey, now, timeZone);
    }
    if (seconds <= 0) continue;
    totals.set(key, {
      key,
      name: session.project_name ?? NO_PROJECT_LABEL,
      icon: session.project_icon,
      seconds: (existing?.seconds ?? 0) + seconds,
    });
  }
  return Array.from(totals.values()).sort((a, b) => b.seconds - a.seconds);
}

export function medianCompletedSessionSeconds(sessionList: StudySession[]) {
  const durations = sessionList
    .filter((session) => session.ended_at !== null)
    .map((session) => session.duration_seconds ?? 0)
    .sort((a, b) => a - b);
  if (!durations.length) return null;
  const middle = Math.floor(durations.length / 2);
  return durations.length % 2
    ? durations[middle]
    : Math.round((durations[middle - 1] + durations[middle]) / 2);
}

export function activeDayKeys(sessionList: StudySession[], now = Date.now(), timeZone?: string): Set<string> {
  const active = new Set<string>();
  for (const session of sessionList) {
    if (session.ended_at === null) continue;
    const duration = session.duration_seconds ?? 0;
    if (duration <= 0) continue;
    const startKey = dayKey(new Date(session.started_at), timeZone);
    const endKey = dayKey(new Date(session.ended_at), timeZone);
    if (startKey === endKey) {
      active.add(startKey);
    } else {
      if (sessionSecondsOnDay(session, startKey, now, timeZone) > 0) active.add(startKey);
      if (sessionSecondsOnDay(session, endKey, now, timeZone) > 0) active.add(endKey);
    }
  }
  return active;
}

export function activityStreak(sessionList: StudySession[], now = new Date(), timeZone?: string) {
  const active = activeDayKeys(sessionList, now.getTime(), timeZone);
  let cursor = dayKey(now, timeZone);
  if (!active.has(cursor)) cursor = addDateKeyDays(cursor, -1);
  let current = 0;
  while (active.has(cursor)) {
    current += 1;
    cursor = addDateKeyDays(cursor, -1);
  }
  return current;
}

export function longestActivityStreak(sessionList: StudySession[], timeZone?: string) {
  const activeDays = Array.from(activeDayKeys(sessionList, Date.now(), timeZone)).sort();
  let longest = 0;
  let current = 0;
  let previous: string | null = null;
  for (const key of activeDays) {
    const consecutive = previous !== null && addDateKeyDays(previous, 1) === key;
    current = consecutive ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = key;
  }
  return longest;
}

export type WeekStats = {
  weekStart: Date;
  trackedSeconds: number;
  activeDays: number;
  learningPercent: number;
  topProject: string | null;
  topProjectSeconds: number;
  /** Tracked seconds for each of the 7 days starting at `weekStart` (Mon..Sun). */
  dailySeconds: number[];
};

/** Aggregates a 7-day window starting at `weekStart` (local midnight). */
export function weekStatsFor(sessionList: StudySession[], weekStart: Date, now: number, timeZone?: string): WeekStats {
  const startKey = dayKey(weekStart, timeZone);
  const endKey = addDateKeyDays(startKey, 7);
  const weekSessions = sessionList.filter((session) => {
    const start = dayKey(new Date(session.started_at), timeZone);
    const end = session.ended_at ? dayKey(new Date(session.ended_at), timeZone) : start;
    return (start >= startKey && start < endKey) || (end >= startKey && end < endKey);
  });
  const dailyMap = dailyTotals(weekSessions, now, timeZone);
  const allocation = dailyAllocationTotals(weekSessions, now, timeZone);
  let trackedSeconds = 0;
  let learningSeconds = 0;
  for (const [key, day] of allocation.entries()) {
    if (key >= startKey && key < endKey) {
      trackedSeconds += day.total;
      learningSeconds += day.learning;
    }
  }
  const dailySeconds = Array.from({ length: 7 }, (_, i) => dailyMap.get(dayKey(addDays(weekStart, i, timeZone), timeZone)) ?? 0);
  const activeDays = dailySeconds.filter((seconds) => seconds > 0).length;
  const topProjectEntry = projectTotals(weekSessions, now).filter((project) => project.name !== NO_PROJECT_LABEL)[0] ?? null;
  return {
    weekStart,
    trackedSeconds,
    activeDays,
    learningPercent: trackedSeconds ? Math.round((learningSeconds / trackedSeconds) * 100) : 0,
    topProject: topProjectEntry?.name ?? null,
    topProjectSeconds: topProjectEntry?.seconds ?? 0,
    dailySeconds,
  };
}

export type PartialWeekStats = { activeDays: number; trackedSeconds: number; learningPercent: number };

/** Aggregate stats for the days within `weekStart`'s week up to and including `throughDayKey`. */
export function partialWeekStats(
  sessionList: StudySession[],
  weekStart: Date,
  throughDayKey: string,
  now: number,
  timeZone?: string,
): PartialWeekStats {
  const startKey = dayKey(weekStart, timeZone);
  const endKey = addDateKeyDays(startKey, 7);
  const relevant = sessionList.filter((session) => {
    const start = dayKey(new Date(session.started_at), timeZone);
    const end = session.ended_at ? dayKey(new Date(session.ended_at), timeZone) : start;
    return (start >= startKey && start < endKey) || (end >= startKey && end < endKey);
  });
  const allocation = dailyAllocationTotals(relevant, now, timeZone);
  let trackedSeconds = 0;
  let learningSeconds = 0;
  let activeDays = 0;
  for (const [key, day] of allocation.entries()) {
    if (key >= startKey && key < endKey && key <= throughDayKey && day.total > 0) {
      trackedSeconds += day.total;
      learningSeconds += day.learning;
      activeDays += 1;
    }
  }
  return {
    activeDays,
    trackedSeconds,
    learningPercent: trackedSeconds ? Math.round((learningSeconds / trackedSeconds) * 100) : 0,
  };
}

export { NO_PROJECT_LABEL };
