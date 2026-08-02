import { api } from "./core";

export const calendar = {
  token: () => api<{ token: string }>("/api/calendar/token", { method: "POST" }),
  revoke: () => api<void>("/api/calendar/token", { method: "DELETE" }),
};
