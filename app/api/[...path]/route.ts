import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/server/db";
import {
  COOKIE_OPTIONS,
  createSession,
  getUserId,
  revokeSession,
  revokeUserSessions,
  unauthorized,
} from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };
const noContent = () => new NextResponse(null, { status: 204 });
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const body = (request: NextRequest) => request.json().catch(() => ({}));
const FOCUS_AUDIO_TYPES = new Set(["white", "pink", "brown", "speech-blocker", "binaural-40hz"]);
const AVATAR_TYPES = new Set(["cat", "dog", "bird", "fish", "rabbit", "rocket", "star", "ghost", "bot", "coffee", "gamepad", "sparkles"]);
const PROJECT_ICON_TYPES = new Set(["book", "code", "calculator", "flask", "music", "dumbbell", "globe", "pen", "briefcase", "palette", "languages", "atom"]);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 4_000;
const MAX_PROJECT_RESOURCES_LENGTH = 10_000;
const MAX_NOTE_LENGTH = 10_000;
const MAX_TASK_TITLE_LENGTH = 200;
const MAX_PLAN_CONTEXT_LENGTH = 2_000;

function clientAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

function rateLimitKey(scope: string, value: string) {
  return createHash("sha256").update(`${scope}:${value}`).digest("hex");
}

async function rateLimited(key: string, maximum: number) {
  await db.execute("DELETE FROM auth_rate_limits WHERE reset_at <= datetime('now')");
  const result = await db.execute({
    sql: "SELECT attempts FROM auth_rate_limits WHERE key_hash = ? AND reset_at > datetime('now')",
    args: [key],
  });
  return Number(result.rows[0]?.attempts ?? 0) >= maximum;
}

async function recordRateLimitAttempt(key: string) {
  await db.execute({
    sql: `INSERT INTO auth_rate_limits (key_hash, attempts, reset_at)
          VALUES (?, 1, datetime('now', '+15 minutes'))
          ON CONFLICT (key_hash) DO UPDATE SET
            attempts = CASE WHEN reset_at <= datetime('now') THEN 1 ELSE attempts + 1 END,
            reset_at = CASE WHEN reset_at <= datetime('now') THEN datetime('now', '+15 minutes') ELSE reset_at END`,
    args: [key],
  });
}

async function clearRateLimit(key: string) {
  await db.execute({ sql: "DELETE FROM auth_rate_limits WHERE key_hash = ?", args: [key] });
}

function validEmail(email: string) {
  return email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function optionalTextError(value: unknown, label: string, maximum: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return error(`${label} must be text`);
  return value.length > maximum ? error(`${label} must be at most ${maximum} characters`) : null;
}

async function projectIdError(userId: number, value: unknown) {
  if (value === undefined || value === null) return null;
  const projectId = Number(value);
  if (!Number.isInteger(projectId) || projectId < 1) return error("Invalid project");
  const project = await db.execute({
    sql: "SELECT 1 FROM projects WHERE id = ? AND user_id = ?",
    args: [projectId, userId],
  });
  return project.rows.length ? null : error("Project not found", 404);
}

async function taskIdsError(userId: number, value: unknown) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return error("taskIds must be an array");
  if (value.length > 20) return error("Too many tasks selected");
  const ids = value.map(Number);
  if (ids.some((taskId) => !Number.isInteger(taskId) || taskId < 1)) return error("Invalid task id");
  if (!ids.length) return null;
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.execute({
    sql: `SELECT id FROM tasks WHERE user_id = ? AND id IN (${placeholders})`,
    args: [userId, ...ids],
  });
  return rows.rows.length === new Set(ids).size ? null : error("One or more tasks not found", 404);
}

function validProductionPercentage(value: unknown): value is number | null {
  return value === null ||
    (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100 && value % 10 === 0);
}

function productionPercentageError(value: unknown) {
  return value !== undefined && !validProductionPercentage(value)
    ? error("productionPercentage must be null or an integer from 0 to 100 in increments of 10")
    : null;
}

function sessionCursor(startedAt: string, id: number) {
  return Buffer.from(JSON.stringify([startedAt, id])).toString("base64url");
}

function parseSessionCursor(cursor: string | null): [string, number] | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown;
    if (
      Array.isArray(value) &&
      typeof value[0] === "string" &&
      typeof value[1] === "number" &&
      Number.isInteger(value[1])
    ) {
      return [value[0], value[1]];
    }
  } catch {}
  return null;
}

function activityCursor(activeRank: number, startedAt: string, id: number) {
  return Buffer.from(JSON.stringify([activeRank, startedAt, id])).toString("base64url");
}

function parseActivityCursor(cursor: string | null): [number, string, number] | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown;
    if (
      Array.isArray(value) &&
      typeof value[0] === "number" &&
      typeof value[1] === "string" &&
      typeof value[2] === "number" &&
      Number.isInteger(value[2])
    ) {
      return [value[0], value[1], value[2]];
    }
  } catch {}
  return null;
}

async function finalizeExpiredPause(userId: number, sessionId?: number) {
  const result = await db.execute({
    sql: `SELECT sessions.id, sessions.started_at, sessions.paused_at, sessions.paused_seconds,
                 users.session_pause_timeout_minutes
          FROM sessions JOIN users ON users.id = sessions.user_id
          WHERE sessions.user_id = ? AND sessions.ended_at IS NULL AND sessions.paused_at IS NOT NULL
          ${sessionId === undefined ? "" : "AND sessions.id = ?"}
          LIMIT 1`,
    args: sessionId === undefined ? [userId] : [userId, sessionId],
  });
  const session = result.rows[0];
  if (!session) return null;
  const pausedAt = new Date(session.paused_at as string).getTime();
  const timeoutSeconds = Number(session.session_pause_timeout_minutes ?? 30) * 60;
  const endedAt = pausedAt + timeoutSeconds * 1000;
  if (endedAt > Date.now()) return null;
  const pausedSeconds = Number(session.paused_seconds ?? 0) + timeoutSeconds;
  const durationSeconds = Math.max(
    0,
    Math.round((endedAt - new Date(session.started_at as string).getTime()) / 1000) - pausedSeconds,
  );
  await db.execute({
    sql: `UPDATE sessions
          SET ended_at = ?, duration_seconds = ?, paused_at = NULL, paused_seconds = ?
          WHERE id = ? AND user_id = ? AND ended_at IS NULL`,
    args: [new Date(endedAt).toISOString(), durationSeconds, pausedSeconds, Number(session.id), userId],
  });
  return { id: Number(session.id), endedAt: new Date(endedAt).toISOString(), durationSeconds };
}

async function activeSession(userId: number) {
  await finalizeExpiredPause(userId);
  const result = await db.execute({
    sql: `
      SELECT sessions.id, sessions.started_at, sessions.ended_at,
             sessions.duration_seconds, sessions.description, sessions.production_percentage,
             sessions.paused_at, sessions.paused_seconds,
             project_id, projects.name AS project_name, projects.icon AS project_icon,
             projects.archived AS project_archived,
             CASE WHEN grandparent.id IS NOT NULL THEN grandparent.name || ' / ' || parent.name || ' / ' || projects.name
                  WHEN parent.id IS NOT NULL THEN parent.name || ' / ' || projects.name ELSE projects.name END AS project_path,
             COALESCE(grandparent.id, parent.id, projects.id) AS root_project_id,
             COALESCE(grandparent.name, parent.name, projects.name) AS root_project_name,
             COALESCE(grandparent.icon, parent.icon, projects.icon) AS root_project_icon
      FROM sessions LEFT JOIN projects ON projects.id = sessions.project_id AND projects.user_id = sessions.user_id
      LEFT JOIN projects parent ON parent.id = projects.parent_id AND parent.user_id = sessions.user_id
      LEFT JOIN projects grandparent ON grandparent.id = parent.parent_id AND grandparent.user_id = sessions.user_id
      WHERE sessions.user_id = ? AND sessions.ended_at IS NULL
    `,
    args: [userId],
  });
  return result.rows[0] ?? null;
}

function uniqueActiveError(value: unknown) {
  return value instanceof Error && "code" in value &&
    (value as { code?: string }).code === "SQLITE_CONSTRAINT" &&
    value.message.includes("sessions.user_id");
}

