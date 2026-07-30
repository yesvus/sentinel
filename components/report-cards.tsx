"use client";

import { CalendarDays, CalendarRange } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StudySession, Note } from "@/lib/api";
import { NoteEditor } from "@/components/note-editor";
import {
  activityStreak,
  dailyAllocationTotals,
  dailyTotals,
  medianCompletedSessionSeconds,
  projectTotals,
  NO_PROJECT_LABEL,
} from "@/lib/session-stats";
import {
  dayKey,
  addDays,
  startOfWeek,
  weekKey,
  formatDuration,
  formatWeekRangeLabel,
  periodComparison,
} from "@/lib/date";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ComparisonLine({ diff, percent, previousLabel }: { diff: number; percent: number | null; previousLabel: string }) {
  if (diff === 0 && percent === 0) {
    return <p className="text-muted-foreground text-xs">Same as {previousLabel}</p>;
  }
  const sign = diff > 0 ? "+" : "-";
  const magnitude = formatDuration(Math.abs(diff));
  const percentText = percent === null ? "" : ` (${diff > 0 ? "+" : ""}${percent}%)`;
  return (
    <p className="text-muted-foreground text-xs">
      {sign}
      {magnitude}
      {percentText} vs {previousLabel}
    </p>
  );
}

export function ReportCards({
  sessions: sessionList,
  notes,
  now,
  onNoteSaved,
  onNoteDeleted,
}: {
  sessions: StudySession[];
  notes: Note[];
  now: number;
  onNoteSaved: (note: Note) => void;
  onNoteDeleted: (scope: "day" | "week", dateKey: string) => void;
}) {
  const today = new Date(now);
  const yesterday = addDays(today, -1);
  const todayKey = dayKey(today);
  const yesterdayKey = dayKey(yesterday);

  const totalsByDay = dailyTotals(sessionList, now);
  const todaySeconds = totalsByDay.get(todayKey) ?? 0;
  const yesterdaySeconds = totalsByDay.get(yesterdayKey) ?? 0;
  const todayComparison = periodComparison(todaySeconds, yesterdaySeconds);
  const todaySessionCount = sessionList.filter((s) => dayKey(new Date(s.started_at)) === todayKey).length;

  const currentWeekStart = startOfWeek(today);
  const currentWeekKey = weekKey(today);
  const previousWeekStart = addDays(currentWeekStart, -7);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const weekDaySeconds = weekDays.map((d) => totalsByDay.get(dayKey(d)) ?? 0);
  const weekSeconds = weekDaySeconds.reduce((sum, s) => sum + s, 0);
  const previousWeekSeconds = Array.from({ length: 7 }, (_, i) => addDays(previousWeekStart, i))
    .map((d) => totalsByDay.get(dayKey(d)) ?? 0)
    .reduce((sum, s) => sum + s, 0);
  const weekComparison = periodComparison(weekSeconds, previousWeekSeconds);
  const activeDaysThisWeek = weekDaySeconds.filter((s) => s > 0).length;
  const maxWeekDaySeconds = Math.max(1, ...weekDaySeconds);

  const weekSessions = sessionList.filter((s) => weekKey(new Date(s.started_at)) === currentWeekKey);
  const topWeekProject = projectTotals(weekSessions, now).filter((p) => p.name !== NO_PROJECT_LABEL)[0] ?? null;

  const todayNote = notes.find((n) => n.scope === "day" && n.date_key === todayKey);
  const weekNote = notes.find((n) => n.scope === "week" && n.date_key === currentWeekKey);
  const previousWeekKey = weekKey(previousWeekStart);
  const previousWeekSessions = sessionList.filter(
    (session) => weekKey(new Date(session.started_at)) === previousWeekKey,
  );
  const previousMedian = medianCompletedSessionSeconds(previousWeekSessions);
  const previousAllocation = Array.from(dailyAllocationTotals(previousWeekSessions, now).values())
    .reduce(
      (total, day) => ({
        learning: total.learning + day.learning,
        producing: total.producing + day.producing,
        total: total.total + day.total,
      }),
      { learning: 0, producing: 0, total: 0 },
    );
  const previousActiveDays = new Set(previousWeekSessions.filter((session) => session.ended_at).map(
    (session) => dayKey(new Date(session.started_at)),
  )).size;
  const previousTopProject = projectTotals(previousWeekSessions, now)[0] ?? null;
  const streak = activityStreak(sessionList, today);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="text-muted-foreground size-4" />
            Today
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-2xl font-semibold">{formatDuration(todaySeconds)}</p>
            <ComparisonLine diff={todayComparison.diff} percent={todayComparison.percent} previousLabel="yesterday" />
          </div>
          <p className="text-muted-foreground text-sm">
            {todaySessionCount === 0
              ? "No sessions yet today."
              : `${todaySessionCount} session${todaySessionCount === 1 ? "" : "s"} today.`}
          </p>
          <NoteEditor
            scope="day"
            dateKey={todayKey}
            note={todayNote}
            label="today"
            onSaved={onNoteSaved}
            onDeleted={() => onNoteDeleted("day", todayKey)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="text-muted-foreground size-4" />
            This week
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-muted-foreground text-xs">{formatWeekRangeLabel(currentWeekStart)}</p>
            <p className="text-2xl font-semibold">{formatDuration(weekSeconds)}</p>
            <ComparisonLine diff={weekComparison.diff} percent={weekComparison.percent} previousLabel="last week" />
          </div>

          <p className="text-muted-foreground text-sm">
            Active {activeDaysThisWeek} day{activeDaysThisWeek === 1 ? "" : "s"} this week
            {topWeekProject ? ` · mostly ${topWeekProject.name}` : ""}
          </p>

          <div className="flex h-16 items-end gap-1.5">
            {weekDays.map((d, i) => {
              const isToday = dayKey(d) === todayKey;
              return (
                <Tooltip key={dayKey(d)}>
                  <TooltipTrigger
                    render={
                      <div className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                        <div
                          className={`min-h-[2px] w-full rounded-t-sm ${isToday ? "bg-primary" : "bg-primary/50"}`}
                          style={{ height: `${(weekDaySeconds[i] / maxWeekDaySeconds) * 100}%` }}
                        />
                        <span className="text-muted-foreground text-[10px]">{WEEKDAY_SHORT[i]}</span>
                      </div>
                    }
                  />
                  <TooltipContent>
                    {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}:{" "}
                    {weekDaySeconds[i] > 0 ? formatDuration(weekDaySeconds[i]) : "no study"}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <NoteEditor
            scope="week"
            dateKey={currentWeekKey}
            note={weekNote}
            label="this week"
            onSaved={onNoteSaved}
            onDeleted={() => onNoteDeleted("week", currentWeekKey)}
          />
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Last week’s report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{formatWeekRangeLabel(previousWeekStart)}</p>
          {previousWeekSessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No completed activity was recorded. A fresh week is ready when you are.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-muted-foreground text-xs">Total</p><p className="text-xl font-semibold">{formatDuration(previousWeekSeconds)}</p></div>
                <div><p className="text-muted-foreground text-xs">Active days</p><p className="text-xl font-semibold">{previousActiveDays}</p></div>
                <div><p className="text-muted-foreground text-xs">Median session</p><p className="text-xl font-semibold">{previousMedian === null ? "—" : formatDuration(previousMedian)}</p></div>
                <div><p className="text-muted-foreground text-xs">Current streak</p><p className="text-xl font-semibold">{streak} day{streak === 1 ? "" : "s"}</p></div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Learning {previousAllocation.total ? Math.round(previousAllocation.learning / previousAllocation.total * 100) : 0}%</span>
                  <span>Producing {previousAllocation.total ? Math.round(previousAllocation.producing / previousAllocation.total * 100) : 0}%</span>
                </div>
                <div className="bg-muted flex h-3 overflow-hidden rounded-full" aria-label="Last week Learning and Producing allocation">
                  <span style={{ width: `${previousAllocation.total ? previousAllocation.learning / previousAllocation.total * 100 : 0}%`, backgroundColor: "#0e7490" }} />
                  <span style={{ width: `${previousAllocation.total ? previousAllocation.producing / previousAllocation.total * 100 : 0}%`, backgroundColor: "#f59e0b" }} />
                </div>
              </div>
              <p className="text-muted-foreground text-sm">
                {previousTopProject
                  ? `Most tracked time belonged to ${previousTopProject.name}.`
                  : `You were active on ${previousActiveDays} day${previousActiveDays === 1 ? "" : "s"}.`}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
