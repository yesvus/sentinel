import { api } from "./core";

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
