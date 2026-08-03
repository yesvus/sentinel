import { StudySession } from "./api";
import { addDateKeyDays, addDays, dayKey } from "./date";

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

export function dailyTotals(sessionList: StudySession[], now: number, timeZone?: string) {
  const totals = new Map<string, number>();
  for (const session of sessionList) {
    const key = dayKey(new Date(session.started_at), timeZone);
    totals.set(key, (totals.get(key) ?? 0) + sessionDurationSeconds(session, now));
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
  for (const session of sessionList) {
    const key = dayKey(new Date(session.started_at), timeZone);
    const split = splitSessionDuration(session, now);
    const current = totals.get(key) ?? { learning: 0, producing: 0, unclassified: 0, total: 0 };
    totals.set(key, {
      learning: current.learning + split.learning,
      producing: current.producing + split.producing,
      unclassified: current.unclassified + split.unclassified,
      total: current.total + split.total,
    });
  }
  return totals;
}

export type ProjectTotal = { key: string; name: string; icon: string | null; seconds: number };

export function projectTotals(sessionList: StudySession[], now: number): ProjectTotal[] {
  const totals = new Map<string, ProjectTotal>();
  for (const session of sessionList) {
    const key = session.project_id !== null ? String(session.project_id) : "none";
    const existing = totals.get(key);
    totals.set(key, {
      key,
      name: session.project_name ?? NO_PROJECT_LABEL,
      icon: session.project_icon,
      seconds: (existing?.seconds ?? 0) + sessionDurationSeconds(session, now),
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

export function activityStreak(sessionList: StudySession[], now = new Date(), timeZone?: string) {
  const active = new Set(
    sessionList
      .filter((session) => session.ended_at !== null)
      .map((session) => dayKey(new Date(session.started_at), timeZone)),
  );
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
  const activeDays = Array.from(new Set(
    sessionList
      .filter((session) => session.ended_at !== null)
      .map((session) => dayKey(new Date(session.started_at), timeZone)),
  )).sort();
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
    const key = dayKey(new Date(session.started_at), timeZone);
    return key >= startKey && key < endKey;
  });
  const dailyMap = dailyTotals(weekSessions, now, timeZone);
  const allocation = dailyAllocationTotals(weekSessions, now, timeZone);
  let trackedSeconds = 0;
  let learningSeconds = 0;
  for (const day of allocation.values()) {
    trackedSeconds += day.total;
    learningSeconds += day.learning;
  }
  const activeDays = Array.from(dailyMap.values()).filter((seconds) => seconds > 0).length;
  const topProjectEntry = projectTotals(weekSessions, now).filter((project) => project.name !== NO_PROJECT_LABEL)[0] ?? null;
  const dailySeconds = Array.from({ length: 7 }, (_, i) => dailyMap.get(dayKey(addDays(weekStart, i, timeZone), timeZone)) ?? 0);
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
    const key = dayKey(new Date(session.started_at), timeZone);
    return key >= startKey && key < endKey && key <= throughDayKey;
  });
  const activeDayKeys = new Set(relevant.map((session) => dayKey(new Date(session.started_at), timeZone)));
  let trackedSeconds = 0;
  let learningSeconds = 0;
  for (const session of relevant) {
    const split = splitSessionDuration(session, now);
    trackedSeconds += split.total;
    learningSeconds += split.learning;
  }
  return {
    activeDays: activeDayKeys.size,
    trackedSeconds,
    learningPercent: trackedSeconds ? Math.round((learningSeconds / trackedSeconds) * 100) : 0,
  };
}

export { NO_PROJECT_LABEL };
