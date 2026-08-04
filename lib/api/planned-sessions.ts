import { api } from "./core";
import type { Task } from "./tasks";

export type PlannedSession = {
  id: number;
  date_key: string;
  project_id: number;
  estimated_seconds: number;
  description: string | null;
  sort_order: number;
  tasks: Task[];
};

type PlannedSessionDetails = {
  dateKey?: string;
  projectId?: number;
  estimatedSeconds?: number;
  description?: string | null;
  taskIds?: number[];
};

export const plannedSessions = {
  list: (dateKey: string) => api<PlannedSession[]>(`/api/planned-sessions?date=${encodeURIComponent(dateKey)}`),
  create: (details: Required<Pick<PlannedSessionDetails, "dateKey" | "projectId" | "estimatedSeconds">> & Pick<PlannedSessionDetails, "description" | "taskIds">) =>
    api<PlannedSession>("/api/planned-sessions", { method: "POST", body: JSON.stringify(details) }),
  update: (id: number, details: PlannedSessionDetails) =>
    api<PlannedSession>(`/api/planned-sessions/${id}`, { method: "PATCH", body: JSON.stringify(details) }),
  reorder: (entries: Array<{ id: number; sortOrder: number }>) =>
    api<void>("/api/planned-sessions/reorder", { method: "PATCH", body: JSON.stringify({ entries }) }),
  remove: (id: number) => api<void>(`/api/planned-sessions/${id}`, { method: "DELETE" }),
  start: (id: number) => api<{ id: number; startedAt: string }>(`/api/planned-sessions/${id}/start`, { method: "POST" }),
};
