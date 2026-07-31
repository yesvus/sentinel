import "server-only";
import { createClient } from "@libsql/client";

const databaseUrl = process.env.TURSO_DATABASE_URL ?? "file:local.db";

if (process.env.VERCEL && !process.env.TURSO_DATABASE_URL) {
  throw new Error("TURSO_DATABASE_URL is required for hosted deployments");
}
if (process.env.TURSO_DATABASE_URL?.startsWith("libsql://") && !process.env.TURSO_AUTH_TOKEN) {
  throw new Error("TURSO_AUTH_TOKEN is required for a remote Turso database");
}

export const db = createClient({
  url: databaseUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initialization: Promise<void> | null = null;

async function columnExists(table: string, column: string) {
  const result = await db.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

async function addColumn(table: string, definition: string) {
  const column = definition.split(/\s+/, 1)[0];
  if (!(await columnExists(table, column))) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

async function migrate(version: number, statements: () => Promise<void>) {
  const applied = await db.execute({
    sql: "SELECT 1 FROM schema_migrations WHERE version = ?",
    args: [version],
  });
  if (applied.rows.length) return;
  await statements();
  await db.execute({
    sql: "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
    args: [version],
  });
}

async function initialize() {
  if (databaseUrl.startsWith("file:")) await db.execute("PRAGMA foreign_keys = ON");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
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

  await migrate(1, async () => {
    for (const definition of [
      "name TEXT",
      "avatar TEXT",
      "share_session_descriptions INTEGER NOT NULL DEFAULT 0",
      "auto_start_noise INTEGER NOT NULL DEFAULT 0",
      "focus_audio_type TEXT NOT NULL DEFAULT 'speech-blocker'",
      "default_session_type TEXT NOT NULL DEFAULT 'learning'",
      "calendar_token TEXT",
    ]) await addColumn("users", definition);

    for (const definition of [
      "icon TEXT",
      "description TEXT",
      "parent_id INTEGER REFERENCES projects(id)",
      "pinned INTEGER NOT NULL DEFAULT 0",
      "archived INTEGER NOT NULL DEFAULT 0",
    ]) await addColumn("projects", definition);

    await addColumn(
      "sessions",
      "production_percentage INTEGER CHECK (production_percentage IS NULL OR (production_percentage BETWEEN 0 AND 100 AND production_percentage % 10 = 0))",
    );
  });

  await migrate(2, async () => {
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
  });

  await migrate(3, async () => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auth_rate_limits (
        key_hash TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL,
        reset_at TEXT NOT NULL
      )
    `);
  });

  for (const statement of [
    "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions (expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week ON weekly_reports (user_id, week_start)",
    "CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id, status)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_session_per_user ON sessions (user_id) WHERE ended_at IS NULL",
    "CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON sessions (user_id, started_at)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_user_project ON sessions (user_id, project_id)",
    "CREATE INDEX IF NOT EXISTS idx_projects_user_parent ON projects (user_id, parent_id)",
    "CREATE INDEX IF NOT EXISTS idx_projects_user_archived ON projects (user_id, archived)",
  ]) await db.execute(statement);
}

export function ensureDb() {
  initialization ??= initialize();
  return initialization;
}
