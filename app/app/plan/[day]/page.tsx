"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, Copy, Inbox } from "lucide-react";
import { AlwaysOpenNote } from "@/components/always-open-note";
import { DailyTaskPlanner } from "@/components/daily-task-planner";
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      const nextDay = addDays(date, 1);
      Promise.all([
        tasksApi.list(),
        notesApi.list(),
        sessionsApi.list({ from: weekStart.toISOString(), to: nextDay.toISOString() }),
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
          setLoadError(error instanceof ApiError ? error.message : "Could not load this planning day.");
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedDayKey, validDay]);

  const dayTasks = taskList.filter((task) => task.period_start === selectedDayKey);
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
  const openTaskCount = dayTasks.filter((task) => task.completed_at === null).length;
  const todayKey = dayKey(new Date());
  const isToday = selectedDayKey === todayKey;
  const weekHref = `/app/plan?week=${selectedWeekKey}`;
  const previousDayKey = dayKey(addDays(selectedDate, -1));
  const nextDayKey = dayKey(addDays(selectedDate, 1));
  const dayBreadcrumbLabel = selectedDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const dayNavigation = validDay ? (
    <PageHeaderActions>
      <div className="animate-in fade-in slide-in-from-left-1 flex min-w-0 items-center gap-1 duration-300">
        <Button
          variant="outline"
          size="sm"
          className="hidden rounded-full px-5 sm:inline-flex"
          render={<Link href={`/app/plan/${todayKey}`} />}
          nativeButton={false}
        >
          Today
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous day"
          render={<Link href={`/app/plan/${previousDayKey}`} />}
          nativeButton={false}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next day"
          render={<Link href={`/app/plan/${nextDayKey}`} />}
          nativeButton={false}
        >
          <ChevronRight />
        </Button>
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
      </div>
    </PageHeaderActions>
  ) : null;

  function handleTaskCreated(task: Task) {
    setTaskList((current) => [...current, task]);
  }

  function handleTaskUpdated(task: Task) {
    setTaskList((current) => current.map((item) => item.id === task.id ? task : item));
  }

  function handleTaskDeleted(id: number) {
    setTaskList((current) => current.filter((task) => task.id !== id));
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
          <EmptyTitle>This planning day does not exist</EmptyTitle>
          <EmptyDescription>Choose a day from the weekly plan to open its tasks, notes, and sessions.</EmptyDescription>
        </EmptyHeader>
        <Button render={<Link href="/app/plan" />} nativeButton={false}>Back to plan</Button>
      </Empty>
    );
  }

  if (loading) {
    return (
      <>
        {dayNavigation}
        <div className="animate-in fade-in duration-300 mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
        </div>
      </>
    );
  }

  return (
    <>
      {dayNavigation}
      <div className="animate-in fade-in duration-500 fill-mode-both mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </h2>
            {isToday && <Badge>Today</Badge>}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span>{dayTasks.length} {dayTasks.length === 1 ? "task" : "tasks"}</span>
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
            <EmptyTitle>Could not load this planning day</EmptyTitle>
            <EmptyDescription>{loadError}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Planned tasks</CardTitle>
                <CardDescription>Schedule work, mark progress, or return unfinished tasks to Backlog.</CardDescription>
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
                <CardTitle>Day notes</CardTitle>
                <CardDescription>Capture changes, decisions, and what should carry forward.</CardDescription>
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
              <CardTitle>Sessions</CardTitle>
              <CardDescription>A chronological record of the work behind this plan.</CardDescription>
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
                        className="animate-in fade-in slide-in-from-bottom-1 grid grid-cols-[4.5rem_0.75rem_minmax(0,1fr)] gap-3 pb-6 duration-300 fill-mode-both last:pb-0"
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
                        <div className="flex min-w-0 flex-col gap-2">
                          <p className={session.description?.trim()
                            ? "text-sm leading-relaxed whitespace-pre-wrap"
                            : "text-muted-foreground text-sm italic"}
                          >
                            {session.description?.trim() || "No description recorded for this session."}
                          </p>
                          {completedSessionTasks.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              <p className="text-muted-foreground text-xs font-medium">Completed in this session</p>
                              <div className="flex flex-wrap gap-1.5">
                                {completedSessionTasks.map((task) => (
                                  <Badge key={task.id} variant="secondary">
                                    <CheckCircle2 />
                                    {task.title}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline">
                              {session.project_id ? <ProjectIcon icon={session.project_icon} /> : <NoProjectIcon />}
                              <span className="max-w-48 truncate" title={session.project_path ?? session.project_name ?? "No project"}>
                                {session.project_path ?? session.project_name ?? "No project"}
                              </span>
                            </Badge>
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
        </div>
      )}
      </div>
    </>
  );
}
