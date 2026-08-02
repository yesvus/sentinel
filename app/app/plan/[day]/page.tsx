"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Clock3, Copy, History, Inbox } from "lucide-react";
import { AlwaysOpenNote } from "@/components/always-open-note";
import { DailyTaskPlanner } from "@/components/daily-task-planner";
import { DateRangeNavigator } from "@/components/date-range-navigator";
import { HelpTooltip } from "@/components/help-tooltip";
import { LinkifiedText } from "@/components/linkified-text";
import { SessionEditorDialog } from "@/components/session-editor-dialog";
import { PlanningPeriodStats } from "@/components/planning-period-stats";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
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
import { PageHeaderActions } from "@/lib/page-header-actions-context";
import {
  addDays,
  dayKey,
  formatDuration,
  formatTime,
  formatWeekRangeLabel,
  parseDateKey,
  startOfWeek,
  weekKey,
} from "@/lib/date";
import { buildAiPrompt } from "@/lib/export";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { partialWeekStats, sessionDurationSeconds } from "@/lib/session-stats";

function isValidDayKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dayKey(parseDateKey(value)) === value;
}

export default function DayPlanningPage() {
  const params = useParams<{ day: string }>();
  const selectedDayKey = params.day;
  const validDay = isValidDayKey(selectedDayKey);
  const selectedDate = validDay ? parseDateKey(selectedDayKey) : new Date();
  const { user } = useAuth();
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [sessionList, setSessionList] = useState<StudySession[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [sessionTasks, setSessionTasks] = useState<Record<number, Task[]>>({});
  const [loading, setLoading] = useState(validDay);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!validDay) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError(null);
      const date = parseDateKey(selectedDayKey);
      const weekStart = startOfWeek(date);
      const previousDay = addDays(date, -1);
      const rangeStart = previousDay < weekStart ? previousDay : weekStart;
      const nextDay = addDays(date, 1);
      Promise.all([
        tasksApi.list(),
        notesApi.list(),
        sessionsApi.list({ from: rangeStart.toISOString(), to: nextDay.toISOString() }),
        projectsApi.list(),
      ])
        .then(async ([tasks, notes, sessions, projects]) => {
          const sessionsForDay = sessions.filter(
            (session) => dayKey(new Date(session.started_at)) === selectedDayKey,
          );
          const sessionTaskEntries = await Promise.all(
            sessionsForDay.map(async (session) => {
              const attachedTasks = await sessionsApi.tasks(session.id).catch(() => []);
              return [session.id, attachedTasks] as const;
            }),
          );
          setTaskList(tasks);
          setNoteList(notes);
          setSessionList(sessions);
          setProjectList(projects);
          setSessionTasks(Object.fromEntries(sessionTaskEntries));
        })
        .catch((error) => {
          setLoadError(error instanceof ApiError ? error.message : "Could not load this calendar day.");
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedDayKey, validDay]);

  const dayTasks = taskList.filter((task) => task.period_start === selectedDayKey);
  const plannedTasks = dayTasks.filter((task) => task.completed_at === null);
  const backlogTasks = taskList.filter((task) => task.period_start === null);
  const dayNote = noteList.find((note) => note.scope === "day" && note.date_key === selectedDayKey);
  const selectedWeekKey = weekKey(selectedDate);
  const selectedWeekStart = startOfWeek(selectedDate);
  const weekNote = noteList.find((note) => note.scope === "week" && note.date_key === selectedWeekKey);
  const daySessions = useMemo(
    () => sessionList
      .filter((session) => dayKey(new Date(session.started_at)) === selectedDayKey)
      .sort((a, b) => a.started_at.localeCompare(b.started_at)),
    [selectedDayKey, sessionList],
  );
  const totalSessionSeconds = daySessions.reduce(
    (total, session) => total + sessionDurationSeconds(session, now),
    0,
  );
  const openTaskCount = plannedTasks.length;
  const previousDayKey = dayKey(addDays(selectedDate, -1));
  const previousDaySessions = sessionList.filter(
    (session) => dayKey(new Date(session.started_at)) === previousDayKey,
  );
  const todayKey = dayKey(new Date());
  const isToday = selectedDayKey === todayKey;
  const weekHref = `/app/calendar?week=${selectedWeekKey}`;
  const nextDayKey = dayKey(addDays(selectedDate, 1));
  const dayBreadcrumbLabel = selectedDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const dayNavigation = validDay ? (
    <>
      <PageHeaderActions>
        <DateRangeNavigator
          today={{ href: `/app/calendar/${todayKey}` }}
          todayDisabled={isToday}
          previous={{ href: `/app/calendar/${previousDayKey}` }}
          previousLabel="Previous day"
          next={{ href: `/app/calendar/${nextDayKey}` }}
          nextLabel="Next day"
        >
          <Breadcrumb className="hidden min-w-0 pl-1 md:block">
            <BreadcrumbList className="flex-nowrap gap-1">
              <BreadcrumbItem className="hidden xl:inline-flex">
                <BreadcrumbLink
                  className="max-w-44 truncate whitespace-nowrap"
                  render={<Link href={weekHref} />}
                >
                  {formatWeekRangeLabel(selectedWeekStart)}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden xl:block" />
              <BreadcrumbItem>
                <BreadcrumbPage className="whitespace-nowrap">{dayBreadcrumbLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </DateRangeNavigator>
      </PageHeaderActions>
      <PageHeaderActions align="right">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open session history"
          title="Session history"
          render={<Link href="/app/calendar/history" />}
          nativeButton={false}
        >
          <History />
        </Button>
      </PageHeaderActions>
    </>
  ) : null;

  function handleTaskCreated(task: Task) {
    setTaskList((current) => [...current, task]);
  }

  function handleTaskUpdated(task: Task) {
    setTaskList((current) => current.map((item) => item.id === task.id ? task : item));
    setSessionTasks((current) => Object.fromEntries(
      Object.entries(current).map(([sessionId, tasks]) => [
        sessionId,
        tasks.map((item) => item.id === task.id ? task : item),
      ]),
    ));
  }

  function handleTaskDeleted(id: number) {
    setTaskList((current) => current.filter((task) => task.id !== id));
  }

  function handleSessionUpdated(updated: StudySession) {
    setSessionList((current) => current
      .map((session) => session.id === updated.id ? updated : session)
      .sort((a, b) => a.started_at.localeCompare(b.started_at)));
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
      weekSoFar: partialWeekStats(sessionList, selectedWeekStart, selectedDayKey, now),
      dayNote,
      now,
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
        <div className="animate-in fade-in mx-auto flex w-full max-w-6xl flex-col gap-6 duration-300">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.8fr)_minmax(16rem,0.55fr)]">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
          <div className="grid gap-4 lg:col-span-2 xl:col-span-1">
            <Skeleton className="h-52 w-full" />
          </div>
        </div>
        </div>
      </>
    );
  }

  return (
    <>
      {dayNavigation}
      <div className="animate-in fade-in mx-auto flex w-full max-w-6xl flex-col gap-6 duration-500 fill-mode-both">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </h2>
            {isToday && <Badge>Today</Badge>}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span>{plannedTasks.length} {plannedTasks.length === 1 ? "task" : "tasks"} left</span>
            <span aria-hidden="true">·</span>
            <span>{daySessions.length} {daySessions.length === 1 ? "session" : "sessions"}</span>
            {totalSessionSeconds > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{formatDuration(totalSessionSeconds)} tracked</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center">
          <Button variant="outline" onClick={copyDailyPrompt}>
            <Copy data-icon="inline-start" />
            Copy AI prompt
          </Button>
        </div>
      </div>

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
                  tasks={plannedTasks}
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

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-1">
                Sessions
                <HelpTooltip>A chronological record of the work behind this day.</HelpTooltip>
              </CardTitle>
              {totalSessionSeconds > 0 && (
                <CardAction><Badge variant="secondary">{formatDuration(totalSessionSeconds)}</Badge></CardAction>
              )}
            </CardHeader>
            <CardContent>
              {daySessions.length === 0 ? (
                <Empty className="min-h-52 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Clock3 /></EmptyMedia>
                    <EmptyTitle>No sessions on this day</EmptyTitle>
                    <EmptyDescription>Tracked sessions and their descriptions will appear here.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ol className="flex flex-col">
                  {daySessions.map((session, index) => {
                    const running = session.ended_at === null;
                    const duration = sessionDurationSeconds(session, now);
                    const completedSessionTasks = (sessionTasks[session.id] ?? []).filter(
                      (task) => task.completed_at !== null,
                    );
                    return (
                      <li
                        key={session.id}
                        className="group/session animate-in fade-in slide-in-from-bottom-1 grid grid-cols-[4.5rem_0.75rem_minmax(0,1fr)] gap-3 pb-6 duration-300 fill-mode-both last:pb-0"
                        style={{ animationDelay: `${Math.min(index * 60, 240)}ms` }}
                      >
                        <div className="text-muted-foreground flex flex-col gap-0.5 font-mono text-xs">
                          <time dateTime={session.started_at}>{formatTime(session.started_at)}</time>
                          <span>{running ? "Now" : formatTime(session.ended_at!)}</span>
                        </div>
                        <div className="relative flex justify-center">
                          <span className="bg-primary ring-card relative mt-1.5 size-2 rounded-full ring-4" />
                          {index < daySessions.length - 1 && (
                            <span className="bg-border absolute top-4 bottom-[-1.5rem] w-px" aria-hidden="true" />
                          )}
                        </div>
                        <div className="relative flex min-w-0 flex-col gap-2 pr-8">
                          <div className="absolute -top-1 right-0 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover/session:opacity-100 sm:group-focus-within/session:opacity-100">
                            <SessionEditorDialog
                              session={session}
                              tasks={completedSessionTasks}
                              availableTasks={taskList.filter((task) => task.completed_at !== null || task.period_start === null)}
                              onUpdated={handleSessionUpdated}
                              onTaskUpdated={handleTaskUpdated}
                              onTasksChanged={(sessionId, tasks) => setSessionTasks((current) => ({ ...current, [sessionId]: tasks }))}
                              onTaskCreated={(sessionId, task) => {
                                handleTaskCreated(task);
                                setSessionTasks((current) => ({
                                  ...current,
                                  [sessionId]: [...(current[sessionId] ?? []).filter((item) => item.id !== task.id), task],
                                }));
                              }}
                            />
                          </div>
                          <LinkifiedText
                            text={session.description?.trim() || "No description recorded for this session."}
                            as="p"
                            className={session.description?.trim()
                            ? "text-sm leading-relaxed whitespace-pre-wrap"
                            : "text-muted-foreground text-sm italic"}
                          />
                          {completedSessionTasks.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              <p className="text-muted-foreground text-xs font-medium">Completed in this session</p>
                              <div className="flex flex-wrap gap-1.5">
                                {completedSessionTasks.map((task) => (
                                  <TaskEditorPopover
                                    key={task.id}
                                    task={task}
                                    onUpdated={handleTaskUpdated}
                                    trigger="badge"
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {session.project_id ? (
                              <Badge
                                variant="outline"
                                render={<Link href={`/app/projects/${session.project_id}`} />}
                                className="max-w-full"
                              >
                                <ProjectIcon icon={session.project_icon} />
                                <span className="max-w-48 truncate" title={session.project_path ?? session.project_name ?? "Project"}>
                                  {session.project_path ?? session.project_name ?? "Project"}
                                </span>
                              </Badge>
                            ) : (
                              <Badge variant="outline"><NoProjectIcon />No project</Badge>
                            )}
                            <Badge variant="secondary">{running ? "Running" : formatDuration(duration)}</Badge>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          <aside className="grid min-w-0 gap-4 lg:col-span-2 xl:col-span-1" aria-label="Daily statistics">
            <PlanningPeriodStats
              period="day"
              sessions={daySessions}
              previousSessions={previousDaySessions}
              now={now}
              date={selectedDate}
            />
          </aside>
        </div>
      )}
      </div>
    </>
  );
}
