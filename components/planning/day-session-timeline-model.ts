import type { StudySession, Task } from "@/lib/api";
import { sessionDurationSeconds, sessionSecondsOnDay } from "@/lib/session-stats";

export function buildDaySessionTimeline(
  sessions: StudySession[],
  sessionTasks: Record<number, Task[]>,
  now: number,
  selectedDayKey?: string,
  timeZone?: string,
) {
  return sessions.map((session) => {
    const totalDuration = sessionDurationSeconds(session, now);
    const dayDuration = selectedDayKey
      ? sessionSecondsOnDay(session, selectedDayKey, now, timeZone)
      : totalDuration;
    return {
      session,
      running: session.ended_at === null,
      duration: totalDuration,
      dayDuration,
      completedTasks: (sessionTasks[session.id] ?? []).filter((task) => task.completed_at !== null),
    };
  });
}
