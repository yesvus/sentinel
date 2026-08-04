import { api } from "./core";

export const calendar = {
  token: () => api<{ token: string }>("/api/v1/calendar/token", { method: "POST" }),
  revoke: () => api<void>("/api/v1/calendar/token", { method: "DELETE" }),
};
