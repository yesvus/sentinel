import type { Task } from "@/lib/api";

export type SessionTaskMap = Record<number, Task[]>;

export function upsertTask(tasks: Task[], task: Task) {
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index === -1) return [...tasks, task];
  return tasks.map((item, itemIndex) => itemIndex === index ? task : item);
}

export function upsertTasks(tasks: Task[], updates: Task[]) {
  return updates.reduce(upsertTask, tasks);
}

export function removeTask(tasks: Task[], taskId: number) {
  return tasks.filter((task) => task.id !== taskId);
}

export function replaceTaskInSessions(sessionTasks: SessionTaskMap, task: Task) {
  return Object.fromEntries(Object.entries(sessionTasks).map(([sessionId, tasks]) => [
    sessionId,
    tasks.map((item) => item.id === task.id ? task : item),
  ]));
}

export function removeTaskFromSessions(sessionTasks: SessionTaskMap, taskId: number) {
  return Object.fromEntries(Object.entries(sessionTasks).map(([sessionId, tasks]) => [
    sessionId,
    removeTask(tasks, taskId),
  ]));
}

export function replaceSessionTasks(sessionTasks: SessionTaskMap, sessionId: number, tasks: Task[]) {
  return { ...sessionTasks, [sessionId]: upsertTasks([], tasks) };
}
