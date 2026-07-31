"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { addDays, dayKey, formatDuration, formatWeekRangeLabel, startOfWeek, weekKey } from "@/lib/date";
import { Button } from "@/components/ui/button";

export type AllocationPoint = {
  key: string;
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
  now,
}: {
  points: AllocationPoint[];
  now: number;
}) {
  const [mode, setMode] = useState<"duration" | "percentage">("duration");
  const currentWeekStart = startOfWeek(new Date(now));
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentWeekStart);
  const pointsByDay = new Map(points.map((point) => [point.key, point]));
  const selectedPoints = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(selectedWeekStart, index);
    const key = dayKey(date);
    return pointsByDay.get(key) ?? {
      key,
      date: date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }),
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      learning: 0,
      producing: 0,
      total: 0,
    };
  });
  const isCurrentWeek = weekKey(selectedWeekStart) === weekKey(currentWeekStart);
  const data = selectedPoints.map((point) => ({
    ...point,
    learningPercent: point.total ? Math.round(point.learning / point.total * 100) : 0,
    producingPercent: point.total ? Math.round(point.producing / point.total * 100) : 0,
  }));
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Learning and Producing</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={() => setSelectedWeekStart((date) => addDays(date, -7))}
            aria-label="Previous week"
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
            onClick={() => setSelectedWeekStart((date) => addDays(date, 7))}
            aria-label="Next week"
          >
            <ChevronRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Your session allocation for the selected week. Sessions without a selection count as Learning.
          </p>
          <div className="flex gap-1" aria-label="Chart mode">
            <Button size="sm" variant={mode === "duration" ? "default" : "outline"} onClick={() => setMode("duration")}>Duration</Button>
            <Button size="sm" variant={mode === "percentage" ? "default" : "outline"} onClick={() => setMode("percentage")}>Percentage</Button>
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
                {selectedPoints.map((point) => (
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
