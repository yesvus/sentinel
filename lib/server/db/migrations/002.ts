import type { Migration } from "../helpers";

export const migration002: Migration = {
  version: 2,
  async up({ db }) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        scope TEXT NOT NULL CHECK (scope IN ('day', 'week')),
        date_key TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, scope, date_key)
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS friendships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_id INTEGER NOT NULL REFERENCES users(id),
        addressee_id INTEGER NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (requester_id <> addressee_id),
        UNIQUE (requester_id, addressee_id)
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS weekly_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        week_start TEXT NOT NULL,
        timezone TEXT NOT NULL,
        calculation_version INTEGER NOT NULL DEFAULT 1,
        data_json TEXT NOT NULL,
        finalized_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, week_start, timezone, calculation_version)
      )
    `);
  },
};
