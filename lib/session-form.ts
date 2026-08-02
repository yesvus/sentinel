import type { StudySession, Task } from "@/lib/api";
import { dateInputValue, parseLocalDateTime, timeInputValue } from "@/lib/date";

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
  return {
    startedAt: parseLocalDateTime(date, startTime),
    endedAt: ongoing ? null : parseLocalDateTime(date, endTime),
  };
}

export function validateSessionFormDates(startedAt: Date, endedAt: Date | null, now = new Date()) {
  if (Number.isNaN(startedAt.getTime()) || (endedAt && Number.isNaN(endedAt.getTime()))) {
    return "Enter a valid date and time.";
  }
  if (startedAt > now) return "Start time cannot be in the future.";
  if (endedAt && endedAt <= startedAt) return "End time must be after start time.";
  return null;
}
