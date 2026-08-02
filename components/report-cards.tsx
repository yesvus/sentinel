"use client";

import { CalendarRange } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StudySession, Note } from "@/lib/api";
import { NoteEditor } from "@/components/note-editor";
import { dailyAllocationTotals, dailyTotals, projectTotals, NO_PROJECT_LABEL } from "@/lib/session-stats";
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
  const todayKey = dayKey(today);

  const totalsByDay = dailyTotals(sessionList, now);

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
  const weekAllocation = Array.from(dailyAllocationTotals(weekSessions, now).values())
    .reduce(
      (total, day) => ({
        learning: total.learning + day.learning,
        producing: total.producing + day.producing,
        total: total.total + day.total,
      }),
      { learning: 0, producing: 0, total: 0 },
    );
  const learningPercent = weekAllocation.total
    ? Math.round(weekAllocation.learning / weekAllocation.total * 100)
    : 0;
  const producingPercent = weekAllocation.total
    ? Math.round(weekAllocation.producing / weekAllocation.total * 100)
    : 0;

  const weekNote = notes.find((n) => n.scope === "week" && n.date_key === currentWeekKey);

  return (
      <Card className="w-full">
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

          <div className="space-y-2">
            <div className="flex justify-between gap-3 text-xs">
              <span>Learning {learningPercent}% · {formatDuration(weekAllocation.learning)}</span>
              <span>Producing {producingPercent}% · {formatDuration(weekAllocation.producing)}</span>
            </div>
            <div className="bg-muted flex h-3 overflow-hidden rounded-full" role="img" aria-label="This week Learning and Producing allocation">
              <span style={{ width: `${learningPercent}%`, backgroundColor: "var(--data-learning)" }} />
              <span style={{ width: `${producingPercent}%`, backgroundColor: "var(--data-producing)" }} />
            </div>
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
  );
}
