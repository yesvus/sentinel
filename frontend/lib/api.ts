const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? "Something went wrong");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

export type User = { id: number; email: string };

export const auth = {
  register: (email: string, password: string) =>
    api<User>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    api<User>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => api<void>("/api/auth/logout", { method: "POST" }),
  me: () => api<User>("/api/auth/me"),
};

export type StudySession = {
  id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  description: string | null;
  project_id: number | null;
  project_name: string | null;
};

export const sessions = {
  start: (details?: { projectId?: number | null; description?: string | null }) =>
    api<{ id: number; startedAt: string }>("/api/sessions/start", {
      method: "POST",
      body: JSON.stringify(details ?? {}),
    }),
  update: (id: number, details: { projectId?: number | null; description?: string | null }) =>
    api<{ id: number; description: string | null; projectId: number | null }>(
      `/api/sessions/${id}`,
      { method: "PATCH", body: JSON.stringify(details) }
    ),
  stop: (id: number) =>
    api<{ id: number; endedAt: string; durationSeconds: number }>(`/api/sessions/${id}/stop`, {
      method: "PATCH",
    }),
  list: () => api<StudySession[]>("/api/sessions"),
};

export type Project = { id: number; name: string };

export const projects = {
  list: () => api<Project[]>("/api/projects"),
  create: (name: string) =>
    api<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name }) }),
  rename: (id: number, name: string) =>
    api<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  remove: (id: number) => api<void>(`/api/projects/${id}`, { method: "DELETE" }),
};