async function authRoutes(request: NextRequest, parts: string[]) {
  const action = parts[1];
  if (action === "register" && request.method === "POST") {
    const data = await body(request);
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const password = data.password;
    if (!validEmail(email) || typeof password !== "string" || password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
      return error("A valid email and a password of 8 to 128 characters are required");
    }
    const attemptKey = rateLimitKey("register", clientAddress(request));
    if (await rateLimited(attemptKey, 10)) return error("Too many registrations. Try again later.", 429);
    await recordRateLimitAttempt(attemptKey);
    const existing = await db.execute({ sql: "SELECT id FROM users WHERE lower(email) = ?", args: [email] });
    if (existing.rows.length) return error("Email already registered", 409);
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.execute({
      sql: "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      args: [email, passwordHash],
    });
    const id = Number(result.lastInsertRowid);
    const response = NextResponse.json({
      id, email, name: null, avatar: null, shareSessionDescriptions: false, autoStartNoise: false,
      focusAudioType: "speech-blocker",
      defaultSessionType: "learning",
      trackProductionSplit: true,
      sessionPauseTimeoutMinutes: 30,
      planReminderHour: 19,
      planWeeklyReminderDay: 0,
      planWeeklyReminderHour: 19,
      planContext: null,
    }, { status: 201 });
    response.cookies.set("token", await createSession(id), COOKIE_OPTIONS);
    return response;
  }
  if (action === "login" && request.method === "POST") {
    const data = await body(request);
    if (typeof data.email !== "string" || typeof data.password !== "string") return error("Email and password are required");
    const email = data.email.trim().toLowerCase();
    if (!validEmail(email) || data.password.length > MAX_PASSWORD_LENGTH) return error("Invalid email or password", 401);
    const attemptKey = rateLimitKey("login", `${clientAddress(request)}:${email}`);
    if (await rateLimited(attemptKey, 5)) return error("Too many sign-in attempts. Try again later.", 429);
    const result = await db.execute({
      sql: "SELECT id, email, password_hash, name, avatar, share_session_descriptions, auto_start_noise, focus_audio_type, default_session_type, track_production_split, session_pause_timeout_minutes, plan_reminder_hour, plan_weekly_reminder_day, plan_weekly_reminder_hour, plan_context FROM users WHERE lower(email) = ?",
      args: [email],
    });
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(data.password, user.password_hash as string))) {
      await recordRateLimitAttempt(attemptKey);
      return error("Invalid email or password", 401);
    }
    await clearRateLimit(attemptKey);
    const response = NextResponse.json({
      id: Number(user.id), email: user.email, name: user.name, avatar: user.avatar,
      shareSessionDescriptions: Boolean(user.share_session_descriptions),
      autoStartNoise: Boolean(user.auto_start_noise),
      focusAudioType: user.focus_audio_type ?? "speech-blocker",
      defaultSessionType: user.default_session_type ?? "learning",
      trackProductionSplit: Boolean(user.track_production_split ?? 1),
      sessionPauseTimeoutMinutes: Number(user.session_pause_timeout_minutes ?? 30),
      planReminderHour: Number(user.plan_reminder_hour ?? 19),
      planWeeklyReminderDay: Number(user.plan_weekly_reminder_day ?? 0),
      planWeeklyReminderHour: Number(user.plan_weekly_reminder_hour ?? 19),
      planContext: user.plan_context ?? null,
    });
    response.cookies.set("token", await createSession(Number(user.id)), COOKIE_OPTIONS);
    return response;
  }
  if (action === "logout" && request.method === "POST") {
    await revokeSession(request);
    const response = noContent();
    response.cookies.set("token", "", { ...COOKIE_OPTIONS, maxAge: 0 });
    return response;
  }

  const userId = await getUserId(request);
  if (!userId) return unauthorized();
  if (action === "me" && request.method === "GET") {
    const result = await db.execute({
      sql: "SELECT id, email, name, avatar, share_session_descriptions, auto_start_noise, focus_audio_type, default_session_type, track_production_split, session_pause_timeout_minutes, plan_reminder_hour, plan_weekly_reminder_day, plan_weekly_reminder_hour, plan_context FROM users WHERE id = ?",
      args: [userId],
    });
    const user = result.rows[0];
    if (!user) return error("User not found", 404);
    return NextResponse.json({
      id: Number(user.id), email: user.email, name: user.name, avatar: user.avatar,
      shareSessionDescriptions: Boolean(user.share_session_descriptions),
      autoStartNoise: Boolean(user.auto_start_noise),
      focusAudioType: user.focus_audio_type ?? "speech-blocker",
      defaultSessionType: user.default_session_type ?? "learning",
      trackProductionSplit: Boolean(user.track_production_split ?? 1),
      sessionPauseTimeoutMinutes: Number(user.session_pause_timeout_minutes ?? 30),
      planReminderHour: Number(user.plan_reminder_hour ?? 19),
      planWeeklyReminderDay: Number(user.plan_weekly_reminder_day ?? 0),
      planWeeklyReminderHour: Number(user.plan_weekly_reminder_hour ?? 19),
      planContext: user.plan_context ?? null,
    });
  }
  if (action === "me" && request.method === "PATCH") {
    const data = await body(request);
    const nameError = optionalTextError(data.name, "Name", MAX_NAME_LENGTH);
    if (nameError) return nameError;
    if (data.avatar !== undefined && data.avatar !== null && !AVATAR_TYPES.has(data.avatar)) {
      return error("Invalid avatar");
    }
    const planContextError = optionalTextError(data.planContext, "About you", MAX_PLAN_CONTEXT_LENGTH);
    if (planContextError) return planContextError;
    const existing = await db.execute({ sql: "SELECT name, avatar, plan_context FROM users WHERE id = ?", args: [userId] });
    const row = existing.rows[0];
    const name = data.name !== undefined ? data.name : row.name;
    const avatar = data.avatar !== undefined ? data.avatar : row.avatar;
    const planContext = data.planContext !== undefined
      ? (typeof data.planContext === "string" ? data.planContext.trim() || null : null)
      : row.plan_context;
    await db.execute({
      sql: "UPDATE users SET name = ?, avatar = ?, plan_context = ? WHERE id = ?",
      args: [name, avatar, planContext, userId],
    });
    return NextResponse.json({ name, avatar, planContext });
  }
  if (action === "privacy" && request.method === "PATCH") {
    const data = await body(request);
    if (typeof data.shareSessionDescriptions !== "boolean") return error("shareSessionDescriptions must be a boolean");
    await db.execute({
      sql: "UPDATE users SET share_session_descriptions = ? WHERE id = ?",
      args: [data.shareSessionDescriptions ? 1 : 0, userId],
    });
    return NextResponse.json({ shareSessionDescriptions: data.shareSessionDescriptions });
  }
  if (action === "audio-settings" && request.method === "PATCH") {
    const data = await body(request);
    if (data.autoStartNoise !== undefined && typeof data.autoStartNoise !== "boolean") {
      return error("autoStartNoise must be a boolean");
    }
    if (data.focusAudioType !== undefined && !FOCUS_AUDIO_TYPES.has(data.focusAudioType)) {
      return error("Invalid focus audio type");
    }
    if (data.autoStartNoise === undefined && data.focusAudioType === undefined) {
      return error("At least one audio setting is required");
    }
    await db.execute({
      sql: `UPDATE users
            SET auto_start_noise = COALESCE(?, auto_start_noise),
                focus_audio_type = COALESCE(?, focus_audio_type)
            WHERE id = ?`,
      args: [
        data.autoStartNoise === undefined ? null : data.autoStartNoise ? 1 : 0,
        data.focusAudioType ?? null,
        userId,
      ],
    });
    const result = await db.execute({
      sql: "SELECT auto_start_noise, focus_audio_type FROM users WHERE id = ?",
      args: [userId],
    });
    return NextResponse.json({
      autoStartNoise: Boolean(result.rows[0].auto_start_noise),
      focusAudioType: result.rows[0].focus_audio_type,
    });
  }
  if (action === "session-settings" && request.method === "PATCH") {
    const data = await body(request);
    if (data.defaultSessionType !== undefined && data.defaultSessionType !== "learning" && data.defaultSessionType !== "producing") {
      return error("defaultSessionType must be learning or producing");
    }
    if (data.trackProductionSplit !== undefined && typeof data.trackProductionSplit !== "boolean") {
      return error("trackProductionSplit must be a boolean");
    }
    if (
      data.sessionPauseTimeoutMinutes !== undefined &&
      (!Number.isInteger(data.sessionPauseTimeoutMinutes) || data.sessionPauseTimeoutMinutes < 5 || data.sessionPauseTimeoutMinutes > 180)
    ) {
      return error("sessionPauseTimeoutMinutes must be an integer from 5 to 180");
    }
    if (
      data.planReminderHour !== undefined &&
      (!Number.isInteger(data.planReminderHour) || data.planReminderHour < 0 || data.planReminderHour > 23)
    ) {
      return error("planReminderHour must be an integer from 0 to 23");
    }
    if (
      data.planWeeklyReminderDay !== undefined &&
      (!Number.isInteger(data.planWeeklyReminderDay) || data.planWeeklyReminderDay < 0 || data.planWeeklyReminderDay > 6)
    ) {
      return error("planWeeklyReminderDay must be an integer from 0 (Sunday) to 6 (Saturday)");
    }
    if (
      data.planWeeklyReminderHour !== undefined &&
      (!Number.isInteger(data.planWeeklyReminderHour) || data.planWeeklyReminderHour < 0 || data.planWeeklyReminderHour > 23)
    ) {
      return error("planWeeklyReminderHour must be an integer from 0 to 23");
    }
    if (
      data.defaultSessionType === undefined && data.trackProductionSplit === undefined && data.sessionPauseTimeoutMinutes === undefined &&
      data.planReminderHour === undefined && data.planWeeklyReminderDay === undefined &&
      data.planWeeklyReminderHour === undefined
    ) {
      return error("At least one session setting is required");
    }
    await db.execute({
      sql: `UPDATE users
            SET default_session_type = COALESCE(?, default_session_type),
                track_production_split = COALESCE(?, track_production_split),
                session_pause_timeout_minutes = COALESCE(?, session_pause_timeout_minutes),
                plan_reminder_hour = COALESCE(?, plan_reminder_hour),
                plan_weekly_reminder_day = COALESCE(?, plan_weekly_reminder_day),
                plan_weekly_reminder_hour = COALESCE(?, plan_weekly_reminder_hour)
            WHERE id = ?`,
      args: [
        data.defaultSessionType ?? null,
        data.trackProductionSplit === undefined ? null : data.trackProductionSplit ? 1 : 0,
        data.sessionPauseTimeoutMinutes ?? null,
        data.planReminderHour ?? null,
        data.planWeeklyReminderDay ?? null,
        data.planWeeklyReminderHour ?? null,
        userId,
      ],
    });
    const result = await db.execute({
      sql: `SELECT default_session_type, track_production_split, session_pause_timeout_minutes, plan_reminder_hour,
                   plan_weekly_reminder_day, plan_weekly_reminder_hour
            FROM users WHERE id = ?`,
      args: [userId],
    });
    return NextResponse.json({
      defaultSessionType: result.rows[0].default_session_type,
      trackProductionSplit: Boolean(result.rows[0].track_production_split),
      sessionPauseTimeoutMinutes: Number(result.rows[0].session_pause_timeout_minutes),
      planReminderHour: Number(result.rows[0].plan_reminder_hour),
      planWeeklyReminderDay: Number(result.rows[0].plan_weekly_reminder_day),
      planWeeklyReminderHour: Number(result.rows[0].plan_weekly_reminder_hour),
    });
  }
  if (action === "change-password" && request.method === "POST") {
    const data = await body(request);
    if (typeof data.currentPassword !== "string" || typeof data.newPassword !== "string" ||
        data.newPassword.length < 8 || data.newPassword.length > MAX_PASSWORD_LENGTH ||
        data.currentPassword.length > MAX_PASSWORD_LENGTH) {
      return error("Current password and a new password of 8 to 128 characters are required");
    }
    const result = await db.execute({ sql: "SELECT password_hash FROM users WHERE id = ?", args: [userId] });
    if (!result.rows[0] || !(await bcrypt.compare(data.currentPassword, result.rows[0].password_hash as string))) {
      return error("Current password is incorrect", 401);
    }
    await db.execute({
      sql: "UPDATE users SET password_hash = ? WHERE id = ?",
      args: [await bcrypt.hash(data.newPassword, 10), userId],
    });
    await revokeUserSessions(userId);
    const response = noContent();
    response.cookies.set("token", await createSession(userId), COOKIE_OPTIONS);
    return response;
  }
  return error("Not found", 404);
}

