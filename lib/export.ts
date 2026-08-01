import { StudySession, Note, Project, Task } from "./api";

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
function sessionCsvRow(session: StudySession, now: number): CsvRow {
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
      start.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }),
      start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
      end ? end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : "",
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
  now: number
) {
  const rows = [...sessionList.map((s) => sessionCsvRow(s, now)), ...noteList.map(noteCsvRow)].sort((a, b) =>
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
  now: number
) {
  downloadCsv(filename, sessionsToCsv(sessionList, noteList, projectList, now));
}

function taskLines(taskList: Task[]) {
  if (!taskList.length) return "_None._";
  return taskList
    .map((task) => {
      const box = task.completed_at ? "[x]" : "[ ]";
      const details = task.description ? `\n  ${task.description.replace(/\n/g, "\n  ")}` : "";
      return `- ${box} ${task.title}${details}`;
    })
    .join("\n");
}

function sessionLines(sessionList: StudySession[], now: number) {
  if (!sessionList.length) return "_No sessions logged._";
  return sessionList
    .slice()
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
    .map((session) => {
      const isActive = session.ended_at === null;
      const start = new Date(session.started_at);
      const seconds = isActive
        ? Math.max(0, Math.floor((now - start.getTime()) / 1000))
        : (session.duration_seconds ?? 0);
      const startLabel = start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
      const endLabel = isActive
        ? "now"
        : new Date(session.ended_at!).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
      const minutes = Math.round(seconds / 60);
      const project = session.project_path ?? session.project_name ?? "No project";
      const description = session.description ? `: ${session.description}` : "";
      return `- ${startLabel}–${endLabel} (${minutes}m) · ${project}${description}`;
    })
    .join("\n");
}

/** Builds a markdown prompt to paste into an AI chat for reviewing a single day. `now` covers a still-running session. */
export function buildAiPrompt({
  dayLabel,
  sessionList,
  dayTasks,
  weekTasks,
  dayNote,
  weekNote,
  now,
}: {
  dayLabel: string;
  sessionList: StudySession[];
  dayTasks: Task[];
  weekTasks: Task[];
  dayNote: Note | undefined;
  weekNote: Note | undefined;
  now: number;
}) {
  return `# Day review — ${dayLabel}

## Sessions
${sessionLines(sessionList, now)}

## Today's tasks
${taskLines(dayTasks)}

## This week's tasks
${taskLines(weekTasks)}

## Today's note
${dayNote?.content?.trim() || "_None._"}

## This week's note
${weekNote?.content?.trim() || "_None._"}

---
Based on the above, grade how the day went, call out anything that stands out (good or bad), and suggest 1-3 concrete improvements for tomorrow.`;
}
