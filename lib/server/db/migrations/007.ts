import type { Migration } from "../helpers";

export const migration007: Migration = {
  version: 7,
  async up({ db }) {
    // SQLite can't ALTER a CHECK constraint in place; rebuild the table.
    await db.execute(`
      CREATE TABLE notes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        scope TEXT NOT NULL CHECK (scope IN ('day', 'week', 'long-term')),
        date_key TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, scope, date_key)
      )
    `);
    await db.execute(`INSERT INTO notes_new SELECT * FROM notes`);
    await db.execute(`DROP TABLE notes`);
    await db.execute(`ALTER TABLE notes_new RENAME TO notes`);
  },
};
