export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
  }
}

type CacheEntry = { expiresAt: number; value: unknown };
const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();

function cacheLifetime(path: string) {
  if (path === "/api/projects") return 60_000;
  if (path.startsWith("/api/sessions?")) return 30_000;
  if (path === "/api/notes") return 30_000;
  if (path === "/api/tasks") return 30_000;
  if (path.startsWith("/api/reports/weekly?")) return 10 * 60_000;
  return 0;
}

export function clearApiCache() {
  responseCache.clear();
  inFlightRequests.clear();
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? "GET";
  const lifetime = method === "GET" ? cacheLifetime(path) : 0;
  if (method !== "GET") clearApiCache();
  const cached = responseCache.get(path);
  if (lifetime && cached && cached.expiresAt > Date.now()) return cached.value as T;
  const pending = lifetime ? inFlightRequests.get(path) : null;
  if (pending) return pending as Promise<T>;

  const request = (async () => {
    const res = await fetch(path, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      if (res.status === 401) clearApiCache();
      const responseBody = await res.json().catch(() => ({}));
      throw new ApiError(res.status, responseBody.error ?? "Something went wrong", responseBody);
    }

    if (res.status === 204) return undefined as T;
    const value = await res.json() as T;
    if (lifetime) responseCache.set(path, { expiresAt: Date.now() + lifetime, value });
    return value;
  })();
  if (lifetime) inFlightRequests.set(path, request);
  try {
    return await request;
  } finally {
    if (lifetime) inFlightRequests.delete(path);
  }
}

export type User = {
  id: number;
  email: string;
  name: string | null;
  avatar: string | null;
  shareSessionDescriptions: boolean;
  autoStartNoise: boolean;
  focusAudioType: FocusAudioType;
  defaultSessionType: "learning" | "producing";
  trackProductionSplit: boolean;
  sessionPauseTimeoutMinutes: number;
  planReminderHour: number;
  planWeeklyReminderDay: number;
  planWeeklyReminderHour: number;
  planContext: string | null;
};

export type FocusAudioType = "white" | "pink" | "brown" | "speech-blocker" | "binaural-40hz";

export const noiseUsage = {
  start: (audioType: FocusAudioType) =>
    api<{ id: number }>("/api/noise-usage/start", {
      method: "POST",
      body: JSON.stringify({ audioType }),
    }),
  heartbeat: (id: number) => api<void>(`/api/noise-usage/${id}/heartbeat`, { method: "POST" }),
  stop: (id: number, keepalive = false) =>
    api<void>(`/api/noise-usage/${id}/stop`, { method: "POST", keepalive }),
};

export const auth = {
  register: (email: string, password: string) =>
    api<User>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    api<User>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => api<void>("/api/auth/logout", { method: "POST" }),
  me: () => api<User>("/api/auth/me"),
  updateProfile: (details: { name?: string | null; avatar?: string | null; planContext?: string | null }) =>
    api<{ name: string | null; avatar: string | null; planContext: string | null }>("/api/auth/me", {
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
  updateSessionSettings: (settings: {
    defaultSessionType?: "learning" | "producing";
    trackProductionSplit?: boolean;
    sessionPauseTimeoutMinutes?: number;
    planReminderHour?: number;
    planWeeklyReminderDay?: number;
    planWeeklyReminderHour?: number;
  }) =>
    api<{
      defaultSessionType: "learning" | "producing";
      trackProductionSplit: boolean;
      sessionPauseTimeoutMinutes: number;
      planReminderHour: number;
      planWeeklyReminderDay: number;
      planWeeklyReminderHour: number;
    }>("/api/auth/session-settings", { method: "PATCH", body: JSON.stringify(settings) }),
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

export type Note = { id: number; scope: "day" | "week" | "long-term"; date_key: string; content: string; updated_at: string };

export const LONG_TERM_NOTE_KEY = "long-term";

export const notes = {
  list: () => api<Note[]>("/api/notes"),
  upsert: (scope: "day" | "week" | "long-term", dateKey: string, content: string) =>
    api<Note | undefined>(`/api/notes/${scope}/${dateKey}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
};

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
  }) =>
    api<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(details) }),
  movePastToBacklog: (before: string) =>
    api<MoveToBacklogResult>("/api/tasks/backlog", {
      method: "POST",
      body: JSON.stringify({ before }),
    }),
  remove: (id: number) => api<void>(`/api/tasks/${id}`, { method: "DELETE" }),
};

export type Project = {
  id: number;
  name: string;
  icon: string | null;
  description: string | null;
  resources: string | null;
  parentId: number | null;
  pinned: boolean;
  archived: boolean;
  path: string;
  depth: number;
  sortOrder: number;
  lastUsedAt: string | null;
};

export const projects = {
  list: () => api<Project[]>("/api/projects"),
  create: (name: string, icon?: string | null, description?: string | null) =>
    api<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name, icon, description }) }),
  rename: (
    id: number,
    name: string,
    icon?: string | null,
    description?: string | null,
    parentId?: number | null,
    resources?: string | null,
  ) =>
    api<Project>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, icon, description, parentId, resources }),
    }),
  move: (id: number, parentId: number | null, position: number) =>
    api<Project>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ parentId, position }),
    }),
  updateState: (id: number, details: { pinned?: boolean; archived?: boolean }) =>
    api<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(details) }),
  remove: (id: number) => api<void>(`/api/projects/${id}`, { method: "DELETE" }),
};

export type WeeklyReport = {
  weekStart: string;
  weekEnd: string;
  timezone: string;
  totalSeconds: number;
  activeDays: number;
  medianSeconds: number | null;
  learningSeconds: number;
  producingSeconds: number;
  topProject: string | null;
  sessionCount: number;
  finalizedAt: string;
};

export const reports = {
  weekly: (timezone: string) =>
    api<WeeklyReport[]>(`/api/reports/weekly?timezone=${encodeURIComponent(timezone)}`),
};

export const calendar = {
  token: () => api<{ token: string }>("/api/calendar/token", { method: "POST" }),
  revoke: () => api<void>("/api/calendar/token", { method: "DELETE" }),
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
  paused_at?: string | null;
  paused_seconds?: number;
  description: string | null;
  project_name: string | null;
  project_icon: string | null;
  user_name: string | null;
  user_email: string;
  user_avatar: string | null;
};

export type FriendActivityPage = { items: FriendActivity[]; nextCursor: string | null };

export type SocialNotification = {
  id: number;
  type: "nudge";
  readAt: string | null;
  createdAt: string;
  actor: SocialUser;
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
  activity: (cursor?: string | null, limit = 20) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set("cursor", cursor);
    return api<FriendActivityPage>(`/api/social/activity?${query}`);
  },
  nudge: (userId: number) =>
    api<{ id: number }>(`/api/social/nudges/${userId}`, { method: "POST" }),
  notifications: () => api<SocialNotification[]>("/api/social/notifications"),
  readNotifications: () =>
    api<void>("/api/social/notifications", { method: "PATCH" }),
  dismissNotification: (id: number) =>
    api<void>(`/api/social/notifications/${id}`, { method: "DELETE" }),
  clearNotifications: () =>
    api<void>("/api/social/notifications", { method: "DELETE" }),
};
