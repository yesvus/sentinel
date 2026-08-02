"use client";

import { useEffect, useRef, useState } from "react";
import { ActiveTaskRail } from "@/components/home/active-task-rail";
import { EditStartDialog } from "@/components/home/edit-start-dialog";
import { FinishSessionDialog } from "@/components/home/finish-session-dialog";
import { RecentRail } from "@/components/home/recent-rail";
import { SessionDetailDialog } from "@/components/home/session-detail-dialog";
import { TimerCard } from "@/components/home/timer-card";
import { TodayRail } from "@/components/home/today-rail";
import { toast } from "@/components/ui/toast";
import { useSidebar } from "@/components/ui/sidebar";
import { useHomeRailVisibility } from "@/hooks/use-home-rail-visibility";
import { useActiveSession } from "@/lib/active-session-context";
import { ApiError, type Note, type Project, type StudySession, type Task, notes as notesApi, projects as projectsApi, sessions, tasks as tasksApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { combineLocalDateAndTime, dayKey, formatDuration, timeInputValue } from "@/lib/date";
import { buildHomeModel } from "@/lib/home-model";
import { removeTask as removeTaskFromList, upsertTask } from "@/lib/task-collections";
import { setTaskCompletion, taskMutations } from "@/lib/task-mutations";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function AppHomePage() {
  const { user } = useAuth();
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const {
    activeSession,
    elapsedMs,
    now,
    reconciling: refreshingActive,
    startSession,
    updateSession,
    stopSession,
    pauseSession,
    resumeSession,
  } = useActiveSession();
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(() => activeSession?.project_id ?? null);
  const [description, setDescription] = useState(() => activeSession?.description ?? "");
  const [descriptionStatus, setDescriptionStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [todaySessions, setTodaySessions] = useState<StudySession[]>([]);
  const [recentSessions, setRecentSessions] = useState<StudySession[]>([]);
  const [sidebarDataLoaded, setSidebarDataLoaded] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [deletingTaskIds, setDeletingTaskIds] = useState<number[]>([]);
  const [recentTaskIds, setRecentTaskIds] = useState<number[]>([]);
  const [sessionTaskIds, setSessionTaskIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [viewingSession, setViewingSession] = useState<StudySession | null>(null);
  const [viewingSessionTasks, setViewingSessionTasks] = useState<Task[]>([]);
  const [editStartOpen, setEditStartOpen] = useState(false);
  const [editStartTime, setEditStartTime] = useState("");
  const [editStartError, setEditStartError] = useState<string | null>(null);
  const [editStartBusy, setEditStartBusy] = useState(false);
  const trackProductionSplit = user?.trackProductionSplit ?? true;
  const defaultProductionPercentage = user?.defaultSessionType === "producing" ? 100 : 0;
  const [productionPercentage, setProductionPercentage] = useState(defaultProductionPercentage);
  const descriptionSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionId = activeSession?.id ?? null;
  const startedAt = activeSession ? new Date(activeSession.started_at).getTime() : null;
  const isRunning = activeSession !== null;
  const isPaused = activeSession?.paused_at != null;
  const previousRunningRef = useRef(isRunning);
  const { visible: sidebarsVisible, exiting: sidebarsExiting } = useHomeRailVisibility({
    isRunning,
    isMobile,
    setSidebarOpen: setOpen,
    setMobileSidebarOpen: setOpenMobile,
  });

  function loadSidebars() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Promise.all([
      sessions.list({ from: today.toISOString() }).then(setTodaySessions).catch(() => {}),
      sessions.page(null, 5).then((page) => setRecentSessions(page.items.filter((session) => session.ended_at !== null).slice(0, 4))).catch(() => {}),
    ]);
  }

  useEffect(() => {
    const sessionWasRunning = previousRunningRef.current;
    previousRunningRef.current = isRunning;
    const timer = window.setTimeout(() => {
      if (activeSession) {
        setProjectId(activeSession.project_id);
        setDescription(activeSession.description ?? "");
        if (!sessionWasRunning) {
          setSelectedTaskIds([]);
          setSessionTaskIds([]);
          void loadSidebars();
        }
        return;
      }
      if (sessionWasRunning) {
        setDescription("");
        setProductionPercentage(defaultProductionPercentage);
        setStopOpen(false);
        setSessionTaskIds([]);
        void loadSidebars();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeSession, defaultProductionPercentage, isRunning]);

  useEffect(() => {
    Promise.all([
      projectsApi.list().then(setProjectList).catch(() => {}),
      tasksApi.list().then(setTaskList).catch(() => {}),
      notesApi.list().then(setNoteList).catch(() => {}),
      loadSidebars(),
    ]).finally(() => setSidebarDataLoaded(true));
  }, []);

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    sessions.tasks(sessionId).then((items) => {
      if (!cancelled) setSessionTaskIds(items.map((task) => task.id));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId]);

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

  async function toggleTaskCompletion(task: Task) {
    try {
      const updated = await setTaskCompletion(task);
      handleTaskUpdated(updated);
    } catch {
      // This remains a best-effort convenience toggle.
    }
  }

  async function deleteTask(task: Task) {
    setDeletingTaskIds((ids) => [...ids, task.id]);
    try {
      await taskMutations.remove(task);
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      setTaskList((list) => removeTaskFromList(list, task.id));
      setSelectedTaskIds((ids) => ids.filter((id) => id !== task.id));
      setSessionTaskIds((ids) => ids.filter((id) => id !== task.id));
    } catch {
      setError("Could not delete this task.");
    } finally {
      setDeletingTaskIds((ids) => ids.filter((id) => id !== task.id));
    }
  }

  function handleTaskCreated(created: Task) {
    setTaskList((list) => upsertTask(list, created));
    setRecentTaskIds((ids) => [...ids, created.id]);
    if (!isRunning) setSelectedTaskIds((ids) => [...ids, created.id]);
    else setSessionTaskIds((ids) => ids.includes(created.id) ? ids : [...ids, created.id]);
    window.setTimeout(() => setRecentTaskIds((ids) => ids.filter((id) => id !== created.id)), 500);
  }

  function handleTaskUpdated(updated: Task) {
    setTaskList((list) => upsertTask(list, updated));
    if (updated.completed_at === null && updated.period_start === null) {
      setSessionTaskIds((ids) => ids.filter((id) => id !== updated.id));
    }
  }

  async function handleStart() {
    setError(null);
    setBusy(true);
    try {
      await startSession({ projectId, description: description || null, taskIds: selectedTaskIds });
      setSelectedTaskIds([]);
      void loadSidebars();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (sessionId === null) return;
    setError(null);
    setBusy(true);
    try {
      const result = await stopSession(sessionId, description || null, trackProductionSplit ? productionPercentage : null);
      setSessionTaskIds([]);
      setDescription("");
      setProductionPercentage(defaultProductionPercentage);
      setStopOpen(false);
      void loadSidebars();
      toast.add({ type: "success", title: "Session recorded", description: `${formatDuration(result.durationSeconds)} logged.` });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handlePauseToggle() {
    if (sessionId === null) return;
    setBusy(true);
    setError(null);
    try {
      if (isPaused) await resumeSession(sessionId);
      else await pauseSession(sessionId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the session pause.");
    } finally {
      setBusy(false);
    }
  }

  function openEditStart() {
    if (startedAt === null) return;
    setEditStartTime(timeInputValue(new Date(startedAt)));
    setEditStartError(null);
    setEditStartOpen(true);
  }

  async function handleEditStart() {
    if (sessionId === null || startedAt === null) return;
    setEditStartError(null);
    const nextStartedAt = combineLocalDateAndTime(startedAt, editStartTime).getTime();
    if (nextStartedAt > now) {
      setEditStartError("Start time can't be in the future");
      return;
    }
    setEditStartBusy(true);
    try {
      await updateSession(sessionId, { startedAt: new Date(nextStartedAt).toISOString() });
      setEditStartOpen(false);
    } catch (err) {
      setEditStartError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setEditStartBusy(false);
    }
  }

  async function handleDetailsChange(next: { projectId?: number | null; description?: string }) {
    const nextProjectId = next.projectId !== undefined ? next.projectId : projectId;
    const nextDescription = next.description !== undefined ? next.description : description;
    if (next.projectId !== undefined) {
      setProjectId(next.projectId);
      if (sessionId === null) setSelectedTaskIds([]);
    }
    if (next.description !== undefined) setDescription(next.description);
    if (sessionId === null) return;

    const save = () => updateSession(sessionId, { projectId: nextProjectId, description: nextDescription })
      .then(() => {
        if (next.description !== undefined) {
          setDescriptionStatus("saved");
          setTimeout(() => setDescriptionStatus((status) => status === "saved" ? "idle" : status), 1500);
        }
      })
      .catch(() => {
        if (next.description !== undefined) setDescriptionStatus("idle");
      });
    if (next.description !== undefined) {
      if (descriptionSaveTimeout.current) clearTimeout(descriptionSaveTimeout.current);
      descriptionSaveTimeout.current = setTimeout(() => {
        setDescriptionStatus("saving");
        void save();
      }, 600);
    } else {
      await save();
    }
  }

  const todayKey = dayKey(new Date());
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const model = buildHomeModel({
    projects: projectList,
    tasks: taskList,
    notes: noteList,
    todaySessions,
    todayKey,
    projectId,
    sessionTaskIds,
    now,
  });

  return (
    <div className="mx-auto grid min-h-full w-full max-w-6xl items-center justify-center gap-8 px-4 py-8 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(13rem,15rem)_minmax(24rem,30rem)_minmax(13rem,15rem)] lg:grid-rows-[minmax(0,1fr)] lg:gap-10">
      {sidebarsVisible && (
        <TodayRail
          exiting={sidebarsExiting}
          loaded={sidebarDataLoaded}
          isRunning={isRunning}
          refreshingActive={refreshingActive}
          todayKey={todayKey}
          trackedSeconds={model.todayTrackedSeconds}
          groups={model.todayTaskGroups}
          todayTasks={model.todayTasks}
          todayNote={model.todayNote}
          projects={projectList}
          projectId={projectId}
          selectedTaskIds={selectedTaskIds}
          backlogSuggestions={model.backlogSuggestions}
          onProjectSelect={(nextProjectId) => void handleDetailsChange({ projectId: nextProjectId })}
          onTaskSelect={(task, selected) => {
            if (selected) setSelectedTaskIds((ids) => ids.filter((id) => id !== task.id));
            else {
              const nextProjectId = task.project_id ?? null;
              if (nextProjectId !== projectId) void handleDetailsChange({ projectId: nextProjectId });
              if (task.completed_at === null) setSelectedTaskIds((ids) => [...ids, task.id]);
            }
          }}
          onTaskCreated={handleTaskCreated}
        />
      )}
      {isRunning && sessionId !== null && (
        <ActiveTaskRail
          tasks={model.runningProjectTasks}
          projects={projectList}
          todayKey={todayKey}
          projectId={projectId}
          sessionId={sessionId}
          todaySuggestions={model.todaySuggestions}
          backlogSuggestions={model.backlogSuggestions}
          recentTaskIds={recentTaskIds}
          deletingTaskIds={deletingTaskIds}
          onTaskCreated={handleTaskCreated}
          onTaskUpdated={handleTaskUpdated}
          onToggleTask={(task) => void toggleTaskCompletion(task)}
          onDeleteTask={(task) => void deleteTask(task)}
        />
      )}
      <main className={`animate-in fade-in fill-mode-both animation-duration-500 delay-75 order-1 flex flex-col items-center gap-6 ${!sidebarsVisible ? "lg:col-start-2" : "lg:order-2"}`}>
        <div className="w-full max-w-sm">
          {isRunning ? <p className="text-muted-foreground text-sm font-medium">{todayLabel}</p> : (
            <p className="text-2xl font-semibold tracking-tight">{greeting()}{user?.name ? `, ${user.name}` : user?.email ? `, ${user.email.split("@")[0]}` : ""}</p>
          )}
        </div>
        <EditStartDialog open={editStartOpen} busy={editStartBusy} error={editStartError} time={editStartTime} startedAt={startedAt} now={now} onOpenChange={setEditStartOpen} onTimeChange={setEditStartTime} onSave={() => void handleEditStart()} />
        <FinishSessionDialog open={stopOpen} busy={busy} error={error} trackProductionSplit={trackProductionSplit} productionPercentage={productionPercentage} onOpenChange={setStopOpen} onProductionPercentageChange={setProductionPercentage} onFinish={() => void handleStop()} />
        <SessionDetailDialog session={viewingSession} tasks={viewingSessionTasks} onClose={() => setViewingSession(null)} />
        <TimerCard
          isRunning={isRunning}
          isPaused={isPaused}
          busy={busy}
          refreshingActive={refreshingActive}
          elapsedMs={elapsedMs}
          projects={projectList}
          projectId={projectId}
          activeProject={model.activeProject}
          description={description}
          descriptionStatus={descriptionStatus}
          error={error}
          stopOpen={stopOpen}
          onProjectChange={(nextProjectId) => void handleDetailsChange({ projectId: nextProjectId })}
          onDescriptionChange={(nextDescription) => void handleDetailsChange({ description: nextDescription })}
          onStart={() => void handleStart()}
          onPauseToggle={() => void handlePauseToggle()}
          onRequestStop={() => {
            setProductionPercentage(defaultProductionPercentage);
            setStopOpen(true);
          }}
          onEditStart={openEditStart}
        />
      </main>
      {sidebarsVisible && <RecentRail exiting={sidebarsExiting} loaded={sidebarDataLoaded} sessions={recentSessions} onViewSession={setViewingSession} />}
    </div>
  );
}
