import type { Migration } from "../helpers";

export const migration009: Migration = {
  version: 9,
  async up({ addColumn }) {
    // Some deployments already had migration 6 run (recorded as applied) before these columns
    // were added to its body, so migrate()'s "already applied" check skipped them entirely.
    // addColumn() is per-column idempotent, so this is safe to run regardless of which of these
    // a given database already has.
    await addColumn("users", "plan_reminder_hour INTEGER NOT NULL DEFAULT 19");
    await addColumn("users", "plan_weekly_reminder_day INTEGER NOT NULL DEFAULT 0");
    await addColumn("users", "plan_weekly_reminder_hour INTEGER NOT NULL DEFAULT 19");
    await addColumn("users", "plan_context TEXT");
  },
};
