import { api } from "./core";

export type Task = {
  id: number;
  /** null = backlog item on a project, not yet scheduled to a day. */
  period_start: string | null;
  project_id: number | null;
  title: string;
  description: string | null;
  completed_at: string | null;
};

export type MoveToBacklogResult = {
  moved: Task[];
};

export const tasks = {
  list: () => api<Task[]>("/api/tasks"),
  create: (
    periodStart: string | null,
    title: string,
    projectId?: number | null,
    description?: string | null,
    sessionId?: number,
    completed?: boolean,
  ) =>
    api<Task>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ periodStart, title, projectId, description, sessionId, completed }),
    }),
  update: (id: number, details: {
    title?: string;
    description?: string | null;
    periodStart?: string | null;
    completed?: boolean;
    sessionId?: number;
  }) =>
    api<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(details) }),
  backlog: () => api<Task[]>("/api/tasks/backlog"),
  movePastToBacklog: (before: string) =>
    api<MoveToBacklogResult>("/api/tasks/backlog", {
      method: "POST",
      body: JSON.stringify({ before }),
    }),
  remove: (id: number) => api<void>(`/api/tasks/${id}`, { method: "DELETE" }),
};
