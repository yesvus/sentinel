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

export type HistoryStatusFilter = "all" | "completed" | "ongoing";

export type HistoryFilters = {
  query: string;
  project: "all" | "none" | string;
  status: HistoryStatusFilter;
};

export function filterHistorySessions(sessionList: StudySession[], filters: HistoryFilters) {
  const query = filters.query.trim().toLocaleLowerCase();

  return sessionList.filter((session) => {
    if (filters.project === "none" && session.project_id !== null) return false;
    if (filters.project !== "all" && filters.project !== "none" && String(session.project_id) !== filters.project) {
      return false;
    }
    if (filters.status === "completed" && session.ended_at === null) return false;
    if (filters.status === "ongoing" && session.ended_at !== null) return false;
    if (!query) return true;

    return [session.description, session.project_path, session.project_name]
      .some((value) => value?.toLocaleLowerCase().includes(query));
  });
}

/** Sessions arrive newest-first; first-seen keys preserve week and day ordering. */
export function groupHistorySessions(sessionList: StudySession[], now: number, timeZone?: string): HistoryWeekGroup[] {
  const weeks: HistoryWeekGroup[] = [];
  const weekIndex = new Map<string, HistoryWeekGroup>();
  const dayIndex = new Map<string, HistoryDayGroup>();

  for (const session of sessionList) {
    const started = new Date(session.started_at);
    const currentWeekKey = weekKey(started, timeZone);
    const currentDayKey = dayKey(started, timeZone);
    const seconds = sessionDurationSeconds(session, now);

    let week = weekIndex.get(currentWeekKey);
    if (!week) {
      week = {
        key: currentWeekKey,
        weekStart: startOfWeek(started, timeZone),
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
      day = { key: currentDayKey, date: startOfDay(started, timeZone), sessions: [], totalSeconds: 0 };
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
