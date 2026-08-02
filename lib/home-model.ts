import type { Note, Project, StudySession, Task } from "@/lib/api";
import { sessionDurationSeconds } from "@/lib/session-stats";

export type HomeTaskGroup = { project: Project | null; tasks: Task[] };

type HomeModelInput = {
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  todaySessions: StudySession[];
  todayKey: string;
  projectId: number | null;
  sessionTaskIds: number[];
  now: number;
};

export function buildHomeModel({
  projects,
  tasks,
  notes,
  todaySessions,
  todayKey,
  projectId,
  sessionTaskIds,
  now,
}: HomeModelInput) {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const sessionTaskIdSet = new Set(sessionTaskIds);
  const todayTasks = tasks.filter((task) => task.period_start === todayKey);
  const groups = new Map<string, HomeTaskGroup>();

  for (const task of todayTasks) {
    const project = task.project_id === null ? null : projectsById.get(task.project_id) ?? null;
    const key = project ? String(project.id) : "none";
    const group = groups.get(key) ?? { project, tasks: [] };
    group.tasks.push(task);
    groups.set(key, group);
  }

  const todayTaskGroups = Array.from(groups.values()).sort((a, b) => {
    if (!a.project) return 1;
    if (!b.project) return -1;
    return a.project.path.localeCompare(b.project.path);
  });

  return {
    activeProject: projectId === null ? null : projectsById.get(projectId) ?? null,
    todayNote: notes.find((note) => note.scope === "day" && note.date_key === todayKey),
    todayTasks,
    todayTaskGroups,
    runningProjectTasks: tasks.filter((task) => sessionTaskIdSet.has(task.id)),
    todaySuggestions: tasks.filter(
      (task) =>
        task.period_start === todayKey &&
        task.project_id === projectId &&
        task.completed_at === null &&
        !sessionTaskIdSet.has(task.id),
    ),
    backlogSuggestions: tasks.filter(
      (task) => task.period_start === null && task.completed_at === null && !sessionTaskIdSet.has(task.id),
    ),
    todayTrackedSeconds: todaySessions.reduce(
      (total, session) => total + sessionDurationSeconds(session, now),
      0,
    ),
  };
}
