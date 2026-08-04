import bcrypt from "bcrypt";
import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_OPTIONS,
  authenticateRequest,
  createSession,
  revokeSession,
  revokeUserSessions,
  unauthorized,
} from "../auth";
import { apiTokenRoutes } from "./api-tokens";
import { db } from "../db";
import { clearRateLimit, rateLimited, rateLimitKey, recordRateLimitAttempt } from "../rate-limit";
import { body, clientAddress, error, noContent } from "./http";
import {
  FOCUS_AUDIO_TYPES,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_PLAN_CONTEXT_LENGTH,
  optionalTextError,
  validEmail,
} from "./validation";
import { isValidTimeZone } from "@/lib/date";

const AVATAR_TYPES = new Set(["cat", "dog", "bird", "fish", "rabbit", "rocket", "star", "ghost", "bot", "coffee", "gamepad", "sparkles"]);

export async function authRoutes(request: NextRequest, parts: string[]) {
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
      timezone: null,
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
      sql: "SELECT id, email, password_hash, name, avatar, share_session_descriptions, auto_start_noise, focus_audio_type, default_session_type, track_production_split, session_pause_timeout_minutes, plan_reminder_hour, plan_weekly_reminder_day, plan_weekly_reminder_hour, plan_context, timezone FROM users WHERE lower(email) = ?",
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
      timezone: user.timezone ?? null,
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

  const auth = await authenticateRequest(request);
  if (auth.rateLimited) return error("Too many API token requests. Try again later.", 429);
  const userId = auth.userId;
  if (!userId) return unauthorized();
  if (action === "tokens") return apiTokenRoutes(request, parts, userId);
  if (action === "me" && request.method === "GET") {
    const result = await db.execute({
      sql: "SELECT id, email, name, avatar, share_session_descriptions, auto_start_noise, focus_audio_type, default_session_type, track_production_split, session_pause_timeout_minutes, plan_reminder_hour, plan_weekly_reminder_day, plan_weekly_reminder_hour, plan_context, timezone FROM users WHERE id = ?",
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
      timezone: user.timezone ?? null,
    });
  }
  if (action === "me" && request.method === "PATCH") {
    const data = await body(request);
    const nameError = optionalTextError(data.name, "Name", MAX_NAME_LENGTH);
    if (nameError) return nameError;
    if (data.avatar !== undefined && data.avatar !== null && !AVATAR_TYPES.has(data.avatar as string)) return error("Invalid avatar");
    const planContextError = optionalTextError(data.planContext, "About you", MAX_PLAN_CONTEXT_LENGTH);
    if (planContextError) return planContextError;
    const existing = await db.execute({ sql: "SELECT name, avatar, plan_context FROM users WHERE id = ?", args: [userId] });
    const row = existing.rows[0];
    const name = data.name !== undefined ? data.name : row.name;
    const avatar = data.avatar !== undefined ? data.avatar : row.avatar;
    const planContext = data.planContext !== undefined
      ? (typeof data.planContext === "string" ? data.planContext.trim() || null : null)
      : row.plan_context;
    await db.execute({ sql: "UPDATE users SET name = ?, avatar = ?, plan_context = ? WHERE id = ?", args: [name as string | null, avatar as string | null, planContext, userId] });
    return NextResponse.json({ name, avatar, planContext });
  }
  if (action === "privacy" && request.method === "PATCH") {
    const data = await body(request);
    if (typeof data.shareSessionDescriptions !== "boolean") return error("shareSessionDescriptions must be a boolean");
    await db.execute({ sql: "UPDATE users SET share_session_descriptions = ? WHERE id = ?", args: [data.shareSessionDescriptions ? 1 : 0, userId] });
    return NextResponse.json({ shareSessionDescriptions: data.shareSessionDescriptions });
  }
  if (action === "audio-settings" && request.method === "PATCH") {
    const data = await body(request);
    if (data.autoStartNoise !== undefined && typeof data.autoStartNoise !== "boolean") return error("autoStartNoise must be a boolean");
    if (data.focusAudioType !== undefined && !FOCUS_AUDIO_TYPES.has(data.focusAudioType as string)) return error("Invalid focus audio type");
    if (data.autoStartNoise === undefined && data.focusAudioType === undefined) return error("At least one audio setting is required");
    await db.execute({
      sql: `UPDATE users SET auto_start_noise = COALESCE(?, auto_start_noise), focus_audio_type = COALESCE(?, focus_audio_type) WHERE id = ?`,
      args: [data.autoStartNoise === undefined ? null : data.autoStartNoise ? 1 : 0, data.focusAudioType as string | null ?? null, userId],
    });
    const result = await db.execute({ sql: "SELECT auto_start_noise, focus_audio_type FROM users WHERE id = ?", args: [userId] });
    return NextResponse.json({ autoStartNoise: Boolean(result.rows[0].auto_start_noise), focusAudioType: result.rows[0].focus_audio_type });
  }
  if (action === "session-settings" && request.method === "PATCH") {
    const data = await body(request);
    if (data.defaultSessionType !== undefined && data.defaultSessionType !== "learning" && data.defaultSessionType !== "producing") return error("defaultSessionType must be learning or producing");
    if (data.trackProductionSplit !== undefined && typeof data.trackProductionSplit !== "boolean") return error("trackProductionSplit must be a boolean");
    if (data.sessionPauseTimeoutMinutes !== undefined && (!Number.isInteger(data.sessionPauseTimeoutMinutes) || Number(data.sessionPauseTimeoutMinutes) < 5 || Number(data.sessionPauseTimeoutMinutes) > 180)) return error("sessionPauseTimeoutMinutes must be an integer from 5 to 180");
    if (data.planReminderHour !== undefined && (!Number.isInteger(data.planReminderHour) || Number(data.planReminderHour) < 0 || Number(data.planReminderHour) > 23)) return error("planReminderHour must be an integer from 0 to 23");
    if (data.planWeeklyReminderDay !== undefined && (!Number.isInteger(data.planWeeklyReminderDay) || Number(data.planWeeklyReminderDay) < 0 || Number(data.planWeeklyReminderDay) > 6)) return error("planWeeklyReminderDay must be an integer from 0 (Sunday) to 6 (Saturday)");
    if (data.planWeeklyReminderHour !== undefined && (!Number.isInteger(data.planWeeklyReminderHour) || Number(data.planWeeklyReminderHour) < 0 || Number(data.planWeeklyReminderHour) > 23)) return error("planWeeklyReminderHour must be an integer from 0 to 23");
    if (data.timezone !== undefined && data.timezone !== null && typeof data.timezone !== "string") return error("timezone must be a valid IANA time zone or null");
    if (typeof data.timezone === "string" && !isValidTimeZone(data.timezone)) return error("timezone must be a valid IANA time zone or null");
    if (data.defaultSessionType === undefined && data.trackProductionSplit === undefined && data.sessionPauseTimeoutMinutes === undefined && data.planReminderHour === undefined && data.planWeeklyReminderDay === undefined && data.planWeeklyReminderHour === undefined && data.timezone === undefined) return error("At least one session setting is required");
    await db.execute({
      sql: `UPDATE users SET default_session_type = COALESCE(?, default_session_type), track_production_split = COALESCE(?, track_production_split), session_pause_timeout_minutes = COALESCE(?, session_pause_timeout_minutes), plan_reminder_hour = COALESCE(?, plan_reminder_hour), plan_weekly_reminder_day = COALESCE(?, plan_weekly_reminder_day), plan_weekly_reminder_hour = COALESCE(?, plan_weekly_reminder_hour), timezone = CASE WHEN ? THEN ? ELSE timezone END WHERE id = ?`,
      args: [data.defaultSessionType as string | null ?? null, data.trackProductionSplit === undefined ? null : data.trackProductionSplit ? 1 : 0, data.sessionPauseTimeoutMinutes === undefined ? null : Number(data.sessionPauseTimeoutMinutes), data.planReminderHour === undefined ? null : Number(data.planReminderHour), data.planWeeklyReminderDay === undefined ? null : Number(data.planWeeklyReminderDay), data.planWeeklyReminderHour === undefined ? null : Number(data.planWeeklyReminderHour), data.timezone !== undefined ? 1 : 0, data.timezone as string | null ?? null, userId],
    });
    const result = await db.execute({ sql: "SELECT default_session_type, track_production_split, session_pause_timeout_minutes, plan_reminder_hour, plan_weekly_reminder_day, plan_weekly_reminder_hour, timezone FROM users WHERE id = ?", args: [userId] });
    return NextResponse.json({
      defaultSessionType: result.rows[0].default_session_type,
      trackProductionSplit: Boolean(result.rows[0].track_production_split),
      sessionPauseTimeoutMinutes: Number(result.rows[0].session_pause_timeout_minutes),
      planReminderHour: Number(result.rows[0].plan_reminder_hour),
      planWeeklyReminderDay: Number(result.rows[0].plan_weekly_reminder_day),
      planWeeklyReminderHour: Number(result.rows[0].plan_weekly_reminder_hour),
      timezone: result.rows[0].timezone ?? null,
    });
  }
  if (action === "change-password" && request.method === "POST") {
    const data = await body(request);
    if (typeof data.currentPassword !== "string" || typeof data.newPassword !== "string" || data.newPassword.length < 8 || data.newPassword.length > MAX_PASSWORD_LENGTH || data.currentPassword.length > MAX_PASSWORD_LENGTH) return error("Current password and a new password of 8 to 128 characters are required");
    const result = await db.execute({ sql: "SELECT password_hash FROM users WHERE id = ?", args: [userId] });
    if (!result.rows[0] || !(await bcrypt.compare(data.currentPassword, result.rows[0].password_hash as string))) return error("Current password is incorrect", 401);
    await db.execute({ sql: "UPDATE users SET password_hash = ? WHERE id = ?", args: [await bcrypt.hash(data.newPassword, 10), userId] });
    await revokeUserSessions(userId);
    const response = noContent();
    response.cookies.set("token", await createSession(userId), COOKIE_OPTIONS);
    return response;
  }
  return error("Not found", 404);
}
