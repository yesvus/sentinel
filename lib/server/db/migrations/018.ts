import type { Migration } from "../helpers";

export const migration018: Migration = {
  version: 18,
  async up({ db }) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS api_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token_hash TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        last_used_at TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  },
};
