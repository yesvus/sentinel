import type { Note, StudySession } from "@/lib/api";
import { dayKey, parseDateKey, startOfDay, startOfWeek, weekKey } from "@/lib/date";
import { sessionDurationSeconds } from "@/lib/session-stats";

export type HistoryDayGroup = {
  key: string;
  date: Date;
  sessions: StudySession[];
  totalSeconds: number;
};

export type HistoryWeekGroup = {
  key: string;
  weekStart: Date;
  days: HistoryDayGroup[];
  sessions: StudySession[];
  totalSeconds: number;
};

/** Sessions arrive newest-first; first-seen keys preserve week and day ordering. */
export function groupHistorySessions(sessionList: StudySession[], now: number): HistoryWeekGroup[] {
  const weeks: HistoryWeekGroup[] = [];
  const weekIndex = new Map<string, HistoryWeekGroup>();
  const dayIndex = new Map<string, HistoryDayGroup>();

  for (const session of sessionList) {
    const started = new Date(session.started_at);
    const currentWeekKey = weekKey(started);
    const currentDayKey = dayKey(started);
    const seconds = sessionDurationSeconds(session, now);

    let week = weekIndex.get(currentWeekKey);
    if (!week) {
      week = {
        key: currentWeekKey,
        weekStart: startOfWeek(started),
        days: [],
        sessions: [],
        totalSeconds: 0,
      };
      weekIndex.set(currentWeekKey, week);
      weeks.push(week);
    }

    const dayIndexKey = `${currentWeekKey}:${currentDayKey}`;
    let day = dayIndex.get(dayIndexKey);
    if (!day) {
      day = { key: currentDayKey, date: startOfDay(started), sessions: [], totalSeconds: 0 };
      dayIndex.set(dayIndexKey, day);
      week.days.push(day);
    }

    day.sessions.push(session);
    day.totalSeconds += seconds;
    week.sessions.push(session);
    week.totalSeconds += seconds;
  }

  return weeks;
}

export function historyExportFilename(
  scope: "all" | "week" | "day",
  key: string,
  today: string,
) {
  if (scope === "all") return `sentinel-sessions-all-${today}.csv`;
  if (scope === "week") return `sentinel-sessions-week-${key}.csv`;
  return `sentinel-sessions-${key}.csv`;
}

export function findHistoryNote(notes: Note[], scope: "day" | "week", key: string) {
  return notes.find((note) => note.scope === scope && note.date_key === key);
}

export function historyNotesForDay(notes: Note[], key: string) {
  return notes.filter((note) => note.scope === "day" && note.date_key === key);
}

export function historyNotesForWeek(notes: Note[], key: string) {
  return notes.filter(
    (note) =>
      (note.scope === "week" && note.date_key === key) ||
      (note.scope === "day" && weekKey(parseDateKey(note.date_key)) === key),
  );
}
