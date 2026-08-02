"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock3, Copy, Square, SquareCheck, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "@/components/ui/toast";
import { buildWeeklyAiPrompt } from "@/lib/export";
import { weekStatsFor, sessionDurationSeconds } from "@/lib/session-stats";
import { useAuth } from "@/lib/auth-context";
import { PageHeaderActions } from "@/lib/page-header-actions-context";
import { dayKey, addDays, startOfWeek, formatDuration, formatWeekRangeLabel, parseDateKey } from "@/lib/date";

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
    const from = addDays(new Date(), -35).toISOString();
    Promise.all([tasksApi.list(), notesApi.list(), sessionsApi.list({ from }), projectsApi.list()])
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
      router.replace(`/app/plan/${legacyDay}`);
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
        <div className="w-full space-y-4">
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
      <div className="animate-in fade-in duration-500 fill-mode-both w-full space-y-4">
      {showDailyReminder && (
        <button
          type="button"
          onClick={() => router.push(`/app/plan/${tomorrowKey}`)}
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

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <NoteFocusCard
          icon={null}
          title="Week goals"
          titleExtra={<span className="text-base font-medium">{selectedWeekLabel}</span>}
          scope="week"
          dateKey={selectedWeekKey}
          note={selectedWeekNote}
          emptyText="No goals set for this week yet — click to add some."
          placeholder="What are you aiming for this week? Vague is fine — e.g. finish chapters 1-4 of Probability. This is also where you wrap up how the week went."
          dialogTitle={`Week of ${formatWeekRangeLabel(selectedWeekStart)}`}
          dialogDescription="Plan ahead, or wrap up how the week went — same note either way."
          dialogHeaderActions={
            <Button variant="outline" size="icon-sm" aria-label="Copy AI prompt" onClick={copySelectedWeeklyPrompt}>
              <Copy className="size-3.5" />
            </Button>
          }
          onSaved={handleNoteSaved}
          onDeleted={() => handleNoteDeleted("week", selectedWeekKey)}
        />

        <NoteFocusCard
          icon={<Target className="text-muted-foreground size-4" />}
          title="Long-term goals"
          scope="long-term"
          dateKey={LONG_TERM_NOTE_KEY}
          note={longTermNote}
          emptyText="Where are you trying to get to? Click to add goals."
          placeholder="Where are you trying to get to? e.g. Get Sentinel to 100 active users, get comfortable with Rust..."
          dialogTitle="Long-term goals"
          dialogDescription="Standing goals — not tied to any week. Shown as context in every AI review."
          onSaved={handleNoteSaved}
          onDeleted={() => handleNoteDeleted("long-term", LONG_TERM_NOTE_KEY)}
        />
      </div>

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
            <button
              key={key}
              type="button"
              onClick={() => router.push(`/app/plan/${key}`)}
              className={`hover:border-primary/40 hover:bg-muted/30 flex min-h-40 min-w-0 flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97] ${
                isToday ? "border-primary/50 bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex w-full items-center justify-between gap-1">
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
                <p className="text-muted-foreground w-full text-xs whitespace-pre-wrap">{dayNoteForDate.content}</p>
              )}
            </button>
          );
        })}
      </div>

      </div>
    </>
  );
}
