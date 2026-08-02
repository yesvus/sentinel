import type { Task } from "@/lib/api";
import { tasks as tasksApi } from "@/lib/api";

export const taskMutations = {
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
  return task.completed_at === null ? taskMutations.complete(task) : taskMutations.markUndone(task);
}
