import type { Migration } from "../helpers";

export const migration011: Migration = {
  version: 11,
  async up({ addColumn }) {
    await addColumn("sessions", "paused_at TEXT");
    await addColumn("sessions", "paused_seconds INTEGER NOT NULL DEFAULT 0");
    await addColumn("users", "session_pause_timeout_minutes INTEGER NOT NULL DEFAULT 30");
  },
};
