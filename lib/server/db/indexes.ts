import type { Client } from "@libsql/client";

const indexStatements = [
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id)",
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions (expires_at)",
  "CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens (user_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_api_tokens_expiry ON api_tokens (expires_at)",
  "CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week ON weekly_reports (user_id, week_start)",
  "CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_social_notifications_user_created ON social_notifications (user_id, created_at DESC)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_session_per_user ON sessions (user_id) WHERE ended_at IS NULL",
  "CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON sessions (user_id, started_at)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_user_project ON sessions (user_id, project_id)",
  "CREATE INDEX IF NOT EXISTS idx_projects_user_parent ON projects (user_id, parent_id)",
  "CREATE INDEX IF NOT EXISTS idx_projects_user_archived ON projects (user_id, archived)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_user_period ON tasks (user_id, period_start)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_user_project ON tasks (user_id, project_id)",
  "CREATE INDEX IF NOT EXISTS idx_session_tasks_task ON session_tasks (task_id)",
  "CREATE INDEX IF NOT EXISTS idx_planned_sessions_user_date ON planned_sessions (user_id, date_key, sort_order)",
  "CREATE INDEX IF NOT EXISTS idx_planned_session_tasks_plan ON planned_session_tasks (planned_session_id)",
  "CREATE INDEX IF NOT EXISTS idx_focus_noise_usage_user_started ON focus_noise_usage (user_id, started_at DESC)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_focus_noise_usage_per_user ON focus_noise_usage (user_id) WHERE ended_at IS NULL",
];

export async function createIndexes(db: Client) {
  for (const statement of indexStatements) await db.execute(statement);
}
