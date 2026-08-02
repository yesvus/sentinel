"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock3, Copy, History, Square, SquareCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  tasks as tasksApi,
  notes as notesApi,
  sessions as sessionsApi,
  projects as projectsApi,
  LONG_TERM_NOTE_KEY,
  Task,
  Note,
  StudySession,
  Project,
} from "@/lib/api";
import { NoteFocusCard } from "@/components/note-focus-card";
import { PlanningPeriodStats } from "@/components/planning-period-stats";
import { LinkifiedText } from "@/components/linkified-text";
import { toast } from "@/components/ui/toast";
import { buildWeeklyAiPrompt } from "@/lib/export";
import { weekStatsFor, sessionDurationSeconds } from "@/lib/session-stats";
import { useAuth } from "@/lib/auth-context";
import { PageHeaderActions } from "@/lib/page-header-actions-context";
import { dayKey, addDays, startOfWeek, weekKey, formatDuration, formatWeekRangeLabel, parseDateKey } from "@/lib/date";

function initialWeekOffset(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 0;
  const target = startOfWeek(parseDateKey(value));
  const current = startOfWeek(new Date());
  return Math.round((target.getTime() - current.getTime()) / (7 * 86_400_000));
}

export default function PlanPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [weekOffset, setWeekOffset] = useState(() => initialWeekOffset(searchParams.get("week")));
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [sessionList, setSessionList] = useState<StudySession[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    Promise.all([tasksApi.list(), notesApi.list(), sessionsApi.list(), projectsApi.list()])
      .then(([t, n, s, p]) => {
        setTaskList(t);
        setNoteList(n);
        setSessionList(s);
        setProjectList(p);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const legacyDay = searchParams.get("day");
    if (legacyDay && /^\d{4}-\d{2}-\d{2}$/.test(legacyDay)) {
      router.replace(`/app/calendar/${legacyDay}`);
    }
  }, [router, searchParams]);

  function handleNoteSaved(note: Note) {
    setNoteList((list) => [...list.filter((n) => !(n.scope === note.scope && n.date_key === note.date_key)), note]);
  }

  function handleNoteDeleted(scope: "day" | "week" | "long-term", dateKey: string) {
    setNoteList((list) => list.filter((n) => !(n.scope === scope && n.date_key === dateKey)));
  }

  function copyPrompt(id: string, text: string) {
    navigator.clipboard.writeText(text);
    toast.add({ id, type: "success", title: "AI prompt copied to clipboard" });
  }

  const nowDate = new Date();
  const todayKey = dayKey(nowDate);
  const tomorrowKey = dayKey(addDays(nowDate, 1));
  const weekStart = startOfWeek(nowDate);

  const selectedWeekStart = addDays(weekStart, weekOffset * 7);
  const selectedWeekKey = dayKey(selectedWeekStart);
  const selectedWeekLabel = formatWeekRangeLabel(selectedWeekStart);
  const selectedWeekDays = Array.from({ length: 7 }, (_, i) => addDays(selectedWeekStart, i));
  const selectedWeekSessions = sessionList.filter((session) => weekKey(new Date(session.started_at)) === selectedWeekKey);
  const previousWeekStart = addDays(selectedWeekStart, -7);
  const previousWeekKey = weekKey(previousWeekStart);
  const previousWeekSessions = sessionList.filter((session) => weekKey(new Date(session.started_at)) === previousWeekKey);
  const selectedWeekNote = noteList.find((n) => n.scope === "week" && n.date_key === selectedWeekKey);

  const weekNavigation = (
    <PageHeaderActions>
      <div className="animate-in fade-in slide-in-from-left-1 flex min-w-0 items-center gap-1 duration-300">
        <Button
          variant="outline"
          size="sm"
          className="hidden rounded-full px-5 sm:inline-flex"
          onClick={() => setWeekOffset(0)}
        >
          Today
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => setWeekOffset((offset) => offset - 1)}>
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => setWeekOffset((offset) => offset + 1)}>
          <ChevronRight />
        </Button>
        <Breadcrumb className="hidden pl-1 lg:block">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem>
              <BreadcrumbPage className="whitespace-nowrap">{selectedWeekLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open session history"
          title="Session history"
          onClick={() => router.push("/app/calendar/history")}
        >
          <History />
        </Button>
      </div>
    </PageHeaderActions>
  );

  const tomorrowTasks = taskList.filter((t) => t.period_start === tomorrowKey);
  const longTermNote = noteList.find((n) => n.scope === "long-term" && n.date_key === LONG_TERM_NOTE_KEY);

  const reminderHour = user?.planReminderHour ?? 19;
  const showDailyReminder = nowDate.getHours() >= reminderHour && tomorrowTasks.length === 0;

  const weeklyReminderDay = user?.planWeeklyReminderDay ?? 0;
  const weeklyReminderHour = user?.planWeeklyReminderHour ?? 19;
  const nextWeekNote = noteList.find((n) => n.scope === "week" && n.date_key === dayKey(addDays(weekStart, 7)));
  const showWeeklyReminder =
    nowDate.getDay() === weeklyReminderDay && nowDate.getHours() >= weeklyReminderHour && !nextWeekNote?.content;

  function copySelectedWeeklyPrompt() {
    const currentWeek = weekStatsFor(sessionList, selectedWeekStart, now);
    const previousWeeks = [4, 3, 2, 1].map((n) => weekStatsFor(sessionList, addDays(selectedWeekStart, -7 * n), now));
    const prompt = buildWeeklyAiPrompt({
      userContext: user?.planContext ?? null,
      longTermGoalsText: longTermNote?.content ?? null,
      previousWeeks,
      currentWeek,
      weekNote: selectedWeekNote,
    });
    copyPrompt("plan-weekly-prompt", prompt);
  }

  if (loading) {
    return (
      <>
        {weekNavigation}
        <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2 rounded-lg border p-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 items-start gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="min-h-40 space-y-2 rounded-lg border p-2.5">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
        </div>
      </>
    );
  }

  return (
    <>
      {weekNavigation}
      <div className="animate-in fade-in mx-auto w-full max-w-6xl space-y-4 duration-500 fill-mode-both">
      {showDailyReminder && (
        <button
          type="button"
          onClick={() => router.push(`/app/calendar/${tomorrowKey}`)}
          className="border-primary/30 bg-primary/5 hover:bg-primary/10 flex w-full items-center gap-2 rounded-md border px-4 py-3 text-left text-sm"
        >
          <Clock3 className="text-primary size-4 shrink-0" />
          It&apos;s after {String(reminderHour).padStart(2, "0")}:00 — want to plan tomorrow?
        </button>
      )}
      {showWeeklyReminder && (
        <button
          type="button"
          onClick={() => setWeekOffset(1)}
          className="border-primary/30 bg-primary/5 hover:bg-primary/10 flex w-full items-center gap-2 rounded-md border px-4 py-3 text-left text-sm"
        >
          <Clock3 className="text-primary size-4 shrink-0" />
          It&apos;s time for weekly planning — want to wrap up this week and plan the next one?
        </button>
      )}

      <section className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)]" aria-label="Weekly planning and statistics">
        <NoteFocusCard
          icon={null}
          title="Week goals"
          headerActions={
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy weekly analysis prompt"
                    onClick={copySelectedWeeklyPrompt}
                  />
                }
              >
                <Copy className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Copy weekly analysis prompt</TooltipContent>
            </Tooltip>
          }
          scope="week"
          dateKey={selectedWeekKey}
          note={selectedWeekNote}
          emptyText="No goals set for this week yet — click to add some."
          placeholder="What are you aiming for this week? Vague is fine — e.g. finish chapters 1-4 of Probability. This is also where you wrap up how the week went."
          dialogTitle={`Week of ${formatWeekRangeLabel(selectedWeekStart)}`}
          dialogDescription="Plan ahead, or wrap up how the week went — same note either way."
          cardClassName="h-72"
          collapsible={false}
          onSaved={handleNoteSaved}
          onDeleted={() => handleNoteDeleted("week", selectedWeekKey)}
        />
        <PlanningPeriodStats
          period="week"
          sessions={selectedWeekSessions}
          previousSessions={previousWeekSessions}
          now={now}
          date={selectedWeekStart}
        />
      </section>

      <div className="grid grid-cols-7 items-start gap-2">
        {selectedWeekDays.map((date) => {
          const key = dayKey(date);
          const isToday = key === todayKey;
          const dayTasksForDate = taskList.filter((t) => t.period_start === key);
          const dayNoteForDate = noteList.find((n) => n.scope === "day" && n.date_key === key);
          const trackedSeconds = sessionList
            .filter((s) => dayKey(new Date(s.started_at)) === key)
            .reduce((sum, s) => sum + sessionDurationSeconds(s, now), 0);

          return (
            <div
              key={key}
              role="link"
              tabIndex={0}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a,button,input,textarea,select")) return;
                router.push(`/app/calendar/${key}`);
              }}
              onKeyDown={(event) => {
                if ((event.target as HTMLElement).closest("a,button,input,textarea,select")) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(`/app/calendar/${key}`);
                }
              }}
              className={`hover:border-primary/40 hover:bg-muted/20 focus-visible:border-ring focus-visible:ring-ring/50 flex h-64 min-w-0 cursor-pointer select-none flex-col items-start overflow-hidden rounded-xl border text-left outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:ring-3 active:scale-[0.995] ${
                isToday ? "border-primary/50 bg-primary/5" : "border-border"
              }`}
            >
              <div className="bg-muted/20 flex w-full items-center justify-between gap-1 border-b px-2.5 py-2 text-left transition-colors duration-150">
                <span className="truncate text-sm font-medium">
                  {date.toLocaleDateString(undefined, { weekday: "short" })}{" "}
                  <span className="text-muted-foreground font-normal">{date.getDate()}</span>
                </span>
                {isToday && (
                  <span className="bg-primary/15 text-primary shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                    Today
                  </span>
                )}
              </div>
              <div className="flex min-h-0 w-full flex-1 flex-col items-start gap-1.5 overflow-y-auto p-2.5">
                {trackedSeconds > 0 && (
                  <span className="text-muted-foreground font-mono text-xs">{formatDuration(trackedSeconds)}</span>
                )}
                {dayTasksForDate.length > 0 ? (
                  <ul className="w-full space-y-1">
                    {dayTasksForDate.map((task) => {
                      const project = projectList.find((p) => p.id === task.project_id);
                      return (
                        <li
                          key={task.id}
                          className={`flex items-start gap-1 text-xs ${task.completed_at ? "text-muted-foreground line-through" : ""}`}
                        >
                          {task.completed_at ? (
                            <SquareCheck className="mt-0.5 size-3 shrink-0" />
                          ) : (
                            <Square className="mt-0.5 size-3 shrink-0" />
                          )}
                          <span className="min-w-0 break-words">
                            {task.title}
                            {project && <span className="text-muted-foreground/70"> · {project.name}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <span className="text-muted-foreground/60 text-xs">No tasks</span>
                )}
                {dayNoteForDate?.content && (
                  <LinkifiedText text={dayNoteForDate.content} as="p" className="text-muted-foreground w-full text-xs" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      </div>
    </>
  );
}
