import { useCallback, useEffect, useMemo, useState } from "react";
import { notes, plannedSessions, projects, sessions, tasks, type Note, type PlannedSession, type Project, type StudySession, type Task } from "@/lib/api";
import { dayKey, startOfDay } from "@/lib/date";
import { mergeActiveSession } from "@/lib/session-list";

export type HomeDataLoadStatus = "idle" | "loading" | "loaded" | "error";

export function useHomeData(activeSession: StudySession | null = null, sessionRevision = 0, timeZone?: string) {
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [plannedSessionList, setPlannedSessionList] = useState<PlannedSession[]>([]);
  const [todaySessions, setTodaySessions] = useState<StudySession[]>([]);
  const [recentSessions, setRecentSessions] = useState<StudySession[]>([]);
  const [sidebarDataLoaded, setSidebarDataLoaded] = useState(false);
  const [viewingSession, setViewingSession] = useState<StudySession | null>(null);
  const [viewingSessionTasksResult, setViewingSessionTasksResult] = useState<{
    sessionId: number;
    retry: number;
    tasks: Task[];
    status: "loaded" | "error";
  } | null>(null);
  const [viewingSessionTasksRetry, setViewingSessionTasksRetry] = useState(0);

  const loadSidebars = useCallback(() => {
    const today = startOfDay(new Date(), timeZone);
    return Promise.all([
      sessions.list({ from: today.toISOString() }).then(setTodaySessions).catch(() => {}),
      sessions.page(null, 5)
        .then((page) => setRecentSessions(page.items.filter((session) => session.ended_at !== null).slice(0, 4)))
        .catch(() => {}),
      plannedSessions.list(dayKey(today, timeZone)).then(setPlannedSessionList).catch(() => {}),
    ]);
  }, [timeZone]);

  useEffect(() => {
    Promise.all([
      projects.list().then(setProjectList).catch(() => {}),
      tasks.list().then(setTaskList).catch(() => {}),
      notes.list().then(setNoteList).catch(() => {}),
      loadSidebars(),
    ]).finally(() => setSidebarDataLoaded(true));
  }, [loadSidebars]);

  useEffect(() => {
    if (sessionRevision === 0) return;
    void loadSidebars();
  }, [loadSidebars, sessionRevision]);

  useEffect(() => {
    if (!viewingSession) return;
    let cancelled = false;
    const sessionId = viewingSession.id;
    const retry = viewingSessionTasksRetry;
    sessions.tasks(viewingSession.id).then((result) => {
      if (!cancelled) {
        setViewingSessionTasksResult({ sessionId, retry, tasks: result, status: "loaded" });
      }
    }).catch(() => {
      if (!cancelled) setViewingSessionTasksResult({ sessionId, retry, tasks: [], status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [viewingSession, viewingSessionTasksRetry]);

  const currentViewingSessionTasksResult = viewingSession &&
    viewingSessionTasksResult?.sessionId === viewingSession.id &&
    viewingSessionTasksResult.retry === viewingSessionTasksRetry
    ? viewingSessionTasksResult
    : null;
  const viewingSessionTasks = currentViewingSessionTasksResult?.tasks ?? [];
  const viewingSessionTasksStatus: HomeDataLoadStatus = !viewingSession
    ? "idle"
    : currentViewingSessionTasksResult?.status ?? "loading";

  const mergedTodaySessions = useMemo(() => {
    const today = dayKey(new Date(), timeZone);
    return mergeActiveSession(
      todaySessions,
      activeSession,
      (session) => dayKey(new Date(session.started_at), timeZone) === today,
    );
  }, [activeSession, timeZone, todaySessions]);

  const addProject = useCallback((project: Project) => {
    setProjectList((list) => [...list.filter((item) => item.id !== project.id), project]
      .sort((a, b) => a.path.localeCompare(b.path)));
  }, []);

  return {
    projectList,
    taskList,
    setTaskList,
    noteList,
    plannedSessionList,
    todaySessions: mergedTodaySessions,
    recentSessions,
    sidebarDataLoaded,
    viewingSession,
    viewingSessionTasks,
    viewingSessionTasksStatus,
    setViewingSession,
    upsertPlannedSession: (plannedSession: PlannedSession) => setPlannedSessionList((items) =>
      [...items.filter((item) => item.id !== plannedSession.id), plannedSession]
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)),
    removePlannedSession: (id: number) => setPlannedSessionList((items) => items.filter((item) => item.id !== id)),
    retryViewingSessionTasks: () => setViewingSessionTasksRetry((retry) => retry + 1),
    addProject,
    loadSidebars,
  };
}
