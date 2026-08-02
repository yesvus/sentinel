import type { Project, StudySession, Task } from "@/lib/api";
import { canPlaceProject, orderProjectsAsTree, projectBranchIds } from "@/lib/project-tree";
import { sessionDurationSeconds } from "@/lib/session-stats";

export function buildProjectDetailModel(
  projectId: number,
  projects: Project[],
  tasks: Task[],
  sessions: StudySession[],
  now: number,
) {
  const project = projects.find((item) => item.id === projectId) ?? null;
  const byId = new Map(projects.map((item) => [item.id, item]));
  const ancestors: Project[] = [];
  let cursor = project?.parentId === null ? undefined : byId.get(project?.parentId ?? -1);
  while (cursor) {
    ancestors.unshift(cursor);
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
  }

  const activeProjects = projects.filter((item) => !item.archived);
  const parentCandidates = project
    ? orderProjectsAsTree(activeProjects).filter(({ project: candidate }) => canPlaceProject(activeProjects, project, candidate.id))
    : [];
  const backlogTasks = tasks.filter((task) => task.project_id === projectId && task.period_start === null);
  const descendantIds = project ? projectBranchIds(projects, project.id) : new Set<number>();
  descendantIds.delete(projectId);
  const descendants = orderProjectsAsTree(projects.filter((item) => descendantIds.has(item.id)));
  const projectSessions = sessions.filter((session) => session.project_id === projectId);

  return {
    project,
    byId,
    ancestors,
    parentCandidates,
    backlogTasks,
    descendants,
    projectSessions,
    trackedSeconds: projectSessions.reduce((total, session) => total + sessionDurationSeconds(session, now), 0),
    completedTaskCount: tasks.filter((task) => task.project_id === projectId && task.completed_at !== null).length,
    lastSession: [...projectSessions].sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null,
  };
}
