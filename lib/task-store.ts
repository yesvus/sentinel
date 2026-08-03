import type { Task } from "@/lib/api";
import { tasks as tasksApi } from "@/lib/api";

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

export const taskStore = {
  complete: (task: Task) => tasksApi.update(task.id, { completed: true }),
  schedule: (task: Task, periodStart: string) => tasksApi.update(task.id, { periodStart }),
  moveToBacklog: (task: Task) => tasksApi.update(task.id, { periodStart: null }),
  markUndone: (task: Task) => tasksApi.update(task.id, { completed: false, periodStart: null }),
  remove: async (task: Task | number) => {
    const id = typeof task === "number" ? task : task.id;
    await tasksApi.remove(id);
    return id;
  },
  movePastToBacklog: (before: string) => tasksApi.movePastToBacklog(before),
  attachToActiveSession: (task: Task, sessionId: number, periodStart?: string) =>
    tasksApi.update(task.id, {
      sessionId,
      ...(periodStart === undefined ? {} : { periodStart }),
    }),
};

export function setTaskCompletion(task: Task) {
  return task.completed_at === null ? taskStore.complete(task) : taskStore.markUndone(task);
}

export function setAttachedTaskCompletion(task: Task) {
  return tasksApi.update(task.id, { completed: task.completed_at === null });
}