async function sessionRoutes(request: NextRequest, parts: string[], userId: number) {
  const action = parts[1];
  if (action === "active" && request.method === "GET") return NextResponse.json(await activeSession(userId));
  if (action === "start" && request.method === "POST") {
    const data = await body(request);
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const invalidProject = await projectIdError(userId, data.projectId);
    if (invalidProject) return invalidProject;
    const invalidTasks = await taskIdsError(userId, data.taskIds);
    if (invalidTasks) return invalidTasks;
    const taskPeriodStartInvalid = periodStartError(data.taskPeriodStart);
    if (taskPeriodStartInvalid) return taskPeriodStartInvalid;
    const startedAt = new Date().toISOString();
    try {
      const result = await db.execute({
        sql: "INSERT INTO sessions (user_id, started_at, description, project_id) VALUES (?, ?, ?, ?)",
        args: [userId, startedAt, data.description ?? null, data.projectId == null ? null : Number(data.projectId)],
      });
      const sessionId = Number(result.lastInsertRowid);
      const uniqueTaskIds = new Set<number>();
      if (Array.isArray(data.taskIds)) {
        for (const rawTaskId of data.taskIds) uniqueTaskIds.add(Number(rawTaskId));
      }
      for (const taskId of uniqueTaskIds) {
        await db.execute({
          sql: "INSERT INTO session_tasks (session_id, task_id) VALUES (?, ?)",
          args: [sessionId, taskId],
        });
      }
      return NextResponse.json({ id: sessionId, startedAt }, { status: 201 });
    } catch (caught) {
      if (!uniqueActiveError(caught)) throw caught;
      return NextResponse.json({ error: "A session is already in progress", session: await activeSession(userId) }, { status: 409 });
    }
  }
  if (!action && request.method === "GET") {
    await finalizeExpiredPause(userId);
    const requestedLimit = request.nextUrl.searchParams.get("limit");
    const limit = requestedLimit ? Number(requestedLimit) : null;
    if (requestedLimit && (!Number.isInteger(limit) || limit! < 1 || limit! > 100)) {
      return error("limit must be an integer between 1 and 100");
    }
    const cursorParam = request.nextUrl.searchParams.get("cursor");
    const cursor = parseSessionCursor(cursorParam);
    if (cursorParam && !cursor) return error("Invalid session cursor");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    if ((from && Number.isNaN(new Date(from).getTime())) || (to && Number.isNaN(new Date(to).getTime()))) {
      return error("from and to must be valid dates");
    }
    const cursorClause = cursor
      ? "AND (sessions.started_at < ? OR (sessions.started_at = ? AND sessions.id < ?))"
      : "";
    const rangeClause = `${from ? "AND sessions.started_at >= ?" : ""} ${to ? "AND sessions.started_at < ?" : ""}`;
    const args: (string | number)[] = [userId];
    if (from) args.push(new Date(from).toISOString());
    if (to) args.push(new Date(to).toISOString());
    if (cursor) args.push(cursor[0], cursor[0], cursor[1]);
    if (limit !== null) args.push(limit + 1);
    const result = await db.execute({
      sql: `
        SELECT sessions.id, sessions.started_at, sessions.ended_at,
               sessions.duration_seconds, sessions.description, sessions.production_percentage,
               sessions.paused_at, sessions.paused_seconds,
               project_id, projects.name AS project_name, projects.icon AS project_icon,
               projects.archived AS project_archived,
               CASE WHEN grandparent.id IS NOT NULL THEN grandparent.name || ' / ' || parent.name || ' / ' || projects.name
                    WHEN parent.id IS NOT NULL THEN parent.name || ' / ' || projects.name ELSE projects.name END AS project_path,
               COALESCE(grandparent.id, parent.id, projects.id) AS root_project_id,
               COALESCE(grandparent.name, parent.name, projects.name) AS root_project_name,
               COALESCE(grandparent.icon, parent.icon, projects.icon) AS root_project_icon
        FROM sessions LEFT JOIN projects ON projects.id = sessions.project_id AND projects.user_id = sessions.user_id
        LEFT JOIN projects parent ON parent.id = projects.parent_id AND parent.user_id = sessions.user_id
        LEFT JOIN projects grandparent ON grandparent.id = parent.parent_id AND grandparent.user_id = sessions.user_id
        WHERE sessions.user_id = ? ${rangeClause} ${cursorClause}
        ORDER BY sessions.started_at DESC, sessions.id DESC
        ${limit !== null ? "LIMIT ?" : ""}
      `,
      args,
    });
    if (limit !== null) {
      const hasMore = result.rows.length > limit;
      const items = result.rows.slice(0, limit);
      const last = items.at(-1);
      return NextResponse.json({
        items,
        nextCursor:
          hasMore && last
            ? sessionCursor(last.started_at as string, Number(last.id))
            : null,
      });
    }
    return NextResponse.json(result.rows);
  }
  if (!action && request.method === "POST") {
    const data = await body(request);
    const allocationError = productionPercentageError(data.productionPercentage);
    if (allocationError) return allocationError;
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const invalidProject = await projectIdError(userId, data.projectId);
    if (invalidProject) return invalidProject;
    if (typeof data.startedAt !== "string" || typeof data.endedAt !== "string") return error("startedAt and endedAt are required");
    const start = new Date(data.startedAt);
    const end = new Date(data.endedAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return error("startedAt and endedAt must be valid dates");
    if (end <= start) return error("endedAt must be after startedAt");
    const durationSeconds = Math.round((end.getTime() - start.getTime()) / 1000);
    const result = await db.execute({
      sql: "INSERT INTO sessions (user_id, started_at, ended_at, duration_seconds, description, project_id, production_percentage) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [userId, start.toISOString(), end.toISOString(), durationSeconds, data.description ?? null,
        data.projectId == null ? null : Number(data.projectId), data.productionPercentage ?? null],
    });
    return NextResponse.json({
      id: Number(result.lastInsertRowid), startedAt: start.toISOString(), endedAt: end.toISOString(), durationSeconds,
      productionPercentage: data.productionPercentage ?? null,
    }, { status: 201 });
  }

  const id = Number(action);
  if (!Number.isInteger(id)) return error("Not found", 404);
  if (parts[2] === "tasks" && request.method === "GET") {
    const result = await db.execute({
      sql: `
        SELECT tasks.id, tasks.period_start, tasks.project_id, tasks.title, tasks.description, tasks.completed_at
        FROM session_tasks
        JOIN tasks ON tasks.id = session_tasks.task_id
        JOIN sessions ON sessions.id = session_tasks.session_id
        WHERE session_tasks.session_id = ? AND sessions.user_id = ?
        ORDER BY tasks.id
      `,
      args: [id, userId],
    });
    return NextResponse.json(result.rows);
  }
  if (parts[2] === "pause" && request.method === "PATCH") {
    await finalizeExpiredPause(userId, id);
    const existing = await db.execute({
      sql: "SELECT paused_at, paused_seconds FROM sessions WHERE id = ? AND user_id = ? AND ended_at IS NULL",
      args: [id, userId],
    });
    const session = existing.rows[0];
    if (!session) return error("Active session not found", 404);
    const pausedAt = session.paused_at ?? new Date().toISOString();
    if (session.paused_at === null) {
      await db.execute({
        sql: "UPDATE sessions SET paused_at = ? WHERE id = ? AND user_id = ? AND ended_at IS NULL AND paused_at IS NULL",
        args: [pausedAt, id, userId],
      });
    }
    return NextResponse.json({ id, pausedAt, pausedSeconds: Number(session.paused_seconds ?? 0) });
  }
  if (parts[2] === "resume" && request.method === "PATCH") {
    const expired = await finalizeExpiredPause(userId, id);
    if (expired) return error("Session ended after reaching the pause limit", 409);
    const existing = await db.execute({
      sql: "SELECT paused_at, paused_seconds FROM sessions WHERE id = ? AND user_id = ? AND ended_at IS NULL",
      args: [id, userId],
    });
    const session = existing.rows[0];
    if (!session) return error("Active session not found", 404);
    const previousPausedSeconds = Number(session.paused_seconds ?? 0);
    if (session.paused_at === null) {
      return NextResponse.json({ id, pausedAt: null, pausedSeconds: previousPausedSeconds });
    }
    const pausedSeconds = previousPausedSeconds + Math.max(
      0,
      Math.round((Date.now() - new Date(session.paused_at as string).getTime()) / 1000),
    );
    await db.execute({
      sql: "UPDATE sessions SET paused_at = NULL, paused_seconds = ? WHERE id = ? AND user_id = ? AND ended_at IS NULL",
      args: [pausedSeconds, id, userId],
    });
    return NextResponse.json({ id, pausedAt: null, pausedSeconds });
  }
  if (parts[2] === "expire-pause" && request.method === "PATCH") {
    const expired = await finalizeExpiredPause(userId, id);
    if (expired) return NextResponse.json({ ended: true, ...expired });
    const existing = await db.execute({
      sql: "SELECT ended_at, duration_seconds FROM sessions WHERE id = ? AND user_id = ?",
      args: [id, userId],
    });
    if (!existing.rows[0]) return error("Session not found", 404);
    if (existing.rows[0].ended_at !== null) {
      return NextResponse.json({
        ended: true,
        endedAt: existing.rows[0].ended_at,
        durationSeconds: Number(existing.rows[0].duration_seconds ?? 0),
      });
    }
    return NextResponse.json({ ended: false });
  }
  if (parts[2] === "stop" && request.method === "PATCH") {
    const expired = await finalizeExpiredPause(userId, id);
    if (expired) return error("Session ended after reaching the pause limit", 409);
    const data = await body(request);
    const allocationError = productionPercentageError(data.productionPercentage);
    if (allocationError) return allocationError;
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const existing = await db.execute({
      sql: "SELECT started_at, ended_at, description, paused_at, paused_seconds FROM sessions WHERE id = ? AND user_id = ?",
      args: [id, userId],
    });
    if (!existing.rows[0]) return error("Session not found", 404);
    if (existing.rows[0].ended_at !== null) return error("Session already ended", 409);
    const endedAt = new Date();
    const currentPauseSeconds = existing.rows[0].paused_at === null ? 0 : Math.max(
      0,
      Math.round((endedAt.getTime() - new Date(existing.rows[0].paused_at as string).getTime()) / 1000),
    );
    const pausedSeconds = Number(existing.rows[0].paused_seconds ?? 0) + currentPauseSeconds;
    const durationSeconds = Math.max(
      0,
      Math.round((endedAt.getTime() - new Date(existing.rows[0].started_at as string).getTime()) / 1000) - pausedSeconds,
    );
    const description =
      data.description !== undefined ? data.description : existing.rows[0].description;
    await db.execute({
      sql: "UPDATE sessions SET ended_at = ?, duration_seconds = ?, description = ?, production_percentage = ?, paused_at = NULL, paused_seconds = ? WHERE id = ? AND user_id = ?",
      args: [endedAt.toISOString(), durationSeconds, description ?? null, data.productionPercentage ?? null, pausedSeconds, id, userId],
    });
    return NextResponse.json({
      id,
      endedAt: endedAt.toISOString(),
      durationSeconds,
      description: description ?? null,
      productionPercentage: data.productionPercentage ?? null,
    });
  }
  if (request.method === "DELETE") {
    const result = await db.execute({ sql: "DELETE FROM sessions WHERE id = ? AND user_id = ?", args: [id, userId] });
    return result.rowsAffected ? noContent() : error("Session not found", 404);
  }
  if (request.method === "PATCH") {
    const data = await body(request);
    const allocationError = productionPercentageError(data.productionPercentage);
    if (allocationError) return allocationError;
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const invalidProject = await projectIdError(userId, data.projectId);
    if (invalidProject) return invalidProject;
    const invalidTasks = await taskIdsError(userId, data.taskIds);
    if (invalidTasks) return invalidTasks;
    const existing = await db.execute({
      sql: "SELECT started_at, ended_at, description, project_id, production_percentage, paused_at, paused_seconds FROM sessions WHERE id = ? AND user_id = ?",
      args: [id, userId],
    });
    const session = existing.rows[0];
    if (!session) return error("Session not found", 404);
    const start = new Date(data.startedAt ?? session.started_at as string);
    const wasActive = session.ended_at === null;
    const end = data.endedAt === null
      ? null
      : data.endedAt !== undefined
        ? new Date(data.endedAt)
        : wasActive
          ? null
          : new Date(session.ended_at as string);
    if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) return error("startedAt and endedAt must be valid dates");
    if (end === null && start.getTime() > Date.now()) return error("startedAt cannot be in the future");
    if (end && end <= start) return error("endedAt must be after startedAt");
    const selectedTaskIds: number[] | null = Array.isArray(data.taskIds)
      ? Array.from(new Set<number>(data.taskIds.map((value: unknown) => Number(value))))
      : null;
    if (selectedTaskIds && end === null) return error("Completed tasks can only be assigned to a completed session");
    let selectedTasks: Array<{ id: number; completed_at: string | null; period_start: string | null }> = [];
    if (selectedTaskIds?.length) {
      const placeholders = selectedTaskIds.map(() => "?").join(",");
      const selected = await db.execute({
        sql: `SELECT id, completed_at, period_start FROM tasks WHERE user_id = ? AND id IN (${placeholders})`,
        args: [userId, ...selectedTaskIds],
      });
      selectedTasks = selected.rows.map((row) => ({
        id: Number(row.id),
        completed_at: row.completed_at as string | null,
        period_start: row.period_start as string | null,
      }));
      if (selectedTasks.some((task) => task.completed_at === null && task.period_start !== null)) {
        return error("Only completed tasks or Backlog tasks can be assigned to a completed session");
      }
      if (selectedTasks.some((task) => task.completed_at === null) && typeof data.taskPeriodStart !== "string") {
        return error("taskPeriodStart is required when assigning Backlog tasks");
      }
    }
    const pausedSeconds = Number(session.paused_seconds ?? 0);
    const durationSeconds = end
      ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000) - pausedSeconds)
      : null;
    const description = data.description !== undefined ? data.description : session.description;
    const projectId = data.projectId !== undefined
      ? (data.projectId === null ? null : Number(data.projectId))
      : session.project_id;
    const productionPercentage = end === null
      ? null
      : data.productionPercentage !== undefined
        ? data.productionPercentage
        : session.production_percentage;
    try {
      await db.execute({
        sql: "UPDATE sessions SET description = ?, project_id = ?, started_at = ?, ended_at = ?, duration_seconds = ?, production_percentage = ? WHERE id = ? AND user_id = ?",
        args: [description ?? null, projectId ?? null, start.toISOString(), end?.toISOString() ?? null, durationSeconds, productionPercentage ?? null, id, userId],
      });
      if (selectedTaskIds) {
        const backlogTaskIds = selectedTasks
          .filter((task) => task.completed_at === null)
          .map((task) => task.id);
        if (backlogTaskIds.length) {
          const placeholders = backlogTaskIds.map(() => "?").join(",");
          await db.execute({
            sql: `UPDATE tasks SET completed_at = ?, period_start = ? WHERE user_id = ? AND id IN (${placeholders})`,
            args: [new Date().toISOString(), data.taskPeriodStart as string, userId, ...backlogTaskIds],
          });
        }
        await db.execute({ sql: "DELETE FROM session_tasks WHERE session_id = ?", args: [id] });
        for (const taskId of selectedTaskIds) {
          await db.execute({
            sql: "INSERT INTO session_tasks (session_id, task_id) VALUES (?, ?)",
            args: [id, taskId],
          });
        }
      }
    } catch (caught) {
      if (!uniqueActiveError(caught)) throw caught;
      return NextResponse.json({ error: "A session is already in progress", session: await activeSession(userId) }, { status: 409 });
    }
    return NextResponse.json({
      id, description: description ?? null, projectId: projectId ?? null,
      startedAt: start.toISOString(), endedAt: end?.toISOString() ?? null, durationSeconds,
      productionPercentage: productionPercentage ?? null,
      pausedAt: session.paused_at ?? null,
      pausedSeconds,
    });
  }
  return error("Not found", 404);
}

