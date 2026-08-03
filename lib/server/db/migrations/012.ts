import type { Migration } from "../helpers";

export const migration012: Migration = {
  version: 12,
  async up({ db }) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS focus_noise_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        audio_type TEXT NOT NULL CHECK (audio_type IN ('white', 'pink', 'brown', 'speech-blocker', 'binaural-40hz')),
        started_at TEXT NOT NULL,
        last_heartbeat_at TEXT NOT NULL,
        ended_at TEXT,
        duration_seconds INTEGER
      )
    `);
  },
};
