import type { Client } from "@libsql/client";
import { createBaseSchema } from "./base-schema";
import { databaseUrl, db } from "./client";
import { createMigrationContext, applyMigration } from "./helpers";
import { createIndexes } from "./indexes";
import { migrations } from "./migrations";

export async function initializeDatabase(client: Client, url: string) {
  if (url.startsWith("file:")) await client.execute("PRAGMA foreign_keys = ON");
  await createBaseSchema(client);
  const context = createMigrationContext(client);
  for (const migration of migrations) await applyMigration(context, migration);
  await createIndexes(client);
}

let initialization: Promise<void> | null = null;

export function ensureDb() {
  initialization ??= initializeDatabase(db, databaseUrl);
  return initialization;
}
