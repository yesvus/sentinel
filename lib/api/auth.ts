import { api } from "./core";

export type FocusAudioType = "white" | "pink" | "brown" | "speech-blocker" | "binaural-40hz";

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
  timezone: string | null;
};

export const auth = {
  register: (email: string, password: string) =>
    api<User>("/api/v1/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    api<User>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => api<void>("/api/v1/auth/logout", { method: "POST" }),
  me: () => api<User>("/api/v1/auth/me"),
  updateProfile: (details: { name?: string | null; avatar?: string | null; planContext?: string | null }) =>
    api<{ name: string | null; avatar: string | null; planContext: string | null }>("/api/v1/auth/me", {
      method: "PATCH",
      body: JSON.stringify(details),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<void>("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  updatePrivacy: (shareSessionDescriptions: boolean) =>
    api<{ shareSessionDescriptions: boolean }>("/api/v1/auth/privacy", {
      method: "PATCH",
      body: JSON.stringify({ shareSessionDescriptions }),
    }),
  updateAudioSettings: (details: { autoStartNoise?: boolean; focusAudioType?: FocusAudioType }) =>
    api<{ autoStartNoise: boolean; focusAudioType: FocusAudioType }>("/api/v1/auth/audio-settings", {
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
    timezone?: string | null;
  }) =>
    api<{
      defaultSessionType: "learning" | "producing";
      trackProductionSplit: boolean;
      sessionPauseTimeoutMinutes: number;
      planReminderHour: number;
      planWeeklyReminderDay: number;
      planWeeklyReminderHour: number;
      timezone: string | null;
    }>("/api/v1/auth/session-settings", { method: "PATCH", body: JSON.stringify(settings) }),
};
