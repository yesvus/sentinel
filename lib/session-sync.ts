export const BROADCAST_CHANNEL_NAME = "sentinel-session-sync";

export type SessionBroadcastMessage =
  | { type: "started"; id: number; startedAt: string; projectId: number | null; description: string | null }
  | { type: "stopped"; durationSeconds: number }
  | { type: "updated"; projectId: number | null; description: string | null; startedAt?: string };
