import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Download } from "lucide-react";
import type { StudySession } from "@/lib/api";
import type { HistoryDayGroup, HistoryWeekGroup } from "@/lib/history";
import { formatDayLabel, formatDuration, formatWeekRangeLabel } from "@/lib/date";
import { HistorySessionRow } from "@/components/history/history-session-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function HistoryList({
  weeks,
  now,
  timeZone,
  onCopyWeekPrompt,
  onCopyPrompt,
  onExportDay,
  onExportWeek,
  onEdit,
  onDelete,
}: {
  weeks: HistoryWeekGroup[];
  now: number;
  timeZone?: string;
  onCopyWeekPrompt: (week: HistoryWeekGroup) => void;
  onCopyPrompt: (day: HistoryDayGroup, week: HistoryWeekGroup) => void;
  onExportDay: (day: HistoryDayGroup) => void;
  onExportWeek: (week: HistoryWeekGroup) => void;
  onEdit: (session: StudySession) => void;
  onDelete: (id: number) => void;
}) {
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(new Set());

  function toggleWeek(key: string) {
    setCollapsedWeeks((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {weeks.map((week) => {
        const collapsed = collapsedWeeks.has(week.key);
        return (
          <Card key={week.key} size="sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                aria-expanded={!collapsed}
                onClick={() => toggleWeek(week.key)}
                className="focus-visible:ring-ring/50 -ml-1 flex min-w-0 items-center gap-2 rounded-md p-1 text-left outline-none focus-visible:ring-3"
              >
                {collapsed ? (
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                ) : (
                  <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                )}
                <span className="truncate font-medium">{formatWeekRangeLabel(week.weekStart, timeZone)}</span>
                <span className="bg-background text-muted-foreground ring-foreground/10 rounded-full px-2 py-0.5 font-mono text-xs ring-1">
                  {formatDuration(week.totalSeconds)}
                </span>
                <span className="text-muted-foreground hidden text-xs sm:inline">
                  {week.sessions.length} {week.sessions.length === 1 ? "session" : "sessions"}
                </span>
              </button>
              <div className="flex items-center">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button aria-label={`Copy AI prompt for ${formatWeekRangeLabel(week.weekStart, timeZone)}`} variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => onCopyWeekPrompt(week)}>
                        <Copy />
                      </Button>
                    }
                  />
                  <TooltipContent>Copy an AI review prompt for this week</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button aria-label={`Export ${formatWeekRangeLabel(week.weekStart, timeZone)}`} variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => onExportWeek(week)}>
                        <Download />
                      </Button>
                    }
                  />
                  <TooltipContent>Export this week as CSV</TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            {!collapsed && (
              <CardContent className="animate-in fade-in space-y-5 duration-150">
                {week.days.map((day) => (
                  <section key={day.key} className="space-y-2.5" aria-label={formatDayLabel(day.date, new Date(now), timeZone)}>
                    <div className="bg-muted/20 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{formatDayLabel(day.date, new Date(now), timeZone)}</span>
                        <span className="text-muted-foreground font-mono text-xs">{formatDuration(day.totalSeconds)}</span>
                        <span className="text-muted-foreground text-xs">{day.sessions.length} {day.sessions.length === 1 ? "session" : "sessions"}</span>
                      </div>
                      <div className="flex items-center">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button aria-label={`Copy AI prompt for ${formatDayLabel(day.date, new Date(now), timeZone)}`} variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => onCopyPrompt(day, week)}>
                                <Copy />
                              </Button>
                            }
                          />
                          <TooltipContent>Copy an AI review prompt for this day</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button aria-label={`Export ${formatDayLabel(day.date, new Date(now), timeZone)}`} variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => onExportDay(day)}>
                                <Download />
                              </Button>
                            }
                          />
                          <TooltipContent>Export this day as CSV</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {day.sessions.map((session) => (
                        <HistorySessionRow key={session.id} session={session} now={now} timeZone={timeZone} onEdit={onEdit} onDelete={onDelete} />
                      ))}
                    </div>
                  </section>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
