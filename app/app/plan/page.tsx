"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock3, Copy, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { DateRangeNavigator } from "@/components/date-range-navigator";
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
import { PlanningPeriodStats, shouldShowPlanningComparison } from "@/components/planning-period-stats";
import { PlanningWeekDayCard } from "@/components/planning-week-day-card";
import { StreakSummaryCard } from "@/components/streak-summary-card";
import { toast } from "@/components/ui/toast";
import { buildWeeklyAiPrompt } from "@/lib/export";
import { activityStreak, longestActivityStreak, weekStatsFor, sessionDurationSeconds } from "@/lib/session-stats";
import { useAuth } from "@/lib/auth-context";
import { useActiveSession } from "@/lib/active-session-context";
import { PageHeaderActions } from "@/lib/page-header-actions-context";
import { dayKey, addDays, startOfWeek, weekKey, formatWeekRangeLabel, hourInTimeZone, parseDateKey, weekdayInTimeZone } from "@/lib/date";
import { mergeActiveSession } from "@/lib/session-list";

function initialWeekOffset(value: string | null, now: number, timeZone?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 0;
  const target = startOfWeek(parseDateKey(value, timeZone), timeZone);
  const current = startOfWeek(new Date(now), timeZone);
  return Math.round((target.getTime() - current.getTime()) / (7 * 86_400_000));
}

