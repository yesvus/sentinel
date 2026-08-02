import type { Migration } from "../helpers";

export const migration013: Migration = {
  version: 13,
  async up({ addColumn }) {
    await addColumn("projects", "sort_order INTEGER NOT NULL DEFAULT 0");
  },
};
