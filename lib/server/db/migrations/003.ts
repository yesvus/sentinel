import type { Migration } from "../helpers";

export const migration003: Migration = {
  version: 3,
  async up({ db }) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auth_rate_limits (
        key_hash TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL,
        reset_at TEXT NOT NULL
      )
    `);
  },
};
