import type { Migration } from "../helpers";

export const migration015: Migration = {
  version: 15,
  async up({ addColumn }) {
    await addColumn("users", "timezone TEXT");
  },
};