type ProjectRow = {
  id: number; name: string; icon: string | null; description: string | null; resources: string | null;
  parent_id: number | null; pinned: number; archived: number; sort_order: number; last_used_at: string | null;
};

async function userProjects(userId: number) {
  const result = await db.execute({
    sql: `SELECT projects.id, projects.name, projects.icon, projects.description, projects.resources,
                 projects.parent_id, projects.pinned, projects.archived, projects.sort_order,
                 MAX(sessions.started_at) AS last_used_at
          FROM projects LEFT JOIN sessions ON sessions.project_id = projects.id
          WHERE projects.user_id = ?
          GROUP BY projects.id`,
    args: [userId],
  });
  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    parent_id: row.parent_id === null ? null : Number(row.parent_id),
    pinned: Number(row.pinned),
    archived: Number(row.archived),
    sort_order: Number(row.sort_order),
  })) as unknown as ProjectRow[];
}

function decorateProjects(rows: ProjectRow[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathFor = (row: ProjectRow) => {
    const names = [row.name];
    let parentId = row.parent_id;
    const seen = new Set([row.id]);
    while (parentId !== null && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parent_id;
    }
    return names;
  };
  return rows.map((row) => {
    const names = pathFor(row);
    return {
      id: row.id, name: row.name, icon: row.icon, description: row.description, resources: row.resources,
      parentId: row.parent_id, pinned: Boolean(row.pinned), archived: Boolean(row.archived),
      path: names.join(" / "), depth: names.length, sortOrder: row.sort_order, lastUsedAt: row.last_used_at,
    };
  }).sort((a, b) => a.depth - b.depth || Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder || a.path.localeCompare(b.path));
}

function validateProjectParent(rows: ProjectRow[], id: number | null, parentId: number | null) {
  if (parentId === null) return null;
  if (parentId === id) return "A project cannot be its own parent";
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (!byId.has(parentId)) return "Parent project not found";
  let depth = 1;
  let cursor: number | null = parentId;
  const ancestors = new Set<number>();
  while (cursor !== null) {
    if (cursor === id) return "A project cannot be moved below its descendant";
    if (ancestors.has(cursor)) return "Project hierarchy contains a cycle";
    ancestors.add(cursor);
    cursor = byId.get(cursor)?.parent_id ?? null;
    depth += 1;
  }
  const descendants = (projectId: number): number =>
    1 + Math.max(0, ...rows.filter((row) => row.parent_id === projectId).map((row) => descendants(row.id)));
  const subtreeDepth = id === null ? 1 : descendants(id);
  return depth - 1 + subtreeDepth > 3 ? "Projects can be nested to a maximum of three levels" : null;
}

async function projectRoutes(request: NextRequest, parts: string[], userId: number) {
  const id = parts[1] ? Number(parts[1]) : null;
  if (id === null && request.method === "GET") {
    return NextResponse.json(decorateProjects(await userProjects(userId)));
  }
  if (id === null && request.method === "POST") {
    const data = await body(request);
    if (typeof data.name !== "string" || !data.name.trim()) return error("Name is required");
    if (data.name.trim().length > MAX_NAME_LENGTH) return error(`Name must be at most ${MAX_NAME_LENGTH} characters`);
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const resourcesError = optionalTextError(data.resources, "Resources", MAX_PROJECT_RESOURCES_LENGTH);
    if (resourcesError) return resourcesError;
    if (data.icon !== undefined && data.icon !== null && !PROJECT_ICON_TYPES.has(data.icon)) return error("Invalid project icon");
    if (data.pinned !== undefined && typeof data.pinned !== "boolean") return error("pinned must be a boolean");
    const parentId = data.parentId == null ? null : Number(data.parentId);
    const rows = await userProjects(userId);
    const parentError = validateProjectParent(rows, null, parentId);
    if (parentError) return error(parentError);
    if (rows.some((row) => row.parent_id === parentId && row.name.toLowerCase() === data.name.trim().toLowerCase())) {
      return error("A project with this name already exists under that parent", 409);
    }
    const description = typeof data.description === "string" ? data.description.trim() || null : null;
    const resources = typeof data.resources === "string" ? data.resources.trim() || null : null;
    const siblingOrders = rows.filter((row) => row.parent_id === parentId && !row.pinned).map((row) => row.sort_order);
    const sortOrder = siblingOrders.length ? Math.max(...siblingOrders) + 1 : 0;
    const result = await db.execute({
      sql: "INSERT INTO projects (user_id, name, icon, description, resources, parent_id, pinned, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [userId, data.name.trim(), data.icon ?? null, description, resources, parentId, data.pinned ? 1 : 0, sortOrder],
    });
    const projects = decorateProjects(await userProjects(userId));
    return NextResponse.json(projects.find((project) => project.id === Number(result.lastInsertRowid)), { status: 201 });
  }
  if (!Number.isInteger(id)) return error("Not found", 404);
  if (request.method === "PATCH") {
    const data = await body(request);
    const rows = await userProjects(userId);
    const existing = rows.find((row) => row.id === id);
    if (!existing) return error("Project not found", 404);
    const parentId = data.parentId !== undefined
      ? (data.parentId === null ? null : Number(data.parentId))
      : existing.parent_id;
    const parentError = validateProjectParent(rows, id, parentId);
    if (parentError) return error(parentError);
    const name = data.name !== undefined ? (typeof data.name === "string" ? data.name.trim() : "") : existing.name;
    if (!name) return error("Name is required");
    if (name.length > MAX_NAME_LENGTH) return error(`Name must be at most ${MAX_NAME_LENGTH} characters`);
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const resourcesError = optionalTextError(data.resources, "Resources", MAX_PROJECT_RESOURCES_LENGTH);
    if (resourcesError) return resourcesError;
    if (data.icon !== undefined && data.icon !== null && !PROJECT_ICON_TYPES.has(data.icon)) return error("Invalid project icon");
    if (data.pinned !== undefined && typeof data.pinned !== "boolean") return error("pinned must be a boolean");
    if (data.archived !== undefined && typeof data.archived !== "boolean") return error("archived must be a boolean");
    if (data.position !== undefined && (!Number.isInteger(data.position) || data.position < 0)) {
      return error("position must be a non-negative integer");
    }
    if (rows.some((row) => row.id !== id && row.parent_id === parentId && row.name.toLowerCase() === name.toLowerCase())) {
      return error("A project with this name already exists under that parent", 409);
    }
    const description = data.description !== undefined
      ? (typeof data.description === "string" ? data.description.trim() || null : null)
      : existing.description;
    const resources = data.resources !== undefined
      ? (typeof data.resources === "string" ? data.resources.trim() || null : null)
      : existing.resources;
    const archived = data.archived !== undefined ? Boolean(data.archived) : Boolean(existing.archived);
    const targetPinned = data.pinned !== undefined ? Boolean(data.pinned) : Boolean(existing.pinned);
    const targetSiblings = rows
      .filter((row) => row.id !== id && row.parent_id === parentId && Boolean(row.pinned) === targetPinned)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const targetPosition = data.position !== undefined
      ? Math.min(Number(data.position), targetSiblings.length)
      : existing.parent_id === parentId && Boolean(existing.pinned) === targetPinned
        ? Math.min(existing.sort_order, targetSiblings.length)
        : targetSiblings.length;
    targetSiblings.splice(targetPosition, 0, existing);
    for (let position = 0; position < targetSiblings.length; position += 1) {
      if (targetSiblings[position].id === id) continue;
      await db.execute({
        sql: "UPDATE projects SET sort_order = ? WHERE id = ? AND user_id = ?",
        args: [position, targetSiblings[position].id, userId],
      });
    }
    const result = await db.execute({
      sql: "UPDATE projects SET name = ?, icon = ?, description = ?, resources = ?, parent_id = ?, pinned = ?, archived = ?, sort_order = ? WHERE id = ? AND user_id = ?",
      args: [name, data.icon !== undefined ? data.icon : existing.icon, description, resources, parentId,
        data.pinned !== undefined ? (data.pinned ? 1 : 0) : existing.pinned,
        archived ? 1 : 0, targetPosition, id!, userId],
    });
    if (!result.rowsAffected) return error("Project not found", 404);
    if (data.archived !== undefined) {
      const descendants = new Set<number>([id!]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) if (row.parent_id !== null && descendants.has(row.parent_id) && !descendants.has(row.id)) {
          descendants.add(row.id); changed = true;
        }
      }
      for (const descendantId of descendants) {
        await db.execute({ sql: "UPDATE projects SET archived = ? WHERE id = ? AND user_id = ?", args: [archived ? 1 : 0, descendantId, userId] });
      }
    }
    return NextResponse.json(decorateProjects(await userProjects(userId)).find((project) => project.id === id));
  }
  if (request.method === "DELETE") {
    const rows = await userProjects(userId);
    const existing = rows.find((row) => row.id === id);
    if (!existing) return error("Project not found", 404);
    if (!existing.archived) return error("Archive this project before deleting it", 409);

    const branch = new Set<number>([id!]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if (row.parent_id !== null && branch.has(row.parent_id) && !branch.has(row.id)) {
          branch.add(row.id);
          changed = true;
        }
      }
    }
    const branchRows = rows
      .filter((row) => branch.has(row.id))
      .sort((a, b) => {
        const depth = (row: ProjectRow) => decorateProjects(rows).find((project) => project.id === row.id)?.depth ?? 1;
        return depth(b) - depth(a);
      });
    if (branchRows.some((row) => !row.archived)) {
      return error("Restore or archive the entire project branch before deleting it", 409);
    }
    const branchIds = branchRows.map((row) => row.id);
    const placeholders = branchIds.map(() => "?").join(", ");
    await db.batch([
      {
        sql: `DELETE FROM session_tasks WHERE task_id IN (
                SELECT id FROM tasks WHERE user_id = ? AND project_id IN (${placeholders})
              )`,
        args: [userId, ...branchIds],
      },
      { sql: `DELETE FROM tasks WHERE user_id = ? AND project_id IN (${placeholders})`, args: [userId, ...branchIds] },
      { sql: `UPDATE sessions SET project_id = NULL WHERE user_id = ? AND project_id IN (${placeholders})`, args: [userId, ...branchIds] },
      ...branchRows.map((row) => ({
        sql: "DELETE FROM projects WHERE id = ? AND user_id = ?",
        args: [row.id, userId],
      })),
    ], "write");
    return noContent();
  }
  return error("Not found", 404);
}

