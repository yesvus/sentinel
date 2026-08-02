import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Download } from "lucide-react";
import type { StudySession } from "@/lib/api";
import type { HistoryDayGroup, HistoryWeekGroup } from "@/lib/history";
import { formatDayLabel, formatDuration, formatWeekRangeLabel } from "@/lib/date";
import { HistorySessionRow } from "@/components/history/history-session-row";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function HistoryList({
  weeks,
  now,
  onCopyPrompt,
  onExportDay,
  onExportWeek,
  onEdit,
  onDelete,
}: {
  weeks: HistoryWeekGroup[];
  now: number;
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
    <div className="space-y-6">
      {weeks.map((week) => {
        const collapsed = collapsedWeeks.has(week.key);
        return (
          <div key={week.key} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2">
              <button type="button" onClick={() => toggleWeek(week.key)} className="flex items-center gap-1.5 text-left">
                {collapsed ? (
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                ) : (
                  <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                )}
                <span className="font-medium">{formatWeekRangeLabel(week.weekStart)}</span>
                <span className="text-muted-foreground font-mono text-xs">{formatDuration(week.totalSeconds)}</span>
              </button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => onExportWeek(week)}>
                      <Download />
                    </Button>
                  }
                />
                <TooltipContent>Export this week as CSV</TooltipContent>
              </Tooltip>
            </div>
            {!collapsed && (
              <div className="animate-in fade-in space-y-4 pl-5 duration-150">
                {week.days.map((day) => (
                  <div key={day.key} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{formatDayLabel(day.date)}</span>
                        <span className="text-muted-foreground font-mono text-xs">{formatDuration(day.totalSeconds)}</span>
                      </div>
                      <div className="flex items-center">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => onCopyPrompt(day, week)}>
                                <Copy />
                              </Button>
                            }
                          />
                          <TooltipContent>Copy an AI review prompt for this day</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => onExportDay(day)}>
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
                        <HistorySessionRow key={session.id} session={session} now={now} onEdit={onEdit} onDelete={onDelete} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
