"use client";

import { Hourglass } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StudySession } from "@/lib/api";
import { addDays, dayKey, formatDuration, startOfDay, weekdayInTimeZone } from "@/lib/date";
import { dailyTotals } from "@/lib/session-stats";

const WEEKS = 14;
const DAYS = WEEKS * 7;
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type Day = { key: string; date: Date; seconds: number };

function intensityColor(seconds: number) {
  if (seconds === 0) return undefined;
  if (seconds < 30 * 60) return "var(--activity-1)";
  if (seconds < 60 * 60) return "var(--activity-2)";
  if (seconds < 120 * 60) return "var(--activity-3)";
  return "var(--activity-4)";
}

function buildLastNDays(totalsByDay: Map<string, number>, now: number, timeZone?: string): Day[] {
  const today = startOfDay(new Date(now), timeZone);
  return Array.from({ length: DAYS }, (_, index) => {
    const date = addDays(today, -(DAYS - 1 - index), timeZone);
    const key = dayKey(date, timeZone);
    return { key, date, seconds: totalsByDay.get(key) ?? 0 };
  });
}

function buildHeatmapWeeks(days: Day[], timeZone?: string) {
  const padded: (Day | null)[] = Array(weekdayInTimeZone(days[0].date, timeZone)).fill(null).concat(days);
  const weeks: (Day | null)[][] = [];
  for (let index = 0; index < padded.length; index += 7) weeks.push(padded.slice(index, index + 7));
  return weeks;
}

function monthLabelForWeek(week: (Day | null)[], previousWeek: (Day | null)[] | undefined, timeZone?: string) {
  const firstDay = week.find(Boolean);
  if (!firstDay) return "";
  const previousFirstDay = previousWeek?.find(Boolean);
  const month = Number(dayKey(firstDay.date, timeZone).slice(5, 7)) - 1;
  const previousMonth = previousFirstDay ? Number(dayKey(previousFirstDay.date, timeZone).slice(5, 7)) - 1 : null;
  if (previousMonth === month) return "";
  return MONTH_LABELS[month];
}

export function ActivityHeatmap({ sessions, now, timeZone }: { sessions: StudySession[]; now: number; timeZone?: string }) {
  const days = buildLastNDays(dailyTotals(sessions, now, timeZone), now, timeZone);
  const weeks = buildHeatmapWeeks(days, timeZone);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hourglass className="text-muted-foreground size-4" />
          Activity
          <HelpTooltip>Study time over the last {WEEKS} weeks.</HelpTooltip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-1 pl-8">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="text-muted-foreground w-3.5 shrink-0 text-[10px] whitespace-nowrap">
                {monthLabelForWeek(week, weeks[weekIndex - 1], timeZone)}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1" role="grid" aria-label="Activity over the last 14 weeks">
            <div className="flex w-7 shrink-0 flex-col gap-1">
              {WEEKDAY_LABELS.map((label, index) => (
                <div key={index} className="text-muted-foreground h-3.5 text-[10px] leading-3.5">{label}</div>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((day, dayIndex) => day ? (
                  <Tooltip key={day.key}>
                    <TooltipTrigger
                      render={
                        <div
                          className="bg-muted size-3.5 rounded-sm transition-transform duration-150 hover:scale-125 focus-visible:scale-125"
                          style={{ backgroundColor: intensityColor(day.seconds) }}
                          tabIndex={0}
                          role="gridcell"
                          aria-label={`${day.date.toLocaleDateString(undefined, { timeZone })}: ${day.seconds > 0 ? formatDuration(day.seconds) : "no activity"}`}
                        />
                      }
                    />
                    <TooltipContent>
                      {day.date.toLocaleDateString(undefined, { timeZone, month: "short", day: "numeric" })}: {day.seconds > 0 ? formatDuration(day.seconds) : "no study"}
                    </TooltipContent>
                  </Tooltip>
                ) : <div key={dayIndex} className="size-3.5" />)}
              </div>
            ))}
          </div>
        </div>
        <div className="text-muted-foreground mt-2 flex items-center gap-1.5 pl-8 text-[10px]">
          <span>Less</span>
          <div className="bg-muted size-3 rounded-sm" />
          <div className="size-3 rounded-sm" style={{ backgroundColor: "var(--activity-1)" }} />
          <div className="size-3 rounded-sm" style={{ backgroundColor: "var(--activity-2)" }} />
          <div className="size-3 rounded-sm" style={{ backgroundColor: "var(--activity-3)" }} />
          <div className="size-3 rounded-sm" style={{ backgroundColor: "var(--activity-4)" }} />
          <span>More</span>
        </div>
      </CardContent>
    </Card>
  );
}
