import type { Migration } from "../helpers";

export const migration005: Migration = {
  version: 5,
  async up({ addColumn }) {
    await addColumn("users", "track_production_split INTEGER NOT NULL DEFAULT 1");
  },
};
