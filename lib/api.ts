export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? "Something went wrong", body);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

export type User = {
  id: number;
  email: string;
  name: string | null;
  avatar: string | null;
  shareSessionDescriptions: boolean;
  autoStartNoise: boolean;
  focusAudioType: FocusAudioType;
};

export type FocusAudioType = "white" | "pink" | "brown" | "speech-blocker" | "binaural-40hz";

export const auth = {
  register: (email: string, password: string) =>
    api<User>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    api<User>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => api<void>("/api/auth/logout", { method: "POST" }),
  me: () => api<User>("/api/auth/me"),
  updateProfile: (details: { name?: string | null; avatar?: string | null }) =>
    api<{ name: string | null; avatar: string | null }>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(details),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<void>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  updatePrivacy: (shareSessionDescriptions: boolean) =>
    api<{ shareSessionDescriptions: boolean }>("/api/auth/privacy", {
      method: "PATCH",
      body: JSON.stringify({ shareSessionDescriptions }),
    }),
  updateAudioSettings: (details: { autoStartNoise?: boolean; focusAudioType?: FocusAudioType }) =>
    api<{ autoStartNoise: boolean; focusAudioType: FocusAudioType }>("/api/auth/audio-settings", {
      method: "PATCH",
      body: JSON.stringify(details),
    }),
};

export type StudySession = {
  id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  description: string | null;
  project_id: number | null;
  project_name: string | null;
  project_icon: string | null;
  production_percentage?: number | null;
};

export type SessionPage = { items: StudySession[]; nextCursor: string | null };

export const sessions = {
  start: (details?: { projectId?: number | null; description?: string | null }) =>
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
      endedAt?: string;
      productionPercentage?: number | null;
    }
  ) =>
    api<{
      id: number;
      description: string | null;
      projectId: number | null;
      startedAt: string;
      endedAt: string | null;
      durationSeconds: number | null;
      productionPercentage: number | null;
    }>(`/api/sessions/${id}`, { method: "PATCH", body: JSON.stringify(details) }),
  stop: (id: number, description?: string | null, productionPercentage?: number | null) =>
    api<{ id: number; endedAt: string; durationSeconds: number; description: string | null; productionPercentage: number | null }>(`/api/sessions/${id}/stop`, {
      method: "PATCH",
      body: JSON.stringify({ description, productionPercentage }),
    }),
  list: () => api<StudySession[]>("/api/sessions"),
  page: (cursor?: string | null, limit = 30) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set("cursor", cursor);
    return api<SessionPage>(`/api/sessions?${query}`);
  },
  getActive: () => api<StudySession | null>("/api/sessions/active"),
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

export type Note = { id: number; scope: "day" | "week"; date_key: string; content: string; updated_at: string };

export const notes = {
  list: () => api<Note[]>("/api/notes"),
  upsert: (scope: "day" | "week", dateKey: string, content: string) =>
    api<Note | undefined>(`/api/notes/${scope}/${dateKey}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
};

export type Project = { id: number; name: string; icon: string | null; description: string | null };

export const projects = {
  list: () => api<Project[]>("/api/projects"),
  create: (name: string, icon?: string | null, description?: string | null) =>
    api<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name, icon, description }) }),
  rename: (id: number, name: string, icon?: string | null, description?: string | null) =>
    api<Project>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, icon, description }),
    }),
  remove: (id: number) => api<void>(`/api/projects/${id}`, { method: "DELETE" }),
};

export type SocialUser = {
  id: number;
  name: string | null;
  email: string;
  avatar: string | null;
};

export type Connection = {
  friendshipId: number;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing" | "friend";
  user: SocialUser;
};

export type FriendActivity = {
  id: number;
  user_id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  description: string | null;
  project_name: string | null;
  project_icon: string | null;
  user_name: string | null;
  user_email: string;
  user_avatar: string | null;
};

export const social = {
  connections: () => api<Connection[]>("/api/social/connections"),
  request: (email: string) =>
    api<Connection>("/api/social/requests", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  respond: (friendshipId: number, action: "accept" | "decline") =>
    api<void>(`/api/social/requests/${friendshipId}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }),
  remove: (friendshipId: number) =>
    api<void>(`/api/social/connections/${friendshipId}`, { method: "DELETE" }),
  activity: () => api<FriendActivity[]>("/api/social/activity"),
};
