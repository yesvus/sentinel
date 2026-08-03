import type { Client } from "@libsql/client";

export type MigrationContext = {
  db: Client;
  columnExists: (table: string, column: string) => Promise<boolean>;
  addColumn: (table: string, definition: string) => Promise<void>;
};

export type Migration = {
  version: number;
  up: (context: MigrationContext) => Promise<void>;
};

export function createMigrationContext(db: Client): MigrationContext {
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

  return { db, columnExists, addColumn };
}

export async function applyMigration(context: MigrationContext, migration: Migration) {
  const applied = await context.db.execute({
    sql: "SELECT 1 FROM schema_migrations WHERE version = ?",
    args: [migration.version],
  });
  if (applied.rows.length) return;
  await migration.up(context);
  await context.db.execute({
    sql: "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
    args: [migration.version],
  });
}
