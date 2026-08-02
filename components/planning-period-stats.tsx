"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StudySession } from "@/lib/api";
import { addDays, dayKey, formatDuration, startOfWeek } from "@/lib/date";
import { projectTotals, sessionDurationSeconds } from "@/lib/session-stats";
import { cn } from "@/lib/utils";

const PROJECT_COLORS = [
  "var(--project-1)", "var(--project-2)", "var(--project-3)", "var(--project-4)",
  "var(--project-5)", "var(--project-6)", "var(--project-7)",
];

export function PlanningPeriodStats({
  period,
  sessions,
  previousSessions,
  now,
  date,
  className,
}: {
  period: "day" | "week";
  sessions: StudySession[];
  previousSessions: StudySession[];
  now: number;
  date: Date;
  className?: string;
}) {
  const trackedSeconds = sessions.reduce((total, session) => total + sessionDurationSeconds(session, now), 0);
  const previousTrackedSeconds = previousSessions.reduce((total, session) => total + sessionDurationSeconds(session, now), 0);
  const trackedDelta = trackedSeconds - previousTrackedSeconds;
  const comparisonLabel = period === "day" ? "yesterday" : "previous week";
  const breakdown = projectTotals(sessions, now);
  const projectColorByKey = new Map(
    breakdown.map((project, index) => [String(project.key), PROJECT_COLORS[index % PROJECT_COLORS.length]]),
  );
  const weekStart = startOfWeek(date);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const currentDate = addDays(weekStart, index);
    const daySessions = sessions.filter((session) => dayKey(new Date(session.started_at)) === dayKey(currentDate));
    const projects = projectTotals(daySessions, now);
    return {
      date: currentDate,
      projects,
      seconds: projects.reduce((total, project) => total + project.seconds, 0),
    };
  });
  const averageSeconds = Math.round(trackedSeconds / 7);
  const previousAverageSeconds = Math.round(previousTrackedSeconds / 7);
  const averageDelta = averageSeconds - previousAverageSeconds;
  const weeklyScaleSeconds = Math.max(averageSeconds, ...weekDays.map((day) => day.seconds), 1);

  return (
    <Card className={cn(period === "week" ? "h-76" : "h-60", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          {period === "day" ? "Day" : "Week"} activity
          <HelpTooltip>Tracked time split by the exact project selected for each session.</HelpTooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {period === "week" ? (
          <div className="animate-in fade-in duration-300">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="whitespace-nowrap">
                <span className="font-mono text-2xl font-medium tracking-tight tabular-nums">{formatDuration(averageSeconds)}</span>
                <span className="text-muted-foreground ml-1.5 text-xs">per day</span>
              </p>
              <span className="text-primary flex items-center gap-1 text-xs font-medium">
                {averageDelta > 0 ? <TrendingUp className="size-3.5" /> : averageDelta < 0 ? <TrendingDown className="size-3.5" /> : <Minus className="size-3.5" />}
                {averageDelta > 0 ? "+" : averageDelta < 0 ? "−" : ""}{formatDuration(Math.abs(averageDelta))} vs {comparisonLabel}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1 pr-8 text-center">
              {weekDays.map((day) => (
                <span key={dayKey(day.date)} className="text-muted-foreground text-[10px] font-medium uppercase">
                  {day.date.toLocaleDateString(undefined, { weekday: "narrow" })}
                </span>
              ))}
            </div>
            <div className="relative mt-1 h-16">
              {[25, 50, 75].map((percent) => (
                <span
                  key={percent}
                  className="border-border/60 pointer-events-none absolute right-8 left-0 border-t"
                  style={{ bottom: `${percent}%` }}
                  aria-hidden="true"
                />
              ))}
              <div
                className="border-primary/60 pointer-events-none absolute right-8 left-0 z-10 border-t border-dashed"
                style={{ bottom: `${averageSeconds / weeklyScaleSeconds * 100}%` }}
                aria-hidden="true"
              >
                <span className="bg-card text-primary absolute -top-2 left-full ml-1 px-0.5 text-[8px] font-medium uppercase">avg</span>
              </div>
              <div className="absolute top-0 right-8 bottom-0 left-0 grid grid-cols-7 gap-1">
                {weekDays.map((day, dayIndex) => (
                  <div key={dayKey(day.date)} className="flex items-end justify-center">
                    <div
                      className="activity-bar-grow flex w-6 flex-col-reverse overflow-hidden rounded-sm"
                      style={{
                        height: `${day.seconds / weeklyScaleSeconds * 100}%`,
                        animationDelay: `${dayIndex * 55}ms`,
                      }}
                    >
                      {day.projects.map((project) => (
                        <Tooltip key={project.key}>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                className="min-h-px w-full basis-0 outline-none transition-[filter] duration-150 hover:brightness-125 focus-visible:brightness-125 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                                style={{
                                  flexGrow: project.seconds,
                                  backgroundColor: projectColorByKey.get(String(project.key)) ?? PROJECT_COLORS[0],
                                }}
                                aria-label={`${day.date.toLocaleDateString(undefined, { weekday: "long" })}, ${project.name}: ${formatDuration(project.seconds)}`}
                              />
                            }
                          />
                          <TooltipContent>
                            {day.date.toLocaleDateString(undefined, { weekday: "short" })} · {project.name} · {formatDuration(project.seconds)}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1 pr-8 text-center">
              {weekDays.map((day) => (
                <span
                  key={dayKey(day.date)}
                  className="text-muted-foreground font-mono text-[9px] leading-none tabular-nums"
                  title={`${day.date.toLocaleDateString()}: ${formatDuration(day.seconds)}`}
                >
                  {day.seconds > 0 ? formatDuration(day.seconds) : "—"}
                </span>
              ))}
            </div>

            <div className="mt-2 border-t pt-2">
              <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-1">
                {breakdown.map((project, index) => (
                  <div key={project.key} className="w-24 shrink-0">
                    <p className="truncate text-xs font-medium" style={{ color: PROJECT_COLORS[index % PROJECT_COLORS.length] }} title={project.name}>
                      {project.name}
                    </p>
                    <p className="mt-0.5 font-mono text-xs tabular-nums">{formatDuration(project.seconds)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-4 border-t pt-2 text-xs">
                <span className="text-muted-foreground">Weekly total</span>
                <span className="font-mono tabular-nums">{formatDuration(trackedSeconds)}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
        <div className="animate-in fade-in slide-in-from-bottom-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 duration-300">
            <p className="whitespace-nowrap font-mono text-3xl font-medium tracking-tight tabular-nums">{formatDuration(trackedSeconds)}</p>
            <span className="text-primary flex items-center gap-1 text-sm font-medium">
              {trackedDelta > 0 ? <TrendingUp className="size-3.5" /> : trackedDelta < 0 ? <TrendingDown className="size-3.5" /> : <Minus className="size-3.5" />}
              {trackedDelta > 0 ? "+" : trackedDelta < 0 ? "−" : ""}{formatDuration(Math.abs(trackedDelta))} vs {comparisonLabel}
            </span>
        </div>

        <div className="mt-3">
          <div className="bg-muted/60 flex h-4 w-full overflow-hidden rounded-md" role="list" aria-label="Time by project">
            {breakdown.map((project, index) => {
              const share = trackedSeconds ? project.seconds / trackedSeconds * 100 : 0;
              return (
                <Tooltip key={project.key}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        role="listitem"
                        className="animate-in slide-in-from-left h-full min-w-1 basis-0 origin-left outline-none transition-[filter,transform] duration-200 hover:brightness-125 focus-visible:brightness-125 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        style={{
                          flexGrow: project.seconds,
                          backgroundColor: PROJECT_COLORS[index % PROJECT_COLORS.length],
                          animationDelay: `${index * 70}ms`,
                        }}
                        aria-label={`${project.name}: ${formatDuration(project.seconds)}, ${Math.round(share)} percent`}
                      />
                    }
                  />
                  <TooltipContent>
                    <div className="flex min-w-40 items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: PROJECT_COLORS[index % PROJECT_COLORS.length] }} />
                        {project.name}
                      </span>
                      <span className="font-mono">{formatDuration(project.seconds)} · {Math.round(share)}%</span>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          {breakdown.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-xs">No tracked projects in this {period} yet.</p>
          ) : (
            <div className="scrollbar-thin -mx-1 mt-3 flex gap-4 overflow-x-auto overscroll-x-contain px-1 pb-2">
              {breakdown.map((project, index) => (
                <div key={project.key} className="w-24 shrink-0">
                  <p className="truncate text-xs font-medium" style={{ color: PROJECT_COLORS[index % PROJECT_COLORS.length] }} title={project.name}>
                    {project.name}
                  </p>
                  <p className="mt-0.5 font-mono text-xs tabular-nums">{formatDuration(project.seconds)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
