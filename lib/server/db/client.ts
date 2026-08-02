import "server-only";
import { createClient } from "@libsql/client";

export const databaseUrl = process.env.TURSO_DATABASE_URL ?? "file:local.db";

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
