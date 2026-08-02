"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StudySession } from "@/lib/api";
import { ProjectIcon } from "@/lib/icons";
import { projectTotals, NO_PROJECT_LABEL } from "@/lib/session-stats";
import { addDays, dayKey, startOfWeek, weekKey, formatDuration, formatWeekRangeLabel } from "@/lib/date";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const chartConfig = {
  seconds: { label: "Tracked time", color: "var(--primary)" },
} satisfies ChartConfig;

export function ProjectBreakdownCard({
  sessions: sessionList,
  now,
  className,
  onSelectProject,
  period,
  compact = false,
}: {
  sessions: StudySession[];
  now: number;
  className?: string;
  onSelectProject?: (projectId: string) => void;
  period?: { kind: "day" | "week"; date: Date };
  compact?: boolean;
}) {
  const currentWeekStart = startOfWeek(new Date(now));
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentWeekStart);

  const selectedWeekKey = weekKey(selectedWeekStart);
  const scopedSessions = period?.kind === "day"
    ? sessionList.filter((session) => dayKey(new Date(session.started_at)) === dayKey(period.date))
    : period?.kind === "week"
      ? sessionList.filter((session) => weekKey(new Date(session.started_at)) === weekKey(period.date))
      : sessionList.filter((session) => weekKey(new Date(session.started_at)) === selectedWeekKey);
  const breakdown = projectTotals(scopedSessions, now);
  const totalSeconds = breakdown.reduce((sum, p) => sum + p.seconds, 0);
  const topProject = breakdown.filter((p) => p.name !== NO_PROJECT_LABEL)[0] ?? null;
  const isCurrentWeek = selectedWeekKey === weekKey(currentWeekStart);

  return (
    <Card className={cn(period && "h-64", className)}>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Layers className="text-muted-foreground size-4" />
          Project breakdown
        </CardTitle>
        {period ? (
          <span className="text-muted-foreground text-xs">
            {period.kind === "day"
              ? period.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : formatWeekRangeLabel(period.date)}
          </span>
        ) : <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={() => setSelectedWeekStart((d) => addDays(d, -7))}
          >
            <ChevronLeft />
          </Button>
          <span className="text-muted-foreground min-w-32 text-center text-sm whitespace-nowrap">
            {formatWeekRangeLabel(selectedWeekStart)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            disabled={isCurrentWeek}
            onClick={() => setSelectedWeekStart((d) => addDays(d, 7))}
          >
            <ChevronRight />
          </Button>
        </div>}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        {breakdown.length === 0 ? (
          <p className="text-muted-foreground text-sm">No sessions that {period?.kind ?? "week"}.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">
              <span className="font-medium">{formatDuration(totalSeconds)}</span>
              <span className="text-muted-foreground"> tracked</span>
              {topProject && (
                <span className="text-muted-foreground"> · mostly {topProject.name}</span>
              )}
            </p>
            {compact ? (
              <div className="space-y-3">
                {breakdown.map((project, index) => (
                  <button
                    key={project.key}
                    type="button"
                    className="group w-full space-y-1 text-left"
                    onClick={() => onSelectProject?.(String(project.key))}
                    disabled={!onSelectProject}
                  >
                    <span className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <ProjectIcon icon={project.icon} className="text-muted-foreground size-3.5 shrink-0" />
                        <span className="truncate">{project.name}</span>
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono">{formatDuration(project.seconds)}</span>
                    </span>
                    <span className="bg-muted block h-1.5 overflow-hidden rounded-full">
                      <span
                        className="bg-primary animate-in slide-in-from-left block h-full origin-left rounded-full duration-500 fill-mode-both"
                        style={{ width: `${Math.max(4, project.seconds / totalSeconds * 100)}%`, animationDelay: `${index * 70}ms` }}
                      />
                    </span>
                  </button>
                ))}
              </div>
            ) : <ChartContainer
              config={chartConfig}
              className="h-56 w-full"
              role="img"
              aria-label={`Project duration distribution for ${period?.kind === "day" ? period.date.toLocaleDateString() : formatWeekRangeLabel(period?.date ?? selectedWeekStart)}`}
            >
              <BarChart data={breakdown} layout="vertical" accessibilityLayer margin={{ left: 8 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={100}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, _name, item) => (
                        <div className="flex min-w-40 items-center justify-between gap-4">
                          <span>{item.payload.name}</span>
                          <span className="font-mono">{formatDuration(Number(value))}</span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar
                  dataKey="seconds"
                  fill="var(--color-seconds)"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive
                  animationDuration={400}
                  className={onSelectProject ? "cursor-pointer" : undefined}
                  onClick={(entry) => onSelectProject?.(String(entry.key))}
                />
              </BarChart>
            </ChartContainer>}
            {!compact && <details className="text-sm">
              <summary className="cursor-pointer font-medium">Exact project data</summary>
              <div className="mt-2 space-y-2">
                {breakdown.map((project) => (
                  <div key={project.key} className="flex justify-between gap-4">
                    <span className="flex items-center gap-1.5">
                      <ProjectIcon icon={project.icon} className="text-muted-foreground size-3.5" />
                      {project.name}
                    </span>
                    <span className="font-mono">{formatDuration(project.seconds)}</span>
                  </div>
                ))}
              </div>
            </details>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
