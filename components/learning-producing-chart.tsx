"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatDuration } from "@/lib/date";
import { Button } from "@/components/ui/button";

export type AllocationPoint = {
  date: string;
  label: string;
  learning: number;
  producing: number;
  total: number;
};

const config = {
  learning: { label: "Learning", color: "#0e7490" },
  producing: { label: "Producing", color: "#f59e0b" },
  learningPercent: { label: "Learning", color: "#0e7490" },
  producingPercent: { label: "Producing", color: "#f59e0b" },
} satisfies ChartConfig;

export function LearningProducingChart({
  points,
  thisWeekPoints,
  rangeLabel = "the selected range",
}: {
  points: AllocationPoint[];
  thisWeekPoints?: AllocationPoint[];
  rangeLabel?: string;
}) {
  const [mode, setMode] = useState<"duration" | "percentage">("duration");
  const [range, setRange] = useState<"sevenDays" | "thisWeek">("sevenDays");
  const visiblePoints = range === "thisWeek" && thisWeekPoints ? thisWeekPoints : points;
  const visibleRangeLabel = range === "thisWeek" ? "this week" : rangeLabel;
  const data = visiblePoints.map((point) => ({
    ...point,
    learningPercent: point.total ? Math.round(point.learning / point.total * 100) : 0,
    producingPercent: point.total ? Math.round(point.producing / point.total * 100) : 0,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Learning and Producing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Your session allocation over {visibleRangeLabel}. Sessions without a selection count as Learning.
          </p>
          <div className="flex flex-wrap gap-3">
            {thisWeekPoints && (
              <div className="flex gap-1" aria-label="Chart period">
                <Button size="sm" variant={range === "sevenDays" ? "default" : "outline"} onClick={() => setRange("sevenDays")}>Last 7 days</Button>
                <Button size="sm" variant={range === "thisWeek" ? "default" : "outline"} onClick={() => setRange("thisWeek")}>This week</Button>
              </div>
            )}
            <div className="flex gap-1" aria-label="Chart mode">
              <Button size="sm" variant={mode === "duration" ? "default" : "outline"} onClick={() => setMode("duration")}>Duration</Button>
              <Button size="sm" variant={mode === "percentage" ? "default" : "outline"} onClick={() => setMode("percentage")}>Percentage</Button>
            </div>
          </div>
        </div>
        <ChartContainer
          config={config}
          className="h-64 w-full"
          role="img"
          aria-label="Stacked daily Learning and Producing duration chart"
        >
          <BarChart data={data} accessibilityLayer margin={{ left: 8, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis
              width={46}
              tickLine={false}
              axisLine={false}
              domain={mode === "percentage" ? [0, 100] : undefined}
              tickFormatter={(value) => mode === "percentage"
                ? `${value}%`
                : value ? `${Math.round(Number(value) / 3600)}h` : "0"}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) => (
                    <div className="flex min-w-36 items-center justify-between gap-4">
                      <span>{config[name as keyof typeof config]?.label}</span>
                      <span className="font-mono">
                        {mode === "percentage" ? `${value}%` : `${formatDuration(Number(value))} (${item.payload.total ? Math.round(Number(value) / item.payload.total * 100) : 0}%)`}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey={mode === "duration" ? "learning" : "learningPercent"} name="learning" stackId="duration" fill="var(--color-learning)" radius={[0, 0, 3, 3]} isAnimationActive={false} />
            <Bar dataKey={mode === "duration" ? "producing" : "producingPercent"} name="producing" stackId="duration" fill="var(--color-producing)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Exact data</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Date</th>
                  <th className="py-2">Learning</th>
                  <th className="py-2">Producing</th>
                  <th className="py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {visiblePoints.map((point) => (
                  <tr key={point.date} className="border-b last:border-0">
                    <td className="py-2">{point.date}</td>
                    <td>{formatDuration(point.learning)}</td>
                    <td>{formatDuration(point.producing)}</td>
                    <td>{formatDuration(point.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
