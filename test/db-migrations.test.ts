// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureDb } from "@/lib/server/db";
import { createBaseSchema } from "@/lib/server/db/base-schema";
import { applyMigration, createMigrationContext } from "@/lib/server/db/helpers";
import { migration006 } from "@/lib/server/db/migrations/006";
import { migration008 } from "@/lib/server/db/migrations/008";
import { migration009 } from "@/lib/server/db/migrations/009";
import { initializeDatabase } from "@/lib/server/db/orchestrator";

const temporaryDirectories: string[] = [];
const clients: Client[] = [];

async function temporaryDatabase() {
  const directory = await mkdtemp(path.join(tmpdir(), "sentinel-migrations-"));
  temporaryDirectories.push(directory);
  const url = `file:${path.join(directory, "database.db")}`;
  const client = createClient({ url });
  clients.push(client);
  return { client, url };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("database migrations", () => {
  it("keeps ensureDb single-flight across repeated calls", async () => {
    const first = ensureDb();
    const second = ensureDb();

    expect(second).toBe(first);
    await first;
    expect(ensureDb()).toBe(first);
  });

  it("initializes a fresh database in order with indexes and foreign keys", async () => {
    const { client, url } = await temporaryDatabase();

    await initializeDatabase(client, url);

    const applied = await client.execute("SELECT version FROM schema_migrations ORDER BY version");
    expect(applied.rows.map((row) => Number(row.version))).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
    const indexes = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_one_open_focus_noise_usage_per_user'",
    );
    expect(indexes.rows).toHaveLength(1);
    expect((await client.execute("PRAGMA foreign_keys")).rows[0].foreign_keys).toBe(1);
    const userColumns = await client.execute("PRAGMA table_info(users)");
    expect(userColumns.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "timezone", notnull: 0 }),
    ]));
  });

  it("can initialize an already-current database again without changing data", async () => {
    const { client, url } = await temporaryDatabase();
    await initializeDatabase(client, url);
    await client.execute({
      sql: "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      args: ["repeat@example.test", "hash"],
    });

    await initializeDatabase(client, url);

    expect((await client.execute("SELECT COUNT(*) AS count FROM schema_migrations")).rows[0].count).toBe(15);
    expect((await client.execute("SELECT email FROM users")).rows[0].email).toBe("repeat@example.test");
  });

  it("skips an applied migration and marks a migration only after it succeeds", async () => {
    const { client } = await temporaryDatabase();
    await createBaseSchema(client);
    const context = createMigrationContext(client);
    await client.execute("INSERT INTO schema_migrations (version) VALUES (99)");
    const alreadyApplied = vi.fn(async () => {});

    await applyMigration(context, { version: 99, up: alreadyApplied });
    await expect(applyMigration(context, {
      version: 100,
      async up() {
        throw new Error("migration failed");
      },
    })).rejects.toThrow("migration failed");

    expect(alreadyApplied).not.toHaveBeenCalled();
    expect((await client.execute("SELECT version FROM schema_migrations ORDER BY version")).rows)
      .toEqual([expect.objectContaining({ version: 99 })]);
  });

  it("keeps migration 6 and migration 9 compatible with partially updated users", async () => {
    const { client } = await temporaryDatabase();
    await createBaseSchema(client);
    const context = createMigrationContext(client);
    await client.execute("ALTER TABLE users ADD COLUMN plan_reminder_hour INTEGER NOT NULL DEFAULT 19");

    await migration006.up(context);
    await migration006.up(context);
    await migration009.up(context);

    const columns = await client.execute("PRAGMA table_info(users)");
    const names = columns.rows.map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining([
      "plan_reminder_hour",
      "plan_weekly_reminder_day",
      "plan_weekly_reminder_hour",
      "plan_context",
    ]));
    expect(names.filter((name) => name === "plan_reminder_hour")).toHaveLength(1);
    expect((await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")).rows)
      .toHaveLength(1);
  });

  it("rebuilds migration 8's legacy tasks shape and restores foreign keys", async () => {
    const { client } = await temporaryDatabase();
    await client.execute("PRAGMA foreign_keys = ON");
    await createBaseSchema(client);
    await client.execute(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        scope TEXT NOT NULL,
        period_start TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await client.execute(`
      CREATE TABLE session_tasks (
        session_id INTEGER NOT NULL REFERENCES sessions(id),
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        PRIMARY KEY (session_id, task_id)
      )
    `);
    await client.execute("INSERT INTO users (email, password_hash) VALUES ('legacy@example.test', 'hash')");
    await client.execute("INSERT INTO tasks (user_id, scope, period_start, title) VALUES (1, 'day', '2026-08-02', 'Legacy')");

    await migration008.up(createMigrationContext(client));

    expect((await client.execute("SELECT title, project_id FROM tasks")).rows[0])
      .toMatchObject({ title: "Legacy", project_id: null });
    expect((await client.execute("PRAGMA foreign_keys")).rows[0].foreign_keys).toBe(1);
  });
});