async function noiseUsageRoutes(request: NextRequest, parts: string[], userId: number) {
  if (parts[1] === "start" && request.method === "POST") {
    const data = await body(request);
    if (typeof data.audioType !== "string" || !FOCUS_AUDIO_TYPES.has(data.audioType)) {
      return error("Invalid focus audio type");
    }
    await db.execute({
      sql: `UPDATE focus_noise_usage
            SET ended_at = last_heartbeat_at,
                duration_seconds = MAX(0, unixepoch(last_heartbeat_at) - unixepoch(started_at))
            WHERE user_id = ? AND ended_at IS NULL`,
      args: [userId],
    });
    const now = new Date().toISOString();
    const result = await db.execute({
      sql: `INSERT INTO focus_noise_usage (user_id, audio_type, started_at, last_heartbeat_at)
            VALUES (?, ?, ?, ?)`,
      args: [userId, data.audioType, now, now],
    });
    return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
  }

  const id = Number(parts[1]);
  if (!Number.isInteger(id) || id < 1) return error("Not found", 404);
  if (parts[2] === "heartbeat" && request.method === "POST") {
    await db.execute({
      sql: "UPDATE focus_noise_usage SET last_heartbeat_at = ? WHERE id = ? AND user_id = ? AND ended_at IS NULL",
      args: [new Date().toISOString(), id, userId],
    });
    return noContent();
  }
  if (parts[2] === "stop" && request.method === "POST") {
    const endedAt = new Date().toISOString();
    await db.execute({
      sql: `UPDATE focus_noise_usage
            SET ended_at = ?, last_heartbeat_at = ?,
                duration_seconds = MAX(0, unixepoch(?) - unixepoch(started_at))
            WHERE id = ? AND user_id = ? AND ended_at IS NULL`,
      args: [endedAt, endedAt, endedAt, id, userId],
    });
    return noContent();
  }
  return error("Not found", 404);
}

