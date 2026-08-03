import type { Migration } from "../helpers";

export const migration008: Migration = {
  version: 8,
  async up({ db, columnExists }) {
    // Some deployments already had migration 6 create `tasks` in its original shape
    // (scope/description columns, no project_id, period_start NOT NULL) before this table was
    // reworked. Rebuild to the current shape regardless of which starting shape is present.
    // session_tasks.task_id references this table, so foreign key checks must be off for the
    // rebuild-drop-rename.
    await db.execute("PRAGMA foreign_keys = OFF");
    try {
      await db.execute("DROP TABLE IF EXISTS tasks_new");
      await db.execute(`
        CREATE TABLE tasks_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          period_start TEXT,
          project_id INTEGER REFERENCES projects(id),
          title TEXT NOT NULL,
          completed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      const projectIdSelect = (await columnExists("tasks", "project_id")) ? "project_id" : "NULL";
      await db.execute(`
        INSERT INTO tasks_new (id, user_id, period_start, project_id, title, completed_at, created_at)
        SELECT id, user_id, period_start, ${projectIdSelect}, title, completed_at, created_at FROM tasks
      `);
      await db.execute(`DROP TABLE tasks`);
      await db.execute(`ALTER TABLE tasks_new RENAME TO tasks`);
    } finally {
      await db.execute("PRAGMA foreign_keys = ON");
    }
  },
};
