import { api } from "./core";
import type { Task } from "./tasks";

export type StudySession = {
  id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  description: string | null;
  project_id: number | null;
  project_name: string | null;
  project_icon: string | null;
  project_path?: string | null;
  root_project_id?: number | null;
  root_project_name?: string | null;
  root_project_icon?: string | null;
  project_archived?: number | boolean | null;
  production_percentage?: number | null;
  paused_at?: string | null;
  paused_seconds?: number;
};

export type SessionPage = { items: StudySession[]; nextCursor: string | null };

export type SessionUpdateResult = {
  id: number;
  description: string | null;
  projectId: number | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  productionPercentage: number | null;
  activeSession: StudySession | null;
  attachedTasks?: Task[];
  changedTasks?: Task[];
};

export const sessions = {
  start: (details?: { projectId?: number | null; description?: string | null; taskIds?: number[] }) =>
    api<{ id: number; startedAt: string }>("/api/sessions/start", {
      method: "POST",
      body: JSON.stringify(details ?? {}),
    }),
  update: (
    id: number,
    details: {
      projectId?: number | null;
      description?: string | null;
      startedAt?: string;
      endedAt?: string | null;
      productionPercentage?: number | null;
      taskIds?: number[];
      taskPeriodStart?: string;
    }
  ) =>
    api<SessionUpdateResult>(`/api/sessions/${id}`, { method: "PATCH", body: JSON.stringify(details) }),
  stop: (id: number, description?: string | null, productionPercentage?: number | null) =>
    api<{ id: number; endedAt: string; durationSeconds: number; description: string | null; productionPercentage: number | null }>(`/api/sessions/${id}/stop`, {
      method: "PATCH",
      body: JSON.stringify({ description, productionPercentage }),
    }),
  pause: (id: number) =>
    api<{ id: number; pausedAt: string; pausedSeconds: number }>(`/api/sessions/${id}/pause`, { method: "PATCH" }),
  resume: (id: number) =>
    api<{ id: number; pausedAt: null; pausedSeconds: number }>(`/api/sessions/${id}/resume`, { method: "PATCH" }),
  expirePause: (id: number) =>
    api<{ ended: boolean; durationSeconds?: number; endedAt?: string }>(`/api/sessions/${id}/expire-pause`, { method: "PATCH" }),
  list: (range?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (range?.from) query.set("from", range.from);
    if (range?.to) query.set("to", range.to);
    return api<StudySession[]>(`/api/sessions${query.size ? `?${query}` : ""}`);
  },
  page: (cursor?: string | null, limit = 30) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set("cursor", cursor);
    return api<SessionPage>(`/api/sessions?${query}`);
  },
  getActive: () => api<StudySession | null>("/api/sessions/active"),
  tasks: (id: number) => api<Task[]>(`/api/sessions/${id}/tasks`),
  remove: (id: number) => api<void>(`/api/sessions/${id}`, { method: "DELETE" }),
  createManual: (details: {
    startedAt: string;
    endedAt: string;
    projectId?: number | null;
    description?: string | null;
    productionPercentage?: number | null;
  }) =>
    api<{ id: number; startedAt: string; endedAt: string; durationSeconds: number; productionPercentage: number | null }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify(details),
    }),
};
