import type { Migration } from "../helpers";

export const migration014: Migration = {
  version: 14,
  async up({ addColumn }) {
    await addColumn("projects", "resources TEXT");
  },
};
