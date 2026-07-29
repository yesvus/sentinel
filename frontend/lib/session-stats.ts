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

export { NO_PROJECT_LABEL };
