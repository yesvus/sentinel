import type { StudySession, Task } from "@/lib/api";
import { sessionDurationSeconds } from "@/lib/session-stats";

export function buildDaySessionTimeline(
  sessions: StudySession[],
  sessionTasks: Record<number, Task[]>,
  now: number,
) {
  return sessions.map((session) => ({
    session,
    running: session.ended_at === null,
    duration: sessionDurationSeconds(session, now),
    completedTasks: (sessionTasks[session.id] ?? []).filter((task) => task.completed_at !== null),
  }));
}
