import { useCallback, useEffect, useState } from "react";
import { notes, projects, sessions, tasks, type Note, type Project, type StudySession, type Task } from "@/lib/api";

export function useHomeData() {
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [todaySessions, setTodaySessions] = useState<StudySession[]>([]);
  const [recentSessions, setRecentSessions] = useState<StudySession[]>([]);
  const [sidebarDataLoaded, setSidebarDataLoaded] = useState(false);
  const [viewingSession, setViewingSession] = useState<StudySession | null>(null);
  const [viewingSessionTasks, setViewingSessionTasks] = useState<Task[]>([]);

  const loadSidebars = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Promise.all([
      sessions.list({ from: today.toISOString() }).then(setTodaySessions).catch(() => {}),
      sessions.page(null, 5)
        .then((page) => setRecentSessions(page.items.filter((session) => session.ended_at !== null).slice(0, 4)))
        .catch(() => {}),
    ]);
  }, []);

  useEffect(() => {
    Promise.all([
      projects.list().then(setProjectList).catch(() => {}),
      tasks.list().then(setTaskList).catch(() => {}),
      notes.list().then(setNoteList).catch(() => {}),
      loadSidebars(),
    ]).finally(() => setSidebarDataLoaded(true));
  }, [loadSidebars]);

  useEffect(() => {
    if (!viewingSession) return;
    let cancelled = false;
    sessions.tasks(viewingSession.id).then((result) => {
      if (!cancelled) setViewingSessionTasks(result);
    }).catch(() => {});
    return () => {
      cancelled = true;
      setViewingSessionTasks([]);
    };
  }, [viewingSession]);

  return {
    projectList,
    taskList,
    setTaskList,
    noteList,
    todaySessions,
    recentSessions,
    sidebarDataLoaded,
    viewingSession,
    viewingSessionTasks,
    setViewingSession,
    loadSidebars,
  };
}