async function noteRoutes(request: NextRequest, parts: string[], userId: number) {
  if (!parts[1] && request.method === "GET") {
    const result = await db.execute({
      sql: "SELECT id, scope, date_key, content, updated_at FROM notes WHERE user_id = ?",
      args: [userId],
    });
    return NextResponse.json(result.rows);
  }
  const scope = parts[1];
  const dateKey = parts[2];
  const validDateKey = scope === "long-term" ? dateKey === "long-term" : /^\d{4}-\d{2}-\d{2}$/.test(dateKey ?? "");
  if ((scope !== "day" && scope !== "week" && scope !== "long-term") || !validDateKey) {
    return error("Invalid note scope or date");
  }
  if (request.method === "DELETE") {
    await db.execute({
      sql: "DELETE FROM notes WHERE user_id = ? AND scope = ? AND date_key = ?",
      args: [userId, scope, dateKey],
    });
    return noContent();
  }
  if (request.method === "PUT") {
    const data = await body(request);
    if (typeof data.content !== "string") return error("content is required");
    if (data.content.length > MAX_NOTE_LENGTH) return error(`content must be at most ${MAX_NOTE_LENGTH} characters`);
    const content = data.content.trim();
    if (!content) {
      await db.execute({
        sql: "DELETE FROM notes WHERE user_id = ? AND scope = ? AND date_key = ?",
        args: [userId, scope, dateKey],
      });
      return noContent();
    }
    const updatedAt = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO notes (user_id, scope, date_key, content, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (user_id, scope, date_key)
            DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
      args: [userId, scope, dateKey, content, updatedAt],
    });
    const result = await db.execute({
      sql: "SELECT id, scope, date_key, content, updated_at FROM notes WHERE user_id = ? AND scope = ? AND date_key = ?",
      args: [userId, scope, dateKey],
    });
    return NextResponse.json(result.rows[0]);
  }
  return error("Not found", 404);
}

function periodStartError(value: unknown) {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? null
    : error("periodStart must be a YYYY-MM-DD date or null");
}

async function taskRoutes(request: NextRequest, parts: string[], userId: number) {
  const TASK_COLUMNS = "id, period_start, project_id, title, description, completed_at";

  if (parts[1] === "backlog" && request.method === "POST") {
    const data = await body(request);
    if (typeof data.before !== "string" || /^\d{4}-\d{2}-\d{2}$/.test(data.before) === false) {
      return error("before must be a YYYY-MM-DD date");
    }
    const candidates = await db.execute({
      sql: `SELECT ${TASK_COLUMNS} FROM tasks
            WHERE user_id = ? AND period_start IS NOT NULL AND period_start < ? AND completed_at IS NULL
            ORDER BY created_at`,
      args: [userId, data.before],
    });
    await db.execute({
      sql: `UPDATE tasks SET period_start = NULL
            WHERE user_id = ? AND period_start IS NOT NULL AND period_start < ? AND completed_at IS NULL`,
      args: [userId, data.before],
    });
    return NextResponse.json({
      moved: candidates.rows.map((task) => ({ ...task, period_start: null })),
    });
  }

  if (parts[1] === "backlog" && request.method === "GET") {
    const result = await db.execute({
      sql: `SELECT ${TASK_COLUMNS} FROM tasks
            WHERE user_id = ? AND period_start IS NULL AND completed_at IS NULL
            ORDER BY created_at`,
      args: [userId],
    });
    return NextResponse.json(result.rows);
  }

  const id = parts[1] ? Number(parts[1]) : null;

  if (id === null && request.method === "GET") {
    const result = await db.execute({
      sql: `SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? ORDER BY created_at`,
      args: [userId],
    });
    return NextResponse.json(result.rows);
  }
  if (id === null && request.method === "POST") {
    const data = await body(request);
    const periodStartInvalid = periodStartError(data.periodStart);
    if (periodStartInvalid) return periodStartInvalid;
    if (typeof data.title !== "string" || !data.title.trim()) return error("Title is required");
    if (data.title.trim().length > MAX_TASK_TITLE_LENGTH) return error(`Title must be at most ${MAX_TASK_TITLE_LENGTH} characters`);
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const invalidProject = await projectIdError(userId, data.projectId);
    if (invalidProject) return invalidProject;
    if (data.completed !== undefined && typeof data.completed !== "boolean") return error("completed must be a boolean");
    let attachedSessionId: number | null = null;
    if (data.sessionId !== undefined) {
      attachedSessionId = Number(data.sessionId);
      if (!Number.isInteger(attachedSessionId)) return error("sessionId must be an integer");
      const selectedSession = await db.execute({
        sql: "SELECT ended_at FROM sessions WHERE id = ? AND user_id = ?",
        args: [attachedSessionId, userId],
      });
      if (!selectedSession.rows.length) return error("Session not found", 404);
      if (selectedSession.rows[0].ended_at !== null && data.completed !== true) {
        return error("Tasks added to a completed session must be completed");
      }
    }
    const completedAt = data.completed === true ? new Date().toISOString() : null;
    const result = await db.execute({
      sql: "INSERT INTO tasks (user_id, period_start, project_id, title, description, completed_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [
        userId,
        data.periodStart ?? null,
        data.projectId == null ? null : Number(data.projectId),
        data.title.trim(),
        typeof data.description === "string" ? data.description.trim() || null : null,
        completedAt,
      ],
    });
    if (attachedSessionId !== null) {
      await db.execute({
        sql: "INSERT INTO session_tasks (session_id, task_id) VALUES (?, ?)",
        args: [attachedSessionId, Number(result.lastInsertRowid)],
      });
    }
    const created = await db.execute({
      sql: `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`,
      args: [Number(result.lastInsertRowid)],
    });
    return NextResponse.json(created.rows[0], { status: 201 });
  }
  if (!Number.isInteger(id)) return error("Not found", 404);
  if (request.method === "PATCH") {
    const data = await body(request);
    const existing = await db.execute({
      sql: "SELECT title, description, project_id, period_start, completed_at FROM tasks WHERE id = ? AND user_id = ?",
      args: [id, userId],
    });
    const row = existing.rows[0];
    if (!row) return error("Task not found", 404);
    const title = data.title !== undefined ? (typeof data.title === "string" ? data.title.trim() : "") : (row.title as string);
    if (!title) return error("Title is required");
    if (title.length > MAX_TASK_TITLE_LENGTH) return error(`Title must be at most ${MAX_TASK_TITLE_LENGTH} characters`);
    const descriptionError = optionalTextError(data.description, "Description", MAX_DESCRIPTION_LENGTH);
    if (descriptionError) return descriptionError;
    const description = data.description !== undefined
      ? (typeof data.description === "string" ? data.description.trim() || null : null)
      : row.description;
    if (data.projectId !== undefined) return error("A task's project is fixed at creation");
    const periodStartInvalid = periodStartError(data.periodStart);
    if (periodStartInvalid) return periodStartInvalid;
    const periodStart = data.periodStart !== undefined ? data.periodStart : row.period_start;
    if (data.completed !== undefined && typeof data.completed !== "boolean") return error("completed must be a boolean");
    const completedAt = data.completed !== undefined ? (data.completed ? new Date().toISOString() : null) : row.completed_at;
    await db.execute({
      sql: "UPDATE tasks SET title = ?, description = ?, project_id = ?, period_start = ?, completed_at = ? WHERE id = ? AND user_id = ?",
      args: [title, description, row.project_id, periodStart, completedAt, id!, userId],
    });
    if (data.completed === false && data.periodStart === null) {
      await db.execute({ sql: "DELETE FROM session_tasks WHERE task_id = ?", args: [id] });
    }
    if (data.sessionId !== undefined) {
      const attachedSessionId = Number(data.sessionId);
      if (!Number.isInteger(attachedSessionId)) return error("sessionId must be an integer");
      const selectedSession = await db.execute({
        sql: "SELECT ended_at FROM sessions WHERE id = ? AND user_id = ?",
        args: [attachedSessionId, userId],
      });
      const sessionRow = selectedSession.rows[0];
      if (!sessionRow) return error("Session not found", 404);
      if (sessionRow.ended_at !== null) return error("Only an active session can accept tasks");
      const attached = await db.execute({
        sql: "SELECT 1 FROM session_tasks WHERE session_id = ? AND task_id = ?",
        args: [attachedSessionId, id],
      });
      if (!attached.rows.length) {
        await db.execute({
          sql: "INSERT INTO session_tasks (session_id, task_id) VALUES (?, ?)",
          args: [attachedSessionId, id],
        });
      }
    }
    const updated = await db.execute({
      sql: `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`,
      args: [id],
    });
    return NextResponse.json(updated.rows[0]);
  }
  if (request.method === "DELETE") {
    const owned = await db.execute({ sql: "SELECT 1 FROM tasks WHERE id = ? AND user_id = ?", args: [id, userId] });
    if (!owned.rows.length) return error("Task not found", 404);
    await db.execute({ sql: "DELETE FROM session_tasks WHERE task_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM tasks WHERE id = ?", args: [id] });
    return noContent();
  }
  return error("Not found", 404);
}

