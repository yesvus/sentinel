import type { Migration } from "../helpers";

export const migration006: Migration = {
  version: 6,
  async up({ db, addColumn }) {
    await addColumn("users", "plan_reminder_hour INTEGER NOT NULL DEFAULT 19");
    await addColumn("users", "plan_weekly_reminder_day INTEGER NOT NULL DEFAULT 0");
    await addColumn("users", "plan_weekly_reminder_hour INTEGER NOT NULL DEFAULT 19");
    await addColumn("users", "plan_context TEXT");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        period_start TEXT, -- NULL = backlog item on a project, not yet scheduled to a day
        project_id INTEGER REFERENCES projects(id),
        title TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS session_tasks (
        session_id INTEGER NOT NULL REFERENCES sessions(id),
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        PRIMARY KEY (session_id, task_id)
      )
    `);
  },
};
