"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Clock3, Inbox } from "lucide-react";
import { AlwaysOpenNote } from "@/components/always-open-note";
import { DailyTaskPlanner } from "@/components/daily-task-planner";
import { HelpTooltip } from "@/components/help-tooltip";
import { DayPlanningHeader } from "@/components/planning/day-planning-header";
import { DayPlanningLoading } from "@/components/planning/day-planning-loading";
import { DayPlanningNavigation } from "@/components/planning/day-planning-navigation";
import { DaySessionTimeline } from "@/components/planning/day-session-timeline";
import { PlanningPeriodStats, shouldShowPlanningComparison } from "@/components/planning-period-stats";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import {
  ApiError,
  Note,
  Project,
  StudySession,
  Task,
  notes as notesApi,
  projects as projectsApi,
  sessions as sessionsApi,
  tasks as tasksApi,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useActiveSession } from "@/lib/active-session-context";
import {
  addDays,
  dayKey,
  parseDateKey,
  startOfWeek,
  weekKey,
} from "@/lib/date";
import { buildAiPrompt } from "@/lib/export";
import { partialWeekStats, sessionDurationSeconds } from "@/lib/session-stats";
import { mergeActiveSession } from "@/lib/session-list";
import {
  removeTask as removeTaskFromList,
  removeTaskFromSessions,
  replaceSessionTasks,
  replaceTaskInSessions,
  upsertTask,
} from "@/lib/task-collections";

function isValidDayKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dayKey(parseDateKey(value)) === value;
}

