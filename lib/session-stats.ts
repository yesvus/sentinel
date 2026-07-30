import { StudySession } from "./api";
import { dayKey } from "./date";

const NO_PROJECT_LABEL = "No project";

/** Live duration for an in-progress session, otherwise its stored duration. */
export function sessionDurationSeconds(session: StudySession, now: number) {
  return session.ended_at === null
    ? Math.max(0, Math.floor((now - new Date(session.started_at).getTime()) / 1000))
    : (session.duration_seconds ?? 0);
}

export function dailyTotals(sessionList: StudySession[], now: number) {
  const totals = new Map<string, number>();
  for (const session of sessionList) {
    const key = dayKey(new Date(session.started_at));
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

export function dailyAllocationTotals(sessionList: StudySession[], now: number) {
  const totals = new Map<string, DailyAllocation>();
  for (const session of sessionList) {
    const key = dayKey(new Date(session.started_at));
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
    const key = session.root_project_id != null
      ? String(session.root_project_id)
      : session.project_id !== null ? String(session.project_id) : "none";
    const existing = totals.get(key);
    totals.set(key, {
      key,
      name: session.root_project_name ?? session.project_name ?? NO_PROJECT_LABEL,
      icon: session.root_project_icon ?? session.project_icon,
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

export function activityStreak(sessionList: StudySession[], now = new Date()) {
  const active = new Set(
    sessionList
      .filter((session) => session.ended_at !== null)
      .map((session) => dayKey(new Date(session.started_at))),
  );
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!active.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (active.has(dayKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return current;
}

export { NO_PROJECT_LABEL };
