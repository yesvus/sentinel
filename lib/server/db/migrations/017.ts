import type { Migration } from "../helpers";

export const migration017: Migration = {
  version: 17,
  async up({ db }) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS planned_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        date_key TEXT NOT NULL,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        estimated_seconds INTEGER NOT NULL,
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS planned_session_tasks (
        planned_session_id INTEGER NOT NULL REFERENCES planned_sessions(id),
        task_id INTEGER NOT NULL UNIQUE REFERENCES tasks(id),
        PRIMARY KEY (planned_session_id, task_id)
      )
    `);
  },
};
