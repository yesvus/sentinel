import type { StudySession, Task } from "@/lib/api";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function timeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  return {
    startedAt: new Date(`${date}T${startTime}`),
    endedAt: ongoing ? null : new Date(`${date}T${endTime}`),
  };
}

export function validateSessionFormDates(startedAt: Date, endedAt: Date | null, now = new Date()) {
  if (startedAt > now) return "Start time cannot be in the future.";
  if (endedAt && endedAt <= startedAt) return "End time must be after start time.";
  return null;
}

export function resolveAttachedTasks(
  selectedTaskIds: number[],
  availableTasks: Task[],
  currentTasks: Task[],
  periodStart: string,
  completedAt: string,
) {
  const byId = new Map([...availableTasks, ...currentTasks].map((task) => [task.id, task]));
  return selectedTaskIds.flatMap((taskId) => {
    const task = byId.get(taskId);
    if (!task) return [];
    if (task.completed_at !== null) return [task];
    return [{ ...task, completed_at: completedAt, period_start: periodStart }];
  });
}