export default function DayPlanningPage() {
  const params = useParams<{ day: string }>();
  const { activeSession, now, sessionRevision } = useActiveSession();
  const { user } = useAuth();
  const timeZone = user?.timezone ?? undefined;
  const selectedDayKey = params.day;
  const validDay = isValidDayKey(selectedDayKey);
  const selectedDate = validDay ? parseDateKey(selectedDayKey, timeZone) : new Date(now);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [sessionList, setSessionList] = useState<StudySession[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [sessionTasks, setSessionTasks] = useState<Record<number, Task[]>>({});
  const [sessionTaskErrors, setSessionTaskErrors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(validDay);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!validDay) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError(null);
      setSessionTasks({});
      setSessionTaskErrors({});
      const date = parseDateKey(selectedDayKey, timeZone);
      const weekStart = startOfWeek(date, timeZone);
      const previousDay = addDays(date, -1, timeZone);
      const rangeStart = previousDay < weekStart ? previousDay : weekStart;
      const nextDay = addDays(date, 1, timeZone);
      Promise.all([
        tasksApi.list(),
        notesApi.list(),
        sessionsApi.list({ from: rangeStart.toISOString(), to: nextDay.toISOString() }),
        projectsApi.list(),
        ])
        .then(async ([tasks, notes, sessions, projects]) => {
          const sessionsForDay = sessions.filter(
            (session) => dayKey(new Date(session.started_at), timeZone) === selectedDayKey,
          );
          const sessionTaskResults = await Promise.all(
            sessionsForDay.map(async (session) => {
              try {
                return { sessionId: session.id, tasks: await sessionsApi.tasks(session.id) };
              } catch (error) {
                return {
                  sessionId: session.id,
                  error: error instanceof ApiError ? error.message : "Could not load this session's tasks.",
                };
              }
            }),
          );
          if (cancelled) return;
          setTaskList(tasks);
          setNoteList(notes);
          setSessionList(sessions);
          setProjectList(projects);
          setSessionTasks(Object.fromEntries(sessionTaskResults.flatMap((result) =>
            result.tasks ? [[result.sessionId, result.tasks]] : [])));
          setSessionTaskErrors(Object.fromEntries(sessionTaskResults.flatMap((result) =>
            result.error ? [[result.sessionId, result.error]] : [])));
        })
        .catch((error) => {
          if (cancelled) return;
          setLoadError(error instanceof ApiError ? error.message : "Could not load this calendar day.");
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedDayKey, sessionRevision, timeZone, validDay]);

  const previousRangeDay = addDays(selectedDate, -1, timeZone);
  const weekRangeStart = startOfWeek(selectedDate, timeZone);
  const rangeStart = previousRangeDay < weekRangeStart ? previousRangeDay : weekRangeStart;
  const rangeEnd = addDays(selectedDate, 1, timeZone);
  const canonicalSessions = mergeActiveSession(
    sessionList,
    activeSession,
    (session) => new Date(session.started_at) >= rangeStart && new Date(session.started_at) < rangeEnd,
  );

  const dayTasks = taskList.filter((task) => task.period_start === selectedDayKey);
  const plannedTasks = dayTasks.filter((task) => task.completed_at === null);
  const backlogTasks = taskList.filter((task) => task.period_start === null);
  const dayNote = noteList.find((note) => note.scope === "day" && note.date_key === selectedDayKey);
  const selectedWeekKey = weekKey(selectedDate, timeZone);
  const selectedWeekStart = startOfWeek(selectedDate, timeZone);
  const weekNote = noteList.find((note) => note.scope === "week" && note.date_key === selectedWeekKey);
  const daySessions = useMemo(
    () => canonicalSessions
      .filter((session) => dayKey(new Date(session.started_at), timeZone) === selectedDayKey)
      .sort((a, b) => a.started_at.localeCompare(b.started_at)),
    [canonicalSessions, selectedDayKey, timeZone],
  );
  const totalSessionSeconds = daySessions.reduce(
    (total, session) => total + sessionDurationSeconds(session, now),
    0,
  );
  const openTaskCount = plannedTasks.length;
  const previousDayKey = dayKey(addDays(selectedDate, -1, timeZone), timeZone);
  const previousDaySessions = canonicalSessions.filter(
    (session) => dayKey(new Date(session.started_at), timeZone) === previousDayKey,
  );
  const todayKey = dayKey(new Date(now), timeZone);
  const isToday = selectedDayKey === todayKey;
  const weekHref = `/app/calendar?week=${selectedWeekKey}`;
  const nextDayKey = dayKey(addDays(selectedDate, 1, timeZone), timeZone);
  const dayNavigation = validDay ? (
    <DayPlanningNavigation
      selectedDate={selectedDate}
      selectedWeekStart={selectedWeekStart}
      weekHref={weekHref}
      todayKey={todayKey}
      previousDayKey={previousDayKey}
      nextDayKey={nextDayKey}
      isToday={isToday}
      timeZone={timeZone}
    />
  ) : null;

  function handleTaskCreated(task: Task) {
    setTaskList((current) => upsertTask(current, task));
  }

  function handleTaskUpdated(task: Task) {
    setTaskList((current) => upsertTask(current, task));
    setSessionTasks((current) => task.completed_at === null && task.period_start === null
      ? removeTaskFromSessions(current, task.id)
      : replaceTaskInSessions(current, task));
  }

  function handleTaskDeleted(id: number) {
    setTaskList((current) => removeTaskFromList(current, id));
    setSessionTasks((current) => removeTaskFromSessions(current, id));
  }

  function handleSessionUpdated(updated: StudySession) {
    setSessionList((current) => current
      .map((session) => session.id === updated.id ? updated : session)
      .sort((a, b) => a.started_at.localeCompare(b.started_at)));
  }

  async function retrySessionTasks(sessionId: number) {
    try {
      const tasks = await sessionsApi.tasks(sessionId);
      setSessionTasks((current) => replaceSessionTasks(current, sessionId, tasks));
      setSessionTaskErrors((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
    } catch (error) {
      setSessionTaskErrors((current) => ({
        ...current,
        [sessionId]: error instanceof ApiError ? error.message : "Could not load this session's tasks.",
      }));
    }
  }

  function handleProjectCreated(project: Project) {
    setProjectList((current) => [...current, project].sort((a, b) => a.path.localeCompare(b.path)));
  }

  function handleNoteSaved(note: Note) {
    setNoteList((current) => [
      ...current.filter((item) => !(item.scope === note.scope && item.date_key === note.date_key)),
      note,
    ]);
  }

  function handleNoteDeleted() {
    setNoteList((current) => current.filter(
      (note) => !(note.scope === "day" && note.date_key === selectedDayKey),
    ));
  }

  function copyDailyPrompt() {
    const prompt = buildAiPrompt({
      userContext: user?.planContext ?? null,
      date: selectedDate,
      sessionList: daySessions,
      dayTasks,
      projectList,
      weekGoalsText: weekNote?.content ?? null,
      weekSoFar: partialWeekStats(canonicalSessions, selectedWeekStart, selectedDayKey, now, timeZone),
      dayNote,
      now,
      timeZone,
    });
    navigator.clipboard.writeText(prompt);
    toast.add({
      id: `planning-day-prompt-${selectedDayKey}`,
      type: "success",
      title: "AI prompt copied to clipboard",
    });
  }

  if (!validDay) {
    return (
      <Empty className="animate-in fade-in zoom-in-95 duration-300 mx-auto min-h-96 w-full max-w-3xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
          <EmptyTitle>This calendar day does not exist</EmptyTitle>
          <EmptyDescription>Choose a day from the weekly calendar to open its tasks, notes, and sessions.</EmptyDescription>
        </EmptyHeader>
        <Button render={<Link href="/app/calendar" />} nativeButton={false}>Back to Calendar</Button>
      </Empty>
    );
  }

  if (loading) {
    return (
      <>
        {dayNavigation}
        <DayPlanningLoading />
      </>
    );
  }

  return (
    <>
      {dayNavigation}
      <div className="animate-in fade-in mx-auto flex w-full max-w-6xl flex-col gap-6 duration-500 fill-mode-both">
      <DayPlanningHeader
        selectedDate={selectedDate}
        isToday={isToday}
        openTaskCount={plannedTasks.length}
        sessionCount={daySessions.length}
        totalSessionSeconds={totalSessionSeconds}
        onCopyPrompt={copyDailyPrompt}
        timeZone={timeZone}
      />

      {loadError ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Clock3 /></EmptyMedia>
            <EmptyTitle>Could not load this calendar day</EmptyTitle>
            <EmptyDescription>{loadError}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.8fr)_minmax(16rem,0.55fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1">
                  Planned tasks
                  <HelpTooltip>Schedule work, mark progress, or return unfinished tasks to Backlog.</HelpTooltip>
                </CardTitle>
                <CardAction><Badge variant="outline">{openTaskCount} open</Badge></CardAction>
              </CardHeader>
              <CardContent>
                <DailyTaskPlanner
                  periodStart={selectedDayKey}
                  tasks={dayTasks}
                  projects={projectList}
                  backlogTasks={backlogTasks}
                  onCreated={handleTaskCreated}
                  onUpdated={handleTaskUpdated}
                  onDeleted={handleTaskDeleted}
                  onProjectCreated={handleProjectCreated}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1">
                  Day notes
                  <HelpTooltip>Capture changes, decisions, and what should carry forward.</HelpTooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AlwaysOpenNote
                  key={selectedDayKey}
                  scope="day"
                  dateKey={selectedDayKey}
                  note={dayNote}
                  placeholder="What happened, what changed, and what needs attention next?"
                  className="min-h-32"
                  onSaved={handleNoteSaved}
                  onDeleted={handleNoteDeleted}
                />
              </CardContent>
            </Card>
          </div>

          <DaySessionTimeline
            sessions={daySessions}
            sessionTasks={sessionTasks}
            sessionTaskErrors={sessionTaskErrors}
            taskList={taskList}
            totalSessionSeconds={totalSessionSeconds}
            now={now}
            timeZone={timeZone}
            onSessionUpdated={handleSessionUpdated}
            onTaskUpdated={handleTaskUpdated}
            onSessionTasksChanged={(sessionId, tasks) => setSessionTasks((current) =>
              replaceSessionTasks(current, sessionId, tasks))}
            onSessionTaskCreated={(sessionId, task) => {
              handleTaskCreated(task);
              setSessionTasks((current) =>
                replaceSessionTasks(current, sessionId, upsertTask(current[sessionId] ?? [], task)));
            }}
            onRetrySessionTasks={retrySessionTasks}
          />

          <aside className="grid min-w-0 gap-4 lg:col-span-2 xl:col-span-1" aria-label="Daily statistics">
            <PlanningPeriodStats
              period="day"
              sessions={daySessions}
              previousSessions={previousDaySessions}
              now={now}
              date={selectedDate}
              showComparison={shouldShowPlanningComparison("day", selectedDate, now, timeZone)}
              timeZone={timeZone}
            />
          </aside>
        </div>
      )}
      </div>
    </>
  );
}