function socialUser(row: Record<string, unknown>) {
  return { id: Number(row.user_id), name: row.name ?? null, email: row.email, avatar: row.avatar ?? null };
}

async function socialRoutes(request: NextRequest, parts: string[], userId: number) {
  const section = parts[1];
  const id = parts[2] ? Number(parts[2]) : null;
  if (section === "nudges" && id !== null && request.method === "POST") {
    if (id === userId) return error("You cannot nudge yourself");
    const friendship = await db.execute({
      sql: `SELECT 1 FROM friendships
            WHERE status = 'accepted'
              AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`,
      args: [userId, id, id, userId],
    });
    if (!friendship.rows.length) return error("You can only nudge friends", 403);
    const recentNudge = await db.execute({
      sql: `SELECT 1 FROM social_notifications
            WHERE user_id = ? AND actor_id = ? AND type = 'nudge'
              AND created_at > datetime('now', '-30 seconds')
            LIMIT 1`,
      args: [id, userId],
    });
    if (recentNudge.rows.length) return error("You can nudge this friend again in 30 seconds", 429);
    const attemptKey = rateLimitKey("nudge", `${userId}:${id}`);
    if (await rateLimited(attemptKey, 10)) return error("Too many nudges. Give your friend a moment.", 429);
    await recordRateLimitAttempt(attemptKey);
    const result = await db.execute({
      sql: "INSERT INTO social_notifications (user_id, actor_id, type) VALUES (?, ?, 'nudge')",
      args: [id, userId],
    });
    return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
  }
  if (section === "notifications" && id === null && request.method === "GET") {
    const result = await db.execute({
      sql: `SELECT n.id, n.type, n.read_at, n.created_at,
                   u.id AS actor_id, u.name AS actor_name, u.email AS actor_email, u.avatar AS actor_avatar
            FROM social_notifications n
            JOIN users u ON u.id = n.actor_id
            WHERE n.user_id = ?
            ORDER BY n.id DESC LIMIT 50`,
      args: [userId],
    });
    return NextResponse.json(result.rows.map((row) => ({
      id: Number(row.id),
      type: row.type,
      readAt: row.read_at ?? null,
      createdAt: row.created_at,
      actor: {
        id: Number(row.actor_id),
        name: row.actor_name ?? null,
        email: row.actor_email,
        avatar: row.actor_avatar ?? null,
      },
    })));
  }
  if (section === "notifications" && id === null && request.method === "PATCH") {
    await db.execute({
      sql: "UPDATE social_notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL",
      args: [userId],
    });
    return noContent();
  }
  if (section === "notifications" && id !== null && request.method === "DELETE") {
    const result = await db.execute({
      sql: "DELETE FROM social_notifications WHERE id = ? AND user_id = ?",
      args: [id, userId],
    });
    return result.rowsAffected ? noContent() : error("Notification not found", 404);
  }
  if (section === "notifications" && id === null && request.method === "DELETE") {
    await db.execute({ sql: "DELETE FROM social_notifications WHERE user_id = ?", args: [userId] });
    return noContent();
  }
  if (section === "connections" && id === null && request.method === "GET") {
    const result = await db.execute({
      sql: `SELECT f.id, f.status, f.requester_id, f.addressee_id,
                   u.id AS user_id, u.name, u.email, u.avatar
            FROM friendships f
            JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
            WHERE f.requester_id = ? OR f.addressee_id = ?
            ORDER BY f.created_at DESC`,
      args: [userId, userId, userId],
    });
    return NextResponse.json(result.rows.map((row) => ({
      friendshipId: Number(row.id), status: row.status,
      direction: row.status === "accepted" ? "friend" : Number(row.requester_id) === userId ? "outgoing" : "incoming",
      user: socialUser(row),
    })));
  }
  if (section === "requests" && id === null && request.method === "POST") {
    const data = await body(request);
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    if (!validEmail(email)) return error("A valid email is required");
    const attemptKey = rateLimitKey("friend-request", `${clientAddress(request)}:${userId}`);
    if (await rateLimited(attemptKey, 20)) return error("Too many friend requests. Try again later.", 429);
    await recordRateLimitAttempt(attemptKey);
    const found = await db.execute({
      sql: "SELECT id, name, email, avatar FROM users WHERE lower(email) = ?",
      args: [email],
    });
    const target = found.rows[0];
    if (!target) return error("No Sentinel user has that email", 404);
    const targetId = Number(target.id);
    if (targetId === userId) return error("You cannot send a friend request to yourself");
    const existing = await db.execute({
      sql: `SELECT id, status, requester_id FROM friendships
            WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
      args: [userId, targetId, targetId, userId],
    });
    const connection = existing.rows[0];
    if (connection?.status === "accepted") return error("You are already friends", 409);
    if (connection && Number(connection.requester_id) === targetId) {
      await db.execute({
        sql: "UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE id = ?",
        args: [connection.id],
      });
      return NextResponse.json({
        friendshipId: Number(connection.id), status: "accepted", direction: "friend",
        user: { id: targetId, name: target.name, email: target.email, avatar: target.avatar },
      });
    }
    if (connection) return error("Friend request already sent", 409);
    const result = await db.execute({
      sql: "INSERT INTO friendships (requester_id, addressee_id) VALUES (?, ?)",
      args: [userId, targetId],
    });
    return NextResponse.json({
      friendshipId: Number(result.lastInsertRowid), status: "pending", direction: "outgoing",
      user: { id: targetId, name: target.name, email: target.email, avatar: target.avatar },
    }, { status: 201 });
  }
  if (section === "requests" && id !== null && request.method === "PATCH") {
    const data = await body(request);
    if (data.action !== "accept" && data.action !== "decline") return error("Action must be accept or decline");
    const found = await db.execute({
      sql: "SELECT id FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'",
      args: [id, userId],
    });
    if (!found.rows[0]) return error("Friend request not found", 404);
    if (data.action === "accept") {
      await db.execute({
        sql: "UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE id = ?",
        args: [id],
      });
    } else await db.execute({ sql: "DELETE FROM friendships WHERE id = ?", args: [id] });
    return noContent();
  }
  if (section === "connections" && id !== null && request.method === "DELETE") {
    const result = await db.execute({
      sql: "DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)",
      args: [id, userId, userId],
    });
    return result.rowsAffected ? noContent() : error("Connection not found", 404);
  }
  if (section === "activity" && request.method === "GET") {
    const requestedLimit = request.nextUrl.searchParams.get("limit");
    const limit = requestedLimit ? Number(requestedLimit) : 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return error("limit must be an integer between 1 and 100");
    }
    const cursorParam = request.nextUrl.searchParams.get("cursor");
    const cursor = parseActivityCursor(cursorParam);
    if (cursorParam && !cursor) return error("Invalid activity cursor");
    const activeRank = "(CASE WHEN s.ended_at IS NULL THEN 1 ELSE 0 END)";
    const cursorClause = cursor
      ? `AND (${activeRank} < ? OR (${activeRank} = ? AND (s.started_at < ? OR (s.started_at = ? AND s.id < ?))))`
      : "";
    const args: (string | number)[] = [userId, userId, userId];
    if (cursor) args.push(cursor[0], cursor[0], cursor[1], cursor[1], cursor[2]);
    args.push(limit + 1);
    const result = await db.execute({
      sql: `SELECT s.id, s.user_id, s.started_at, s.ended_at, s.duration_seconds, s.paused_at, s.paused_seconds,
                   CASE WHEN u.share_session_descriptions = 1 THEN s.description ELSE NULL END AS description,
                   p.name AS project_name, p.icon AS project_icon,
                   u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar
            FROM friendships f
            JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
            JOIN sessions s ON s.user_id = u.id
            LEFT JOIN projects p ON p.id = s.project_id AND p.user_id = s.user_id
            WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?) ${cursorClause}
            ORDER BY ${activeRank} DESC, s.started_at DESC, s.id DESC
            LIMIT ?`,
      args,
    });
    const hasMore = result.rows.length > limit;
    const items = result.rows.slice(0, limit);
    const last = items.at(-1);
    return NextResponse.json({
      items,
      nextCursor:
        hasMore && last
          ? activityCursor(last.ended_at === null ? 1 : 0, last.started_at as string, Number(last.id))
          : null,
    });
  }
  return error("Not found", 404);
}

function dateKeyInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDateKeyDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayForDateKey(key: string) {
  const date = new Date(`${key}T00:00:00.000Z`);
  const day = date.getUTCDay();
  return addDateKeyDays(key, -(day === 0 ? 6 : day - 1));
}

async function reportRoutes(request: NextRequest, parts: string[], userId: number) {
  if (parts[1] !== "weekly" || request.method !== "GET") return error("Not found", 404);
  const timezone = request.nextUrl.searchParams.get("timezone") || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    return error("Invalid timezone");
  }
  const result = await db.execute({
    sql: `SELECT s.started_at, s.duration_seconds, s.production_percentage,
                 project.name AS project_name
          FROM sessions s
          LEFT JOIN projects project ON project.id = s.project_id AND project.user_id = s.user_id
          WHERE s.user_id = ? AND s.ended_at IS NOT NULL`,
    args: [userId],
  });
  const sessions = result.rows.map((row) => ({
    startedAt: row.started_at as string,
    duration: Number(row.duration_seconds ?? 0),
    production: row.production_percentage === null ? 0 : Number(row.production_percentage),
    project: row.project_name as string | null,
  }));
  const currentMonday = mondayForDateKey(dateKeyInTimezone(new Date(), timezone));
  for (let offset = 1; offset <= 12; offset += 1) {
    const weekStart = addDateKeyDays(currentMonday, -7 * offset);
    const weekEnd = addDateKeyDays(weekStart, 6);
    const weekSessions = sessions.filter(
      (session) => mondayForDateKey(dateKeyInTimezone(new Date(session.startedAt), timezone)) === weekStart,
    );
    const durations = weekSessions.map((session) => session.duration).sort((a, b) => a - b);
    const middle = Math.floor(durations.length / 2);
    const medianSeconds = durations.length === 0
      ? null
      : durations.length % 2 ? durations[middle] : Math.round((durations[middle - 1] + durations[middle]) / 2);
    let learningSeconds = 0;
    let producingSeconds = 0;
    const projects = new Map<string, number>();
    for (const session of weekSessions) {
      const producing = Math.round(session.duration * session.production / 100);
      producingSeconds += producing;
      learningSeconds += session.duration - producing;
      if (session.project) projects.set(session.project, (projects.get(session.project) ?? 0) + session.duration);
    }
    const topProject = Array.from(projects.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    const data = {
      weekStart, weekEnd, timezone,
      totalSeconds: learningSeconds + producingSeconds,
      activeDays: new Set(weekSessions.map((session) => dateKeyInTimezone(new Date(session.startedAt), timezone))).size,
      medianSeconds, learningSeconds, producingSeconds, topProject,
      sessionCount: weekSessions.length,
    };
    await db.execute({
      sql: `INSERT OR IGNORE INTO weekly_reports
            (user_id, week_start, timezone, calculation_version, data_json)
            VALUES (?, ?, ?, 2, ?)`,
      args: [userId, weekStart, timezone, JSON.stringify(data)],
    });
  }
  const reports = await db.execute({
    sql: `SELECT data_json, finalized_at FROM weekly_reports
          WHERE user_id = ? AND timezone = ? AND calculation_version = 2
          ORDER BY week_start DESC LIMIT 12`,
    args: [userId, timezone],
  });
  return NextResponse.json(reports.rows.map((row) => ({
    ...JSON.parse(row.data_json as string),
    finalizedAt: row.finalized_at,
  })));
}

function icsEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function calendarRoutes(request: NextRequest, parts: string[], userId: number | null) {
  if (parts[1] === "feed" && request.method === "GET") {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) return error("Calendar token is required", 401);
    const owner = await db.execute({
      sql: "SELECT id FROM users WHERE calendar_token = ?",
      args: [token],
    });
    if (!owner.rows[0]) return error("Calendar feed not found", 404);
    const sessions = await db.execute({
      sql: `SELECT sessions.id, sessions.started_at, sessions.ended_at, sessions.description,
                   CASE WHEN grandparent.id IS NOT NULL THEN grandparent.name || ' / ' || parent.name || ' / ' || project.name
                        WHEN parent.id IS NOT NULL THEN parent.name || ' / ' || project.name ELSE project.name END AS project_path
            FROM sessions
            LEFT JOIN projects project ON project.id = sessions.project_id AND project.user_id = sessions.user_id
            LEFT JOIN projects parent ON parent.id = project.parent_id AND parent.user_id = sessions.user_id
            LEFT JOIN projects grandparent ON grandparent.id = parent.parent_id AND grandparent.user_id = sessions.user_id
            WHERE sessions.user_id = ? AND sessions.ended_at IS NOT NULL
            ORDER BY sessions.started_at DESC LIMIT 1000`,
      args: [owner.rows[0].id],
    });
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sentinel//Activity Calendar//EN",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Sentinel Activity",
    ];
    for (const session of sessions.rows) {
      const project = session.project_path ? String(session.project_path) : "Focus session";
      lines.push(
        "BEGIN:VEVENT",
        `UID:session-${session.id}@sentinel`,
        `DTSTAMP:${icsDate(session.ended_at as string)}`,
        `DTSTART:${icsDate(session.started_at as string)}`,
        `DTEND:${icsDate(session.ended_at as string)}`,
        `SUMMARY:${icsEscape(project)}`,
        `DESCRIPTION:${icsEscape(session.description ? String(session.description) : "Sentinel activity")}`,
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    return new NextResponse(`${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="sentinel-activity.ics"',
      },
    });
  }
  if (parts[1] === "token" && userId !== null && request.method === "POST") {
    const existing = await db.execute({ sql: "SELECT calendar_token FROM users WHERE id = ?", args: [userId] });
    const token = existing.rows[0]?.calendar_token || crypto.randomUUID().replace(/-/g, "");
    await db.execute({ sql: "UPDATE users SET calendar_token = ? WHERE id = ?", args: [token, userId] });
    return NextResponse.json({ token });
  }
  if (parts[1] === "token" && userId !== null && request.method === "DELETE") {
    await db.execute({ sql: "UPDATE users SET calendar_token = NULL WHERE id = ?", args: [userId] });
    return noContent();
  }
  return userId === null ? unauthorized() : error("Not found", 404);
}

