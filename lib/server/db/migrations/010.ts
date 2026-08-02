import type { Migration } from "../helpers";

export const migration010: Migration = {
  version: 10,
  async up({ addColumn }) {
    await addColumn("tasks", "description TEXT");
  },
};
