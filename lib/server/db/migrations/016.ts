import type { Migration } from "../helpers";

export const migration016: Migration = {
  version: 16,
  async up({ addColumn }) {
    await addColumn("tasks", "sort_order INTEGER NOT NULL DEFAULT 0");
  },
};