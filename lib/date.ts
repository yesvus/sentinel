export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function detectedTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function timeZoneOffsetLabel(timeZone: string, date = new Date()) {
  const offsetMinutes = Math.round(timeZoneOffset(date, timeZone) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "−";
  const absoluteMinutes = Math.abs(offsetMinutes);
  return `UTC${sign}${pad(Math.floor(absoluteMinutes / 60))}:${pad(absoluteMinutes % 60)}`;
}

export function effectiveTimeZone(override: string | null | undefined, detected = detectedTimeZone()) {
  return override ?? detected;
}

function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function timeZoneOffset(date: Date, timeZone: string) {
  const parts = dateParts(date, timeZone);
  const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return represented - Math.floor(date.getTime() / 1000) * 1000;
}

function zonedDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
) {
  const wallTime = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsets = new Set([-36, 0, 36].map((hours) =>
    timeZoneOffset(new Date(wallTime + hours * 3_600_000), timeZone)));
  const candidates = Array.from(offsets, (offset) => new Date(wallTime - offset));
  const exact = candidates.filter((candidate) => {
    const parts = dateParts(candidate, timeZone);
    return parts.year === year && parts.month === month && parts.day === day &&
      parts.hour === hour && parts.minute === minute && parts.second === second;
  }).sort((a, b) => a.getTime() - b.getTime());
  if (exact[0]) return exact[0];

  // Some zones advance at midnight. In that gap, use the first real instant on the requested date.
  const firstOnDate = candidates.filter((candidate) => {
    const parts = dateParts(candidate, timeZone);
    return parts.year === year && parts.month === month && parts.day === day;
  }).sort((a, b) => a.getTime() - b.getTime());
  if (firstOnDate[0]) return firstOnDate[0];

  let result = wallTime - timeZoneOffset(new Date(wallTime), timeZone);
  result = wallTime - timeZoneOffset(new Date(result), timeZone);
  return new Date(result);
}

export function dayKey(date: Date, timeZone?: string) {
  if (timeZone) {
    const parts = dateParts(date, timeZone);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDateKeyDays(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Values for date/time inputs must use local fields, never UTC string slicing. */
export function dateInputValue(date: Date) {
  return dayKey(date);
}

export function timeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseLocalDateTime(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return new Date(Number.NaN);
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return new Date(Number.NaN);
  }
  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day ||
    parsed.getHours() !== hours || parsed.getMinutes() !== minutes
  ) {
    return new Date(Number.NaN);
  }
  return parsed;
}

export function combineLocalDateAndTime(base: Date | number, time: string) {
  return parseLocalDateTime(dateInputValue(new Date(base)), time);
}

/** Inverse of dayKey/weekKey: builds a local-midnight Date from a "YYYY-MM-DD" key. */
export function parseDateKey(key: string, timeZone?: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  if (timeZone) return zonedDateTime(year, month, day, 0, 0, 0, timeZone);
  return new Date(year, month - 1, day);
}

export function startOfDay(date: Date, timeZone?: string) {
  if (timeZone) return parseDateKey(dayKey(date, timeZone), timeZone);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number, timeZone?: string) {
  if (timeZone) return parseDateKey(addDateKeyDays(dayKey(date, timeZone), days), timeZone);
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Monday-Sunday week, in the local/user-facing timezone. */
export function startOfWeek(date: Date, timeZone?: string) {
  const d = startOfDay(date, timeZone);
  const day = timeZone
    ? new Date(`${dayKey(d, timeZone)}T00:00:00.000Z`).getUTCDay()
    : d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff, timeZone);
}

/** Days from weekStart (Monday) through today, capped at 7; used to average partial weeks. */
export function elapsedDaysInWeek(weekStart: Date, now: number, timeZone?: string) {
  const todayKey = dayKey(new Date(now), timeZone);
  const weekStartKey = dayKey(weekStart, timeZone);
  let elapsed = 0;
  for (let i = 0; i < 7; i++) {
    if (addDateKeyDays(weekStartKey, i) > todayKey) break;
    elapsed++;
  }
  return Math.max(1, elapsed);
}

/** Key identifying a week: the date-key of its Monday. */
export function weekKey(date: Date, timeZone?: string) {
  return dayKey(startOfWeek(date, timeZone), timeZone);
}

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function formatTime(dateStr: string, timeZone?: string) {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDayLabel(date: Date, now: Date = new Date(), timeZone?: string) {
  const dateKey = dayKey(date, timeZone);
  const todayKey = dayKey(now, timeZone);
  const diffDays = Math.round(
    (new Date(`${todayKey}T00:00:00.000Z`).getTime() - new Date(`${dateKey}T00:00:00.000Z`).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { timeZone, weekday: "long", month: "short", day: "numeric" });
}

export function formatWeekRangeLabel(weekStart: Date, timeZone?: string) {
  const weekEnd = addDays(weekStart, 6, timeZone);
  const startYear = timeZone ? dateParts(weekStart, timeZone).year : weekStart.getFullYear();
  const endYear = timeZone ? dateParts(weekEnd, timeZone).year : weekEnd.getFullYear();
  const sameYear = startYear === endYear;
  const startLabel = weekStart.toLocaleDateString(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  const endLabel = weekEnd.toLocaleDateString(undefined, { timeZone, month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

export function hourInTimeZone(date: Date, timeZone?: string) {
  return timeZone ? dateParts(date, timeZone).hour : date.getHours();
}

export function weekdayInTimeZone(date: Date, timeZone?: string) {
  return timeZone
    ? new Date(`${dayKey(date, timeZone)}T00:00:00.000Z`).getUTCDay()
    : date.getDay();
}

/**
 * Duration diff plus a percentage, or null when a percentage wouldn't be meaningful
 * (previous period had no tracked time but the current one does).
 */
export function periodComparison(current: number, previous: number): { diff: number; percent: number | null } {
  const diff = current - previous;
  if (previous === 0) {
    return { diff, percent: current === 0 ? 0 : null };
  }
  return { diff, percent: Math.round((diff / previous) * 100) };
}
