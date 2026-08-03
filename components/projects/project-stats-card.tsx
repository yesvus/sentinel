import { BarChart3, CalendarClock, CheckCircle2, Inbox, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDuration } from "@/lib/date";

export function ProjectStatsCard({ trackedSeconds, sessionCount, completedTaskCount, backlogCount, lastSessionStartedAt, timeZone }: {
  trackedSeconds: number;
  sessionCount: number;
  completedTaskCount: number;
  backlogCount: number;
  lastSessionStartedAt: string | null;
  timeZone?: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="text-muted-foreground size-4" />Project stats</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div><p className="text-muted-foreground flex items-center gap-1.5 text-xs"><Timer className="size-3.5" />Tracked time</p><p className="mt-1 font-mono text-3xl font-medium tracking-tight tabular-nums">{formatDuration(trackedSeconds)}</p></div>
        <Separator />
        <dl className="flex flex-col gap-4 text-sm">
          <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground flex items-center gap-1.5"><CalendarClock className="size-4" />Sessions</dt><dd className="font-mono tabular-nums">{sessionCount}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="size-4" />Completed tasks</dt><dd className="font-mono tabular-nums">{completedTaskCount}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground flex items-center gap-1.5"><Inbox className="size-4" />Backlog</dt><dd className="font-mono tabular-nums">{backlogCount}</dd></div>
        </dl>
        <Separator />
        <div><p className="text-muted-foreground text-xs">Last worked on</p><p className="mt-1 text-sm font-medium">{lastSessionStartedAt ? new Date(lastSessionStartedAt).toLocaleDateString(undefined, { timeZone, month: "short", day: "numeric", year: "numeric" }) : "No sessions yet"}</p></div>
      </CardContent>
    </Card>
  );
}
