"use client";

import { useState } from "react";
import { Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StudySession } from "@/lib/api";
import { ProjectIcon } from "@/lib/icons";
import { projectTotals, NO_PROJECT_LABEL } from "@/lib/session-stats";
import { addDays, startOfWeek, weekKey, formatDuration, formatWeekRangeLabel } from "@/lib/date";

export function ProjectBreakdownCard({ sessions: sessionList, now }: { sessions: StudySession[]; now: number }) {
  const currentWeekStart = startOfWeek(new Date(now));
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentWeekStart);

  const selectedWeekKey = weekKey(selectedWeekStart);
  const weekSessions = sessionList.filter((s) => weekKey(new Date(s.started_at)) === selectedWeekKey);
  const breakdown = projectTotals(weekSessions, now);
  const totalSeconds = breakdown.reduce((sum, p) => sum + p.seconds, 0);
  const maxSeconds = Math.max(1, ...breakdown.map((p) => p.seconds));
  const topProject = breakdown.filter((p) => p.name !== NO_PROJECT_LABEL)[0] ?? null;
  const isCurrentWeek = selectedWeekKey === weekKey(currentWeekStart);

  return (
    <Card>
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
            <div className="space-y-3">
              {breakdown.map((project) => (
                <div key={project.key} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1.5">
                      <ProjectIcon icon={project.icon} className="text-muted-foreground size-3.5" />
                      {project.name}
                    </span>
                    <span className="text-muted-foreground font-mono">{formatDuration(project.seconds)}</span>
                  </div>
                  <div className="bg-muted h-2 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${(project.seconds / maxSeconds) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
