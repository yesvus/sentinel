import { createClient } from "@libsql/client";

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER,
      description TEXT,
      project_id INTEGER REFERENCES projects(id)
    )
  `);

  for (const column of ["description TEXT", "project_id INTEGER REFERENCES projects(id)"]) {
    try {
      await db.execute(`ALTER TABLE sessions ADD COLUMN ${column}`);
    } catch {
      // column already exists
    }
  }

  for (const column of ["name TEXT", "avatar TEXT"]) {
    try {
      await db.execute(`ALTER TABLE users ADD COLUMN ${column}`);
    } catch {
      // column already exists
    }
  }

  try {
    await db.execute(`ALTER TABLE projects ADD COLUMN icon TEXT`);
  } catch {
    // column already exists
  }

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

  // Resolve any duplicate "active" sessions from before this constraint existed (the
  // index creation below fails otherwise), keeping only the most recently started one.
  await db.execute(`
    DELETE FROM sessions
    WHERE ended_at IS NULL
    AND EXISTS (
      SELECT 1 FROM sessions s2
      WHERE s2.user_id = sessions.user_id
        AND s2.ended_at IS NULL
        AND s2.started_at > sessions.started_at
    )
  `);

  // Enforced at the DB level (not just in application code) so two concurrent
  // requests from different devices can't both create an active session.
  try {
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_session_per_user
      ON sessions (user_id) WHERE ended_at IS NULL
    `);
  } catch {
    // best-effort; the cleanup above should prevent this, but a schema hiccup here
    // must never take down every request the way an unguarded failure would
  }
}
