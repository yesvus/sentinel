"use client";

import { useState } from "react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { StudySession } from "@/lib/api";
import { addDays, formatDuration, startOfWeek, weekKey } from "@/lib/date";
import { medianCompletedSessionSeconds, sessionDurationSeconds } from "@/lib/session-stats";

const config = {
  value: { label: "Value", color: "#0e7490" },
} satisfies ChartConfig;

type Metric = "total" | "median" | "days";

export function WeeklyTrendChart({ sessions, now }: { sessions: StudySession[]; now: number }) {
  const [metric, setMetric] = useState<Metric>("total");
  const currentStart = startOfWeek(new Date(now));
  const points = Array.from({ length: 12 }, (_, index) => {
    const start = addDays(currentStart, (index - 11) * 7);
    const key = weekKey(start);
    const weekSessions = sessions.filter((session) => weekKey(new Date(session.started_at)) === key);
    const total = weekSessions.reduce((sum, session) => sum + sessionDurationSeconds(session, now), 0);
    const median = medianCompletedSessionSeconds(weekSessions) ?? 0;
    const days = new Set(
      weekSessions.filter((session) => session.ended_at).map((session) =>
        new Date(session.started_at).toLocaleDateString("en-CA")),
    ).size;
    return {
      key,
      label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      total,
      median,
      days,
      partial: index === 11,
    };
  });
  const chartData = points.map((point) => ({ ...point, value: point[metric] }));
  const metricLabel = metric === "total" ? "Total duration" : metric === "median" ? "Median session" : "Active days";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly trend</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1" aria-label="Weekly trend metric">
          {([
            ["total", "Total"],
            ["median", "Median session"],
            ["days", "Active days"],
          ] as const).map(([value, label]) => (
            <Button key={value} size="sm" variant={metric === value ? "default" : "outline"} onClick={() => setMetric(value)}>
              {label}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-sm">
          {metricLabel} over 12 weeks. The current week is partial.
        </p>
        <ChartContainer config={config} className="h-64 w-full" role="img" aria-label={`${metricLabel} over the last 12 weeks`}>
          <LineChart data={chartData} accessibilityLayer margin={{ left: 8, right: 16 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis
              width={46}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => metric === "days" ? String(value) : value ? `${Math.round(Number(value) / 3600)}h` : "0"}
              allowDecimals={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => (
                    <div className="flex min-w-40 items-center justify-between gap-4">
                      <span>{item.payload.partial ? `${metricLabel} (partial)` : metricLabel}</span>
                      <span className="font-mono">{metric === "days" ? `${value} days` : formatDuration(Number(value))}</span>
                    </div>
                  )}
                />
              }
            />
            <Line dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ChartContainer>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Exact weekly data</summary>
          <div className="mt-2 space-y-1">
            {points.map((point) => (
              <div key={point.key} className="flex justify-between border-b py-1 last:border-0">
                <span>{point.label}{point.partial ? " (partial)" : ""}</span>
                <span>{metric === "days" ? `${point.days} days` : formatDuration(point[metric])}</span>
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
