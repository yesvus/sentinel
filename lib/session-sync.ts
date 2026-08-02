export const BROADCAST_CHANNEL_NAME = "sentinel-session-sync";

export type SessionBroadcastMessage =
  | { type: "started" }
  | { type: "stopped" }
  | { type: "paused" }
  | { type: "resumed" }
  | { type: "changed" };
