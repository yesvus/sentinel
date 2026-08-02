export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Monday-Sunday week, in the local/user-facing timezone. */
export function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

/** Key identifying a week: the date-key of its Monday. */
export function weekKey(date: Date) {
  return dayKey(startOfWeek(date));
}

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDayLabel(date: Date, now: Date = new Date()) {
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function formatWeekRangeLabel(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();
  const startLabel = weekStart.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  const endLabel = weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
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
