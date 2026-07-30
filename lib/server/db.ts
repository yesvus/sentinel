import "server-only";
import { createClient } from "@libsql/client";

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initialization: Promise<void> | null = null;

async function initialize() {
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

  for (const column of [
    "name TEXT",
    "avatar TEXT",
    "share_session_descriptions INTEGER NOT NULL DEFAULT 0",
    "auto_start_noise INTEGER NOT NULL DEFAULT 0",
    "focus_audio_type TEXT NOT NULL DEFAULT 'speech-blocker'",
    "default_session_type TEXT NOT NULL DEFAULT 'learning'",
  ]) {
    try { await db.execute(`ALTER TABLE users ADD COLUMN ${column}`); } catch {}
  }
  for (const column of ["icon TEXT", "description TEXT"]) {
    try { await db.execute(`ALTER TABLE projects ADD COLUMN ${column}`); } catch {}
  }
  for (const column of [
    "parent_id INTEGER REFERENCES projects(id)",
    "pinned INTEGER NOT NULL DEFAULT 0",
    "archived INTEGER NOT NULL DEFAULT 0",
  ]) {
    try { await db.execute(`ALTER TABLE projects ADD COLUMN ${column}`); } catch {}
  }
  for (const column of [
    "description TEXT",
    "project_id INTEGER REFERENCES projects(id)",
    "production_percentage INTEGER CHECK (production_percentage IS NULL OR (production_percentage BETWEEN 0 AND 100 AND production_percentage % 10 = 0))",
  ]) {
    try { await db.execute(`ALTER TABLE sessions ADD COLUMN ${column}`); } catch {}
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
  await db.execute("CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week ON weekly_reports (user_id, week_start)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id, status)");
  await db.execute(`
    DELETE FROM sessions
    WHERE ended_at IS NULL AND EXISTS (
      SELECT 1 FROM sessions s2
      WHERE s2.user_id = sessions.user_id
        AND s2.ended_at IS NULL
        AND s2.started_at > sessions.started_at
    )
  `);
  try {
    await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_session_per_user ON sessions (user_id) WHERE ended_at IS NULL");
  } catch {}
  await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON sessions (user_id, started_at)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_project ON sessions (user_id, project_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_projects_user_parent ON projects (user_id, parent_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_projects_user_archived ON projects (user_id, archived)");
}

export function ensureDb() {
  initialization ??= initialize();
  return initialization;
}