export default function PlanPage() {
  const { user } = useAuth();
  const timeZone = user?.timezone ?? undefined;
  const { activeSession, now, sessionRevision } = useActiveSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [weekOffset, setWeekOffset] = useState(() => initialWeekOffset(searchParams.get("week"), now, timeZone));
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [sessionList, setSessionList] = useState<StudySession[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => {
    Promise.all([tasksApi.list(), notesApi.list(), projectsApi.list()])
      .then(([t, n, p]) => {
        setTaskList(t);
        setNoteList(n);
        setProjectList(p);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    sessionsApi.list()
      .then((sessions) => { if (!cancelled) setSessionList(sessions); })
      .finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; };
  }, [sessionRevision]);

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

  const canonicalSessions = mergeActiveSession(sessionList, activeSession);
  const nowDate = new Date(now);
  const todayKey = dayKey(nowDate, timeZone);
  const tomorrowKey = dayKey(addDays(nowDate, 1, timeZone), timeZone);
  const weekStart = startOfWeek(nowDate, timeZone);

  const selectedWeekStart = addDays(weekStart, weekOffset * 7, timeZone);
  const selectedWeekKey = dayKey(selectedWeekStart, timeZone);
  const selectedWeekLabel = formatWeekRangeLabel(selectedWeekStart, timeZone);
  const selectedWeekDays = Array.from({ length: 7 }, (_, i) => addDays(selectedWeekStart, i, timeZone));
  const selectedWeekSessions = canonicalSessions.filter((session) => weekKey(new Date(session.started_at), timeZone) === selectedWeekKey);
  const previousWeekStart = addDays(selectedWeekStart, -7, timeZone);
  const previousWeekKey = weekKey(previousWeekStart, timeZone);
  const previousWeekSessions = canonicalSessions.filter((session) => weekKey(new Date(session.started_at), timeZone) === previousWeekKey);
  const selectedWeekNote = noteList.find((n) => n.scope === "week" && n.date_key === selectedWeekKey);
  const currentStreak = activityStreak(canonicalSessions, nowDate, timeZone);
  const longestStreak = longestActivityStreak(canonicalSessions, timeZone);

  const weekNavigation = (
    <>
      <PageHeaderActions>
        <DateRangeNavigator
          today={{ onClick: () => setWeekOffset(0) }}
          todayDisabled={weekOffset === 0}
          previous={{ onClick: () => setWeekOffset((offset) => offset - 1) }}
          previousLabel="Previous week"
          next={{ onClick: () => setWeekOffset((offset) => offset + 1) }}
          nextLabel="Next week"
        >
          <Breadcrumb className="hidden pl-1 lg:block">
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem>
                <BreadcrumbPage className="whitespace-nowrap">{selectedWeekLabel}</BreadcrumbPage>
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
          onClick={() => router.push("/app/calendar/history")}
        >
          <History />
        </Button>
      </PageHeaderActions>
    </>
  );

  const tomorrowTasks = taskList.filter((t) => t.period_start === tomorrowKey);
  const longTermNote = noteList.find((n) => n.scope === "long-term" && n.date_key === LONG_TERM_NOTE_KEY);

  const reminderHour = user?.planReminderHour ?? 19;
  const showDailyReminder = hourInTimeZone(nowDate, timeZone) >= reminderHour && tomorrowTasks.length === 0;

  const weeklyReminderDay = user?.planWeeklyReminderDay ?? 0;
  const weeklyReminderHour = user?.planWeeklyReminderHour ?? 19;
  const nextWeekNote = noteList.find((n) => n.scope === "week" && n.date_key === dayKey(addDays(weekStart, 7, timeZone), timeZone));
  const showWeeklyReminder =
    weekdayInTimeZone(nowDate, timeZone) === weeklyReminderDay && hourInTimeZone(nowDate, timeZone) >= weeklyReminderHour && !nextWeekNote?.content;

  function copySelectedWeeklyPrompt() {
    const currentWeek = weekStatsFor(canonicalSessions, selectedWeekStart, now, timeZone);
    const previousWeeks = [4, 3, 2, 1].map((n) => weekStatsFor(canonicalSessions, addDays(selectedWeekStart, -7 * n, timeZone), now, timeZone));
    const prompt = buildWeeklyAiPrompt({
      userContext: user?.planContext ?? null,
      longTermGoalsText: longTermNote?.content ?? null,
      previousWeeks,
      currentWeek,
      weekNote: selectedWeekNote,
      timeZone,
    });
    copyPrompt("plan-weekly-prompt", prompt);
  }

  if (loading || sessionsLoading) {
    return (
      <>
        {weekNavigation}
        <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 rounded-lg border p-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
        <div className="scrollbar-thin overflow-x-auto pb-2">
        <div className="grid min-w-[56rem] grid-cols-7 items-start gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="h-[30rem] space-y-2 rounded-lg border p-2.5">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
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
          It&apos;s after {String(reminderHour).padStart(2, "0")}:00 — open tomorrow in Calendar?
        </button>
      )}
      {showWeeklyReminder && (
        <button
          type="button"
          onClick={() => setWeekOffset(1)}
          className="border-primary/30 bg-primary/5 hover:bg-primary/10 flex w-full items-center gap-2 rounded-md border px-4 py-3 text-left text-sm"
        >
          <Clock3 className="text-primary size-4 shrink-0" />
          It&apos;s time for a weekly review — want to wrap up this week and set up the next one?
        </button>
      )}

      <section className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)_minmax(11rem,0.6fr)]" aria-label="Weekly calendar and statistics">
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
          dialogTitle={`Week of ${formatWeekRangeLabel(selectedWeekStart, timeZone)}`}
          dialogDescription="Set goals ahead, or wrap up how the week went — same note either way."
          cardClassName="h-76"
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
          showComparison={shouldShowPlanningComparison("week", selectedWeekStart, now, timeZone)}
          timeZone={timeZone}
        />
        <StreakSummaryCard current={currentStreak} longest={longestStreak} />
      </section>

      <div className="scrollbar-thin overflow-x-auto pb-2">
      <div className="grid min-w-[56rem] grid-cols-7 items-start gap-2">
        {selectedWeekDays.map((date) => {
          const key = dayKey(date, timeZone);
          const isToday = key === todayKey;
          const dayTasksForDate = taskList.filter((t) => t.period_start === key);
          const dayNoteForDate = noteList.find((n) => n.scope === "day" && n.date_key === key);
          const daySessionsForDate = canonicalSessions.filter((s) => dayKey(new Date(s.started_at), timeZone) === key);
          const trackedSeconds = daySessionsForDate.reduce((sum, s) => sum + sessionDurationSeconds(s, now), 0);

          return (
            <PlanningWeekDayCard
              key={key}
              date={date}
              isToday={isToday}
              tasks={dayTasksForDate}
              note={dayNoteForDate}
              projects={projectList}
              sessions={daySessionsForDate}
              trackedSeconds={trackedSeconds}
              now={now}
              timeZone={timeZone}
              onOpen={() => router.push(`/app/calendar/${key}`)}
            />
          );
        })}
      </div>
      </div>

      </div>
    </>
  );
}
