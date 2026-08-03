import type { Migration } from "../helpers";

export const migration001: Migration = {
  version: 1,
  async up({ addColumn }) {
    for (const definition of [
      "name TEXT",
      "avatar TEXT",
      "share_session_descriptions INTEGER NOT NULL DEFAULT 0",
      "auto_start_noise INTEGER NOT NULL DEFAULT 0",
      "focus_audio_type TEXT NOT NULL DEFAULT 'speech-blocker'",
      "default_session_type TEXT NOT NULL DEFAULT 'learning'",
      "calendar_token TEXT",
    ]) await addColumn("users", definition);

    for (const definition of [
      "icon TEXT",
      "description TEXT",
      "parent_id INTEGER REFERENCES projects(id)",
      "pinned INTEGER NOT NULL DEFAULT 0",
      "archived INTEGER NOT NULL DEFAULT 0",
    ]) await addColumn("projects", definition);

    await addColumn(
      "sessions",
      "production_percentage INTEGER CHECK (production_percentage IS NULL OR (production_percentage BETWEEN 0 AND 100 AND production_percentage % 10 = 0))",
    );
  },
};
