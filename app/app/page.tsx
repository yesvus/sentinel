"use client";

import { ActiveTaskRail } from "@/components/home/active-task-rail";
import { EditStartDialog } from "@/components/home/edit-start-dialog";
import { FinishSessionDialog } from "@/components/home/finish-session-dialog";
import { RecentRail } from "@/components/home/recent-rail";
import { SessionDetailDialog } from "@/components/home/session-detail-dialog";
import { TimerCard } from "@/components/home/timer-card";
import { TodayRail } from "@/components/home/today-rail";
import { useSidebar } from "@/components/ui/sidebar";
import { useHomeData } from "@/hooks/use-home-data";
import { useHomeRailVisibility } from "@/hooks/use-home-rail-visibility";
import { useHomeSession } from "@/hooks/use-home-session";
import { useHomeTasks } from "@/hooks/use-home-tasks";
import { useActiveSession } from "@/lib/active-session-context";
import { useAuth } from "@/lib/auth-context";
import { dayKey } from "@/lib/date";
import { buildHomeModel } from "@/lib/home-model";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function AppHomePage() {
  const { user } = useAuth();
  const active = useActiveSession();
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const data = useHomeData(active.activeSession, active.sessionRevision);
  const trackProductionSplit = user?.trackProductionSplit ?? true;
  const defaultProductionPercentage = user?.defaultSessionType === "producing" ? 100 : 0;
  const session = useHomeSession({
    active,
    defaultProductionPercentage,
    trackProductionSplit,
    loadSidebars: data.loadSidebars,
  });
  const tasks = useHomeTasks({
    activeSessionId: session.sessionId,
    isRunning: session.isRunning,
    projectId: session.projectId,
    setTaskList: data.setTaskList,
    onProjectChange: (projectId) => session.changeDetails({ projectId }),
    onError: session.setError,
  });
  const { visible: sidebarsVisible, exiting: sidebarsExiting } = useHomeRailVisibility({
    isRunning: session.isRunning,
    isMobile,
    setSidebarOpen: setOpen,
    setMobileSidebarOpen: setOpenMobile,
  });

  const todayKey = dayKey(new Date());
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const model = buildHomeModel({
    projects: data.projectList,
    tasks: data.taskList,
    notes: data.noteList,
    todaySessions: data.todaySessions,
    todayKey,
    projectId: session.projectId,
    sessionTaskIds: tasks.sessionTaskIds,
    now: active.now,
  });

  async function startSession() {
    if (await session.start(tasks.selectedTaskIds)) tasks.clearSelectedTasks();
  }

  async function stopSession() {
    if (await session.stop()) tasks.clearSessionTasks();
  }

  return (
    <div className="mx-auto grid min-h-full w-full max-w-6xl items-center justify-center gap-8 px-4 py-8 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(13rem,15rem)_minmax(24rem,30rem)_minmax(13rem,15rem)] lg:grid-rows-[minmax(0,1fr)] lg:gap-10">
      {sidebarsVisible && (
        <TodayRail
          exiting={sidebarsExiting}
          loaded={data.sidebarDataLoaded}
          isRunning={session.isRunning}
          refreshingActive={active.reconciling}
          todayKey={todayKey}
          trackedSeconds={model.todayTrackedSeconds}
          groups={model.todayTaskGroups}
          todayTasks={model.todayTasks}
          todayNote={model.todayNote}
          projects={data.projectList}
          projectId={session.projectId}
          selectedTaskIds={tasks.selectedTaskIds}
          backlogSuggestions={model.backlogSuggestions}
          onProjectSelect={tasks.selectProject}
          onTaskSelect={tasks.selectTask}
          onTaskCreated={tasks.todayTaskCreated}
        />
      )}
      {session.isRunning && session.sessionId !== null && (
        <ActiveTaskRail
          tasks={model.runningProjectTasks}
          projects={data.projectList}
          todayKey={todayKey}
          projectId={session.projectId}
          sessionId={session.sessionId}
          todaySuggestions={model.todaySuggestions}
          backlogSuggestions={model.backlogSuggestions}
          recentTaskIds={tasks.recentTaskIds}
          deletingTaskIds={tasks.deletingTaskIds}
          loadStatus={tasks.sessionTasksLoadStatus}
          onRetry={tasks.retrySessionTasks}
          onTaskCreated={tasks.activeTaskCreated}
          onTaskUpdated={tasks.taskUpdated}
          onToggleTask={(task) => void tasks.toggleTask(task)}
          onDeleteTask={(task) => void tasks.deleteTask(task)}
        />
      )}
      <main className={`animate-in fade-in fill-mode-both animation-duration-500 delay-75 order-1 flex flex-col items-center gap-6 ${!sidebarsVisible ? "lg:col-start-2" : "lg:order-2"}`}>
        <div className="w-full max-w-sm">
          {session.isRunning ? <p className="text-muted-foreground text-sm font-medium">{todayLabel}</p> : (
            <p className="text-2xl font-semibold tracking-tight">{greeting()}{user?.name ? `, ${user.name}` : user?.email ? `, ${user.email.split("@")[0]}` : ""}</p>
          )}
        </div>
        <EditStartDialog
          open={session.editStartOpen}
          busy={session.editStartBusy}
          error={session.editStartError}
          time={session.editStartTime}
          startedAt={session.startedAt}
          now={active.now}
          onOpenChange={session.setEditStartOpen}
          onTimeChange={session.setEditStartTime}
          onSave={() => void session.editStart()}
        />
        <FinishSessionDialog
          open={session.stopOpen}
          busy={session.busy}
          error={session.error}
          trackProductionSplit={trackProductionSplit}
          productionPercentage={session.productionPercentage}
          onOpenChange={session.setStopOpen}
          onProductionPercentageChange={session.setProductionPercentage}
          onFinish={() => void stopSession()}
        />
        <SessionDetailDialog session={data.viewingSession} tasks={data.viewingSessionTasks} tasksStatus={data.viewingSessionTasksStatus} onRetryTasks={data.retryViewingSessionTasks} onClose={() => data.setViewingSession(null)} />
        <TimerCard
          isRunning={session.isRunning}
          isPaused={session.isPaused}
          busy={session.busy}
          refreshingActive={active.reconciling}
          elapsedMs={active.elapsedMs}
          projects={data.projectList}
          projectId={session.projectId}
          activeProject={model.activeProject}
          description={session.description}
          descriptionStatus={session.descriptionStatus}
          error={session.error}
          stopOpen={session.stopOpen}
          onProjectChange={(projectId) => tasks.selectProject(projectId)}
          onProjectCreated={(project) => {
            data.addProject(project);
            tasks.selectProject(project.id);
          }}
          onDescriptionChange={(description) => void session.changeDetails({ description })}
          onStart={() => void startSession()}
          onPauseToggle={() => void session.togglePause()}
          onRequestStop={session.requestStop}
          onEditStart={session.openEditStart}
        />
      </main>
      {sidebarsVisible && (
        <RecentRail
          exiting={sidebarsExiting}
          loaded={data.sidebarDataLoaded}
          sessions={data.recentSessions}
          onViewSession={data.setViewingSession}
        />
      )}
    </div>
  );
}
