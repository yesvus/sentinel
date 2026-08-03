import type { Migration } from "../helpers";

export const migration004: Migration = {
  version: 4,
  async up({ db }) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS social_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        actor_id INTEGER NOT NULL REFERENCES users(id),
        type TEXT NOT NULL CHECK (type IN ('nudge')),
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  },
};
