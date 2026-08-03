import { StudySession, Note, Project, Task } from "./api";
import { addDays, dayKey, elapsedDaysInWeek, formatDuration, formatTime, formatWeekRangeLabel } from "./date";
import { splitSessionDuration, projectTotals, NO_PROJECT_LABEL, WeekStats, PartialWeekStats } from "./session-stats";

const CSV_HEADER = [
  "Type",
  "Date",
  "Start Time",
  "End Time",
  "Duration (minutes)",
  "Status",
  "Project",
  "Description",
  "Started At (ISO)",
  "Ended At (ISO)",
  "Producing (%)",
  "Learning (minutes)",
  "Producing (minutes)",
];

function escapeCsvField(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(fields: (string | number)[]) {
  return fields.map((field) => escapeCsvField(String(field))).join(",");
}

type CsvRow = { sortKey: string; fields: (string | number)[] };

/** `now` is used to compute the live duration of a still-running session. */
function sessionCsvRow(session: StudySession, now: number, timeZone?: string): CsvRow {
  const start = new Date(session.started_at);
  const isActive = session.ended_at === null;
  const end = isActive ? null : new Date(session.ended_at!);
  const seconds = isActive
    ? Math.max(0, Math.floor((now - start.getTime()) / 1000))
    : (session.duration_seconds ?? 0);
  const productionPercentage = session.production_percentage ?? 0;
  const producingSeconds = Math.round(seconds * productionPercentage / 100);

  return {
    sortKey: session.started_at,
    fields: [
      "Session",
      start.toLocaleDateString(undefined, { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }),
      start.toLocaleTimeString(undefined, { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }),
      end ? end.toLocaleTimeString(undefined, { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }) : "",
      Math.round(seconds / 60),
      isActive ? "In progress" : "Completed",
      session.project_path ?? session.project_name ?? "",
      session.description ?? "",
      session.started_at,
      session.ended_at ?? "",
      productionPercentage,
      Math.round((seconds - producingSeconds) / 60),
      Math.round(producingSeconds / 60),
    ],
  };
}

function noteCsvRow(note: Note): CsvRow {
  return {
    sortKey: `${note.date_key}T00:00:00.000Z`,
    fields: [
      note.scope === "day" ? "Day note" : "Week note",
      note.date_key,
      "",
      "",
      "",
      "",
      "",
      note.content,
      "",
      "",
      "",
      "",
      "",
    ],
  };
}

/** `now` is used to compute the live duration of any still-running session. */
export function sessionsToCsv(
  sessionList: StudySession[],
  noteList: Note[],
  projectList: Project[],
  now: number,
  timeZone?: string,
) {
  const rows = [...sessionList.map((s) => sessionCsvRow(s, now, timeZone)), ...noteList.map(noteCsvRow)].sort((a, b) =>
    a.sortKey.localeCompare(b.sortKey)
  );
  const usedProjectIds = new Set(
    sessionList.flatMap((session) => (session.project_id === null ? [] : [session.project_id]))
  );
  const projectRows = projectList
    .filter((project) => usedProjectIds.has(project.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((project) =>
      toCsvRow(["Project", "", "", "", "", "", project.name, project.description ?? "", "", "", "", "", ""])
    );

  return [toCsvRow(CSV_HEADER), ...rows.map((r) => toCsvRow(r.fields)), ...projectRows].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportSessions(
  filename: string,
  sessionList: StudySession[],
  noteList: Note[],
  projectList: Project[],
  now: number,
  timeZone?: string,
) {
  downloadCsv(filename, sessionsToCsv(sessionList, noteList, projectList, now, timeZone));
}

// --- Shared formatting helpers for the AI review prompts ---

function aboutMeSection(userContext: string | null) {
  return userContext?.trim() || "(none)";
}

function taskSection(taskList: Task[], projectList: Project[]) {
  if (!taskList.length) return "(none)";
  return taskList
    .map((task, i) => {
      const status = task.completed_at ? "DONE" : "NOT DONE";
      const project = projectList.find((p) => p.id === task.project_id);
      const projectLabel = project ? ` (${project.path})` : "";
      const description = task.description ? ` · ${task.description}` : "";
      return `[T${i + 1}] ${status} — ${task.title}${projectLabel}${description}`;
    })
    .join("\n");
}

function freeformSection(text: string | null | undefined) {
  return text?.trim() || "(none)";
}

function sessionSection(sessionList: StudySession[], now: number, timeZone?: string) {
  if (!sessionList.length) return "(none)";
  return sessionList
    .slice()
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
    .map((session, i) => {
      const isActive = session.ended_at === null;
      const split = splitSessionDuration(session, now);
      const startLabel = formatTime(session.started_at, timeZone);
      const endLabel = isActive ? "now" : formatTime(session.ended_at!, timeZone);
      const project = session.project_path ?? session.project_name ?? "no project";
      const splitLabel = session.production_percentage == null
        ? "split not tracked"
        : `Learning ${100 - session.production_percentage}% / Producing ${session.production_percentage}%`;
      const description = session.description ? ` · "${session.description}"` : "";
      return `[S${i + 1}] ${startLabel}–${endLabel} · ${formatDuration(split.total)} · project: ${project} · ${splitLabel}${description}`;
    })
    .join("\n");
}

function dayTotalsSection(sessionList: StudySession[], now: number) {
  if (!sessionList.length) return "(none)";
  let trackedSeconds = 0;
  let learningSeconds = 0;
  let longest = 0;
  for (const session of sessionList) {
    const split = splitSessionDuration(session, now);
    trackedSeconds += split.total;
    learningSeconds += split.learning;
    longest = Math.max(longest, split.total);
  }
  const learningPercent = trackedSeconds ? Math.round((learningSeconds / trackedSeconds) * 100) : 0;
  const top = projectTotals(sessionList, now).filter((project) => project.name !== NO_PROJECT_LABEL)[0];
  const topLabel = top ? ` · top project ${top.name} (${formatDuration(top.seconds)})` : "";
  return `tracked ${formatDuration(trackedSeconds)} across ${sessionList.length} session${sessionList.length === 1 ? "" : "s"} · Learning ${learningPercent}% / Producing ${100 - learningPercent}%${topLabel} · longest unbroken session ${formatDuration(longest)}`;
}

function weekSoFarSection(stats: PartialWeekStats) {
  if (!stats.trackedSeconds) return "(none)";
  return `${stats.activeDays} active day${stats.activeDays === 1 ? "" : "s"}, ${formatDuration(stats.trackedSeconds)} tracked, Learning ${stats.learningPercent}% / Producing ${100 - stats.learningPercent}%`;
}

const DAILY_INSTRUCTIONS = `Review today against what I planned, not against an ideal day.

STEP 1 — Work through this silently, do not print it.
Establish: which sessions map to which planned tasks; which sessions map to no task at all;
which tasks received no time; the shape of the day (block lengths, switches, gaps I mentioned);
and every place where my note disagrees with what the sessions show.

STEP 2 — Write the review in exactly this format.

HEADLINE
One sentence, 25 words max. No praise adjectives.

SCORECARD
Three lines. On each, write the justification first and the score last. Ground the justification
in a specific session or task, naming it by its project, task title, or a short quote — never by
its bracketed ID.
- Goal follow-through — {justification} — X/5
- Focus structure — {justification} — X/5
- Learning/Producing fit — {justification} — X/5

Apply these anchors identically every day:
  1 = the day's work was unrelated to anything I planned, or the structure worked against it
  2 = partial, with significant drift
  3 = roughly met the stated goals. This is a normal day. Most days should be 3.
  4 = met the stated goals and the day's structure supported them. Requires specific evidence.
  5 = rare. Requires clear evidence, e.g. every planned task advanced AND focus blocks were
      long and uninterrupted.
Do not average these into an overall grade.

STOOD OUT
2–4 bullets. At least one must be something that went wrong, was avoided, or is a risk.
Each bullet names the specific session or task it's about — by project, task title, or a short
quote, never by its bracketed ID. Each bullet must be about that specific item, not a general
point that happens to be illustrated by it.

DO NEXT
1–3 numbered suggestions for tomorrow. Each must name a specific task or project from the data
above and say when. Two sentences maximum each.

ONE QUESTION
Exactly one question, about something the data cannot tell you and that would change your
assessment.

RULES
- If a claim cannot be tied to a specific session or task, delete the claim.
- IDs like [S1] or [T1] are for you to track which item is which — never print a bracketed ID in
  your response. Always refer to sessions and tasks by their project, task title, or a short quote.
- If there is not enough data to score a dimension, write "not enough data" instead of a score.
- Where my note and my sessions disagree, say so explicitly.
- Comment on the work and the schedule. Do not comment on my character, my worth, or my mental
  state.
- If my note mentions illness, a crisis, or a major life event, treat it as context, lower your
  expectations for the day accordingly, and say that you are doing so.
- Do not compare me to external benchmarks, averages, or what is "typical." You have no data on
  those.
- Do not praise me for tracking my time or for writing a reflection.
- Do not open with encouragement. Banned words and phrases: "Great", "Impressive", "You're
  crushing it", "Overall, a solid day".
- No generic productivity advice: nothing about sleep, hydration, Pomodoro, or time-blocking
  unless the data in this prompt directly shows the problem.
- Quote at most 8 words from any session description.
- A review that only says positive things is a failed review.
- Under 300 words total. If you are over, cut the weakest point entirely rather than trimming
  every point.
- Do not restate my data back to me. Start with the headline.

This structured format, the word limit, and the banned words apply only to this first reply. If I
respond afterward — with follow-up questions, more context, a correction, or something entirely
off-topic — drop the format and respond naturally, like a normal conversation.`;

/** Builds the daily AI-review prompt (paste into an AI chat). `date` is the day being reviewed — "today" from Calendar, or any past day from History. `now` covers a still-running session. */
export function buildAiPrompt({
  userContext,
  date,
  sessionList,
  dayTasks,
  projectList,
  weekGoalsText,
  weekSoFar,
  dayNote,
  now,
  timeZone,
}: {
  userContext: string | null;
  date: Date;
  sessionList: StudySession[];
  dayTasks: Task[];
  projectList: Project[];
  weekGoalsText: string | null | undefined;
  weekSoFar: PartialWeekStats;
  dayNote: Note | undefined;
  now: number;
  timeZone?: string;
}) {
  const dateLabel = `${date.toLocaleDateString(undefined, { timeZone, weekday: "long" })}, ${dayKey(date, timeZone)}`;
  return `You are reviewing one day of my tracked work. The data comes first, the instructions come last.
Read everything before you respond.

<how_to_read_this_data>
- Sessions are timestamped blocks I logged. Each has a duration, an optional project, a
  description I wrote, and a Learning/Producing split I assigned myself. Learning = building
  capability for later. Producing = delivering something usable now. The split is my subjective
  judgment at the time, not a measurement.
- Untracked time is not necessarily wasted time. I may have been working without tracking, or
  not working at all. Do not infer anything from gaps unless I mention them.
- Tasks are things I planned in advance for today, optionally tied to a project.
- "This week's goals" and notes are freeform text I wrote myself — goals, a reflection, or both.
  They are my self-assessment, not a measurement, and may be wrong, biased, or out of date.
- Bracketed IDs (S1, T1) are only so you can track which specific item you mean internally. They
  are not names — never write "[S1]" or "[T1]" in your response. When you refer to something,
  use its project, its task title, or a short quote from its description instead.
- "(none)" means nothing was recorded, not that data is missing.
</how_to_read_this_data>

<about_me>
${aboutMeSection(userContext)}
</about_me>

<date>${dateLabel}</date>

<sessions_today>
${sessionSection(sessionList, now, timeZone)}
</sessions_today>

<day_totals>
${dayTotalsSection(sessionList, now)}
</day_totals>

<tasks_scoped_to_today>
${taskSection(dayTasks, projectList)}
</tasks_scoped_to_today>

<this_week_goals>
${freeformSection(weekGoalsText)}
</this_week_goals>

<week_so_far>
${weekSoFarSection(weekSoFar)}
</week_so_far>

<note_today>
${dayNote?.content?.trim() || "(none)"}
</note_today>

<instructions>
${DAILY_INSTRUCTIONS}
</instructions>`;
}

// --- Weekly review prompt ---

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function perDayBreakdown(dailySeconds: number[]) {
  return dailySeconds.map((seconds, i) => `${WEEKDAY_SHORT[i]} ${seconds ? formatDuration(seconds) : "0"}`).join(", ");
}

function averageWeekStats(weeks: WeekStats[]) {
  const trackedSeconds = weeks.reduce((sum, w) => sum + w.trackedSeconds, 0) / weeks.length;
  const activeDays = weeks.reduce((sum, w) => sum + w.activeDays, 0) / weeks.length;
  const learningPercent = weeks.reduce((sum, w) => sum + w.learningPercent, 0) / weeks.length;
  return { trackedSeconds, activeDays, learningPercent };
}

function signedDuration(seconds: number) {
  const rounded = Math.round(seconds);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  return `${sign}${formatDuration(Math.abs(rounded))}`;
}

function signedNumber(value: number, unit = "", decimals = 1) {
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "" : "±";
  return `${sign}${rounded}${unit}`;
}

function backgroundPreviousWeeksSection(previousWeeks: WeekStats[], timeZone?: string) {
  if (!previousWeeks.length) return "(none — not enough history yet)";
  const table = previousWeeks
    .map((week) => {
      const label = formatWeekRangeLabel(week.weekStart, timeZone);
      return `${label} | ${formatDuration(week.trackedSeconds)} | ${week.activeDays} | ${week.learningPercent} | ${week.topProject ?? "none"}`;
    })
    .join("\n");
  return `week | tracked | active days | learning% | top project\n${table}`;
}

function comparisonSection(currentWeek: WeekStats, previousWeeks: WeekStats[]) {
  if (!previousWeeks.length) return "(none — not enough history yet)";
  const avg = averageWeekStats(previousWeeks);
  return `Precomputed comparison of the current week against the previous ${previousWeeks.length}-week average:
  tracked time  ${formatDuration(currentWeek.trackedSeconds)} vs avg ${formatDuration(Math.round(avg.trackedSeconds))}  → ${signedDuration(currentWeek.trackedSeconds - avg.trackedSeconds)}
  active days   ${currentWeek.activeDays} vs avg ${avg.activeDays.toFixed(1)} → ${signedNumber(currentWeek.activeDays - avg.activeDays)}
  learning %    ${currentWeek.learningPercent} vs avg ${avg.learningPercent.toFixed(1)} → ${signedNumber(currentWeek.learningPercent - avg.learningPercent, "pp")}`;
}

const WEEKLY_INSTRUCTIONS = `Review the current week against what I planned and against my long-term goals — not against an
ideal week.

STEP 1 — Work through this silently, do not print it.
Establish: which planned tasks were completed and which received no time at all; how the week's
time distributed across days and whether it clustered; which long-term goals received real time
and which received none; and every place where my note disagrees with the stats.

STEP 2 — Write the review in exactly this format.

HEADLINE
One sentence, 25 words max. No praise adjectives.

SCORECARD
Four lines. Justification first, score last. Cite a specific stat or a quoted phrase from the
notes/goals text in each justification.
- Goal follow-through — {justification} — X/5
- Consistency — {justification} — X/5
- Learning/Producing fit for my goals — {justification} — X/5
- Long-term goal progress — {justification} — X/5

Apply these anchors identically every week:
  1 = the week's work was unrelated to anything I planned
  2 = partial, with significant drift
  3 = roughly met the stated goals. This is a normal week. Most weeks should be 3.
  4 = met the stated goals, and the way the week was structured supported them. Requires specific evidence.
  5 = rare. Requires clear evidence, e.g. every planned task completed AND measurable movement
      on a long-term goal.
Do not average these into an overall grade.

TREND
2 sentences max, using the precomputed comparison above. Do not describe a change as a trend
unless it holds across at least 3 of the last 4 weeks or the delta is large enough that noise
cannot explain it. Do not recompute the numbers — use the ones given.

STOOD OUT
2–4 bullets. At least one must be something that went wrong, was avoided, or is a risk.
Each bullet cites a specific stat or a quoted phrase from the notes/goals text. Each bullet must
be about that specific detail — not a general point that happens to be illustrated by it.

DO NEXT
1–3 numbered suggestions for next week. Each must name a specific task, project, or long-term
goal from the data above, and say which day or how much time. Two sentences maximum each.
At least one suggestion must connect to a long-term goal.

THE STRONGEST CRITICISM
One short paragraph. Name the most plausible criticism a demanding manager would make of this
week, even if you do not fully agree with it.

ONE QUESTION
Exactly one question, about something the data cannot tell you and that would change your
assessment.

RULES
- If a claim cannot be tied to a specific statistic or a quoted phrase from the notes/goals text,
  delete the claim.
- If there is not enough data to score a dimension, write "not enough data" instead of a score.
- Where my note and my stats disagree, say so explicitly.
- Comment on the work and the schedule. Do not comment on my character, my worth, or my mental
  state.
- If my note mentions illness, a crisis, or a major life event, treat it as context, lower your
  expectations for the week accordingly, and say that you are doing so.
- Do not compare me to external benchmarks, averages, or what is "typical." Compare me only to
  my own previous weeks.
- Do not praise me for tracking my time or for writing a reflection.
- Do not open with encouragement. Banned words and phrases: "Great", "Impressive", "You're
  crushing it", "Overall, a solid week".
- No generic productivity advice unless the data in this prompt directly shows the problem.
- A review that only says positive things is a failed review.
- Under 450 words total. If you are over, cut the weakest point entirely rather than trimming
  every point.
- Do not restate my data back to me. Start with the headline.

This structured format, the word limit, and the banned words apply only to this first reply. If I
respond afterward — with follow-up questions, more context, a correction, or something entirely
off-topic — drop the format and respond naturally, like a normal conversation.`;

/** Builds the weekly AI-review prompt. `previousWeeks` should be the trailing (not necessarily 4) completed weeks, oldest first. */
export function buildWeeklyAiPrompt({
  userContext,
  longTermGoalsText,
  previousWeeks,
  currentWeek,
  weekNote,
  timeZone,
  now = Date.now(),
}: {
  userContext: string | null;
  longTermGoalsText: string | null | undefined;
  previousWeeks: WeekStats[];
  currentWeek: WeekStats;
  weekNote: Note | undefined;
  timeZone?: string;
  now?: number;
}) {
  const weekEnd = addDays(currentWeek.weekStart, 6, timeZone);
  const daysInWeek = elapsedDaysInWeek(currentWeek.weekStart, now, timeZone);
  return `You are reviewing one week of my tracked work. The data comes first, the instructions come last.
Read everything before you respond.

<how_to_read_this_data>
- Sessions are timestamped blocks I logged, each with a Learning/Producing split I assigned
  myself. Learning = building capability for later. Producing = delivering something usable now.
  The split is my subjective judgment, not a measurement.
- Untracked time is not necessarily wasted time. Do not infer anything from gaps unless I
  mention them.
- Long-term goals and this week's note are freeform text I wrote myself, not structured data.
  They may be wrong, biased, or out of date.
- "(none)" means nothing was recorded, not that data is missing.
</how_to_read_this_data>

<about_me>
${aboutMeSection(userContext)}
</about_me>

<long_term_goals>
${freeformSection(longTermGoalsText)}
</long_term_goals>

<background_previous_weeks>
Background only. The subject of this review is the current week below. Use these weeks solely to
tell whether something is unusual. Do not review them.

${backgroundPreviousWeeksSection(previousWeeks, timeZone)}

${comparisonSection(currentWeek, previousWeeks)}
</background_previous_weeks>

<current_week>
<dates>${dayKey(currentWeek.weekStart, timeZone)} to ${dayKey(weekEnd, timeZone)}</dates>

<stats>
tracked ${formatDuration(currentWeek.trackedSeconds)} · active days ${currentWeek.activeDays} of ${daysInWeek} · Learning ${currentWeek.learningPercent}% / Producing ${100 - currentWeek.learningPercent}% ·
top project ${currentWeek.topProject ? `${currentWeek.topProject} (${formatDuration(currentWeek.topProjectSeconds)})` : "none"} · per-day tracked: ${perDayBreakdown(currentWeek.dailySeconds)}
</stats>

<note_this_week>
${weekNote?.content?.trim() || "(none)"}
</note_this_week>
</current_week>

<instructions>
${WEEKLY_INSTRUCTIONS}
</instructions>`;
}
