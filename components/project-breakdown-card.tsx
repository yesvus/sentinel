"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StudySession } from "@/lib/api";
import { ProjectIcon } from "@/lib/icons";
import { projectTotals, NO_PROJECT_LABEL } from "@/lib/session-stats";
import { addDays, startOfWeek, weekKey, formatDuration, formatWeekRangeLabel } from "@/lib/date";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const chartConfig = {
  seconds: { label: "Tracked time", color: "#0e7490" },
} satisfies ChartConfig;

export function ProjectBreakdownCard({
  sessions: sessionList,
  now,
  className,
  onSelectRoot,
}: {
  sessions: StudySession[];
  now: number;
  className?: string;
  onSelectRoot?: (rootId: string) => void;
}) {
  const currentWeekStart = startOfWeek(new Date(now));
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentWeekStart);

  const selectedWeekKey = weekKey(selectedWeekStart);
  const weekSessions = sessionList.filter((s) => weekKey(new Date(s.started_at)) === selectedWeekKey);
  const breakdown = projectTotals(weekSessions, now);
  const totalSeconds = breakdown.reduce((sum, p) => sum + p.seconds, 0);
  const topProject = breakdown.filter((p) => p.name !== NO_PROJECT_LABEL)[0] ?? null;
  const isCurrentWeek = selectedWeekKey === weekKey(currentWeekStart);

  return (
    <Card className={className}>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Layers className="text-muted-foreground size-4" />
          Project breakdown
        </CardTitle>
        <div className="flex items-center gap-1">
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
        </div>
      </CardHeader>
      <CardContent>
        {breakdown.length === 0 ? (
          <p className="text-muted-foreground text-sm">No sessions that week.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">
              <span className="font-medium">{formatDuration(totalSeconds)}</span>
              <span className="text-muted-foreground"> tracked</span>
              {topProject && (
                <span className="text-muted-foreground"> · mostly {topProject.name}</span>
              )}
            </p>
            <ChartContainer
              config={chartConfig}
              className="h-56 w-full"
              role="img"
              aria-label={`Root project duration distribution for ${formatWeekRangeLabel(selectedWeekStart)}`}
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
                  isAnimationActive={false}
                  className={onSelectRoot ? "cursor-pointer" : undefined}
                  onClick={(entry) => onSelectRoot?.(String(entry.key))}
                />
              </BarChart>
            </ChartContainer>
            <details className="text-sm">
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
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
