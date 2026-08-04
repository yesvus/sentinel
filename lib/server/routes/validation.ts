import { NextResponse } from "next/server";
import { error } from "./http";

export const FOCUS_AUDIO_TYPES = new Set(["white", "pink", "brown", "speech-blocker", "binaural-40hz"]);
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 4_000;
export const MAX_PROJECT_RESOURCES_LENGTH = 10_000;
export const MAX_NOTE_LENGTH = 10_000;
export const MAX_TASK_TITLE_LENGTH = 200;
export const MAX_PLAN_CONTEXT_LENGTH = 2_000;
export const MAX_PLANNED_SESSION_SECONDS = 24 * 60 * 60;
export const MAX_API_TOKEN_NAME_LENGTH = 100;

export function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function optionalTextError(value: unknown, label: string, maximum: number): NextResponse | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return error(`${label} must be text`);
  return value.length > maximum ? error(`${label} must be at most ${maximum} characters`) : null;
}

export function productionPercentageError(value: unknown) {
  const valid = value === null ||
    (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100 && value % 10 === 0);
  return value !== undefined && !valid
    ? error("productionPercentage must be null or an integer from 0 to 100 in increments of 10")
    : null;
}

export function periodStartError(value: unknown) {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? null
    : error("periodStart must be a YYYY-MM-DD date or null");
}

export function plannedSessionDurationError(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 60 && value <= MAX_PLANNED_SESSION_SECONDS
    ? null
    : error("estimatedSeconds must be an integer between 60 and 86400");
}
