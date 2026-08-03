import { api } from "./core";

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