async function handle(request: NextRequest, context: Context) {
  await ensureDb();
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return error("Request body is too large", 413);
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return error("Invalid request origin", 403);
  }
  const { path } = await context.params;
  if (path[0] === "health") return NextResponse.json({ ok: true });
  if (path[0] === "auth") return authRoutes(request, path);
  if (path[0] === "calendar" && path[1] === "feed") return calendarRoutes(request, path, null);
  const userId = await getUserId(request);
  if (!userId) return unauthorized();
  if (path[0] === "sessions") return sessionRoutes(request, path, userId);
  if (path[0] === "projects") return projectRoutes(request, path, userId);
  if (path[0] === "notes") return noteRoutes(request, path, userId);
  if (path[0] === "tasks") return taskRoutes(request, path, userId);
  if (path[0] === "noise-usage") return noiseUsageRoutes(request, path, userId);
  if (path[0] === "social") return socialRoutes(request, path, userId);
  if (path[0] === "reports") return reportRoutes(request, path, userId);
  if (path[0] === "calendar") return calendarRoutes(request, path, userId);
  return error("Not found", 404);
}

async function safely(request: NextRequest, context: Context) {
  try {
    const response = await handle(request, context);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (caught) {
    console.error(caught);
    return error("Internal server error", 500);
  }
}

export const GET = safely;
export const POST = safely;
export const PUT = safely;
export const PATCH = safely;
export const DELETE = safely;
