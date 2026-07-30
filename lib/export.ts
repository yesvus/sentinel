import { StudySession, Note, Project } from "./api";

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
  const producingSeconds = session.production_percentage == null
    ? null
    : Math.round(seconds * session.production_percentage / 100);

  return {
    sortKey: session.started_at,
    fields: [
      "Session",
      start.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }),
      start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
      end ? end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : "",
      Math.round(seconds / 60),
      isActive ? "In progress" : "Completed",
      session.project_name ?? "",
      session.description ?? "",
      session.started_at,
      session.ended_at ?? "",
      session.production_percentage ?? "",
      producingSeconds === null ? "" : Math.round((seconds - producingSeconds) / 60),
      producingSeconds === null ? "" : Math.round(producingSeconds / 60),
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
