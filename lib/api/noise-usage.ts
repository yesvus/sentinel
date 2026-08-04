import type { FocusAudioType } from "./auth";
import { api } from "./core";

export const noiseUsage = {
  start: (audioType: FocusAudioType) =>
    api<{ id: number }>("/api/v1/noise-usage/start", {
      method: "POST",
      body: JSON.stringify({ audioType }),
    }),
  heartbeat: (id: number) => api<void>(`/api/v1/noise-usage/${id}/heartbeat`, { method: "POST" }),
  stop: (id: number, keepalive = false) =>
    api<void>(`/api/v1/noise-usage/${id}/stop`, { method: "POST", keepalive }),
};
