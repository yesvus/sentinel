import type { Note, PlannedSession, Project, StudySession, Task } from "@/lib/api";
import { sessionDurationSeconds } from "@/lib/session-stats";

export type HomeTaskGroup = { project: Project | null; plannedSessions?: PlannedSession[]; tasks: Task[] };

type HomeModelInput = {
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  plannedSessions?: PlannedSession[];
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
  plannedSessions = [],
  todaySessions,
  todayKey,
  projectId,
  sessionTaskIds,
  now,
}: HomeModelInput) {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const sessionTaskIdSet = new Set(sessionTaskIds);
  const todayPlannedSessions = plannedSessions.filter((plan) => plan.date_key === todayKey);
  const plannedTaskIds = new Set(todayPlannedSessions.flatMap((plan) => plan.tasks.map((task) => task.id)));
  const todayTasks = tasks.filter((task) => task.period_start === todayKey && task.completed_at === null && !plannedTaskIds.has(task.id));
  const groups = new Map<string, HomeTaskGroup>();

  for (const task of todayTasks) {
    const project = task.project_id === null ? null : projectsById.get(task.project_id) ?? null;
    const key = project ? String(project.id) : "none";
    const group = groups.get(key) ?? { project, plannedSessions: [], tasks: [] };
    group.tasks.push(task);
    groups.set(key, group);
  }

  for (const plannedSession of todayPlannedSessions) {
    const project = projectsById.get(plannedSession.project_id) ?? null;
    const key = project ? String(project.id) : `planned-${plannedSession.project_id}`;
    const group = groups.get(key) ?? { project, plannedSessions: [], tasks: [] };
    (group.plannedSessions ??= []).push(plannedSession);
    groups.set(key, group);
  }

  const todayTaskGroups = Array.from(groups.values()).sort((a, b) => {
    if (!a.project) return 1;
    if (!b.project) return -1;
    return a.project.sortOrder - b.project.sortOrder || a.project.path.localeCompare(b.project.path);
  });

  return {
    activeProject: projectId === null ? null : projectsById.get(projectId) ?? null,
    todayNote: notes.find((note) => note.scope === "day" && note.date_key === todayKey),
    todayTasks,
    todayPlannedSessions,
    todayTaskGroups,
    runningProjectTasks: tasks.filter((task) => sessionTaskIdSet.has(task.id)),
    todaySuggestions: tasks.filter(
      (task) =>
        task.period_start === todayKey &&
        task.project_id === projectId &&
        task.completed_at === null &&
        !sessionTaskIdSet.has(task.id) &&
        !plannedTaskIds.has(task.id),
    ),
    backlogSuggestions: tasks.filter(
      (task) => task.period_start === null && task.completed_at === null && !sessionTaskIdSet.has(task.id),
    ),
    activeBacklogSuggestions: tasks.filter(
      (task) =>
        task.period_start === null &&
        task.project_id === projectId &&
        task.completed_at === null &&
        !sessionTaskIdSet.has(task.id),
    ),
    todayTrackedSeconds: todaySessions.reduce(
      (total, session) => total + sessionDurationSeconds(session, now),
      0,
    ),
  };
}
