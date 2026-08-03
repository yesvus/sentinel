import { Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/date";

type DayPlanningHeaderProps = {
  selectedDate: Date;
  isToday: boolean;
  openTaskCount: number;
  sessionCount: number;
  totalSessionSeconds: number;
  onCopyPrompt: () => void;
  timeZone?: string;
};

export function DayPlanningHeader({
  selectedDate,
  isToday,
  openTaskCount,
  sessionCount,
  totalSessionSeconds,
  onCopyPrompt,
  timeZone,
}: DayPlanningHeaderProps) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            {selectedDate.toLocaleDateString(undefined, { timeZone, weekday: "long", month: "long", day: "numeric" })}
          </h2>
          {isToday && <Badge>Today</Badge>}
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <span>{openTaskCount} {openTaskCount === 1 ? "task" : "tasks"} left</span>
          <span aria-hidden="true">·</span>
          <span>{sessionCount} {sessionCount === 1 ? "session" : "sessions"}</span>
          {totalSessionSeconds > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{formatDuration(totalSessionSeconds)} tracked</span>
            </>
          )}
        </div>
      </div>
      <Button variant="outline" onClick={onCopyPrompt}>
        <Copy data-icon="inline-start" />
        Copy AI prompt
      </Button>
    </div>
  );
}
