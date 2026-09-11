import type { StudySession, Task } from "@/lib/api";
import { addDateKeyDays, dateInputValue, parseLocalDateTime, timeInputValue } from "@/lib/date";

export const MAX_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

export function isFormOvernight(startTime: string, endTime: string) {
  return Boolean(startTime && endTime && endTime <= startTime);
}

export function initialSessionForm(session: StudySession, tasks: Task[], now = new Date()) {
  const start = new Date(session.started_at);
  const end = session.ended_at ? new Date(session.ended_at) : now;
  return {
    date: dateInputValue(start),
    startTime: timeInputValue(start),
    endTime: timeInputValue(end),
    ongoing: session.ended_at === null,
    description: session.description ?? "",
    selectedTaskIds: tasks.map((task) => task.id),
  };
}

export function sessionFormDates(date: string, startTime: string, endTime: string, ongoing: boolean) {
  const startedAt = parseLocalDateTime(date, startTime);
  if (ongoing) {
    return { startedAt, endedAt: null };
  }
  const endDate = isFormOvernight(startTime, endTime) ? addDateKeyDays(date, 1) : date;
  return {
    startedAt,
    endedAt: parseLocalDateTime(endDate, endTime),
  };
}

export function validateSessionFormDates(startedAt: Date, endedAt: Date | null, now = new Date()) {
  if (Number.isNaN(startedAt.getTime()) || (endedAt && Number.isNaN(endedAt.getTime()))) {
    return "Enter a valid date and time.";
  }
  if (startedAt > now) return "Start time cannot be in the future.";
  if (endedAt) {
    if (endedAt <= startedAt) return "End time must be after start time.";
    if (endedAt.getTime() - startedAt.getTime() > MAX_SESSION_DURATION_MS) {
      return "Sessions cannot exceed 12 hours.";
    }
  }
  return null;
}

export function ongoingSessionAgeError(startedAt: Date, now = new Date()) {
  return now.getTime() - startedAt.getTime() > MAX_SESSION_DURATION_MS
    ? "Sessions started more than 12 hours ago cannot be marked ongoing."
    : null;
}
