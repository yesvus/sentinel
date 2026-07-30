"use client";

import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sessions as sessionsApi, projects as projectsApi, notes as notesApi, StudySession, Project, Note } from "@/lib/api";
import { dayKey, formatDuration } from "@/lib/date";
import { dailyTotals } from "@/lib/session-stats";
import { ReportCards } from "@/components/report-cards";
import { ProjectBreakdownCard } from "@/components/project-breakdown-card";
import { HistorySection } from "@/components/history-section";

const WEEKS = 14;
const DAYS = WEEKS * 7;
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function intensityColor(seconds: number) {
  if (seconds === 0) return undefined; // falls back to bg-muted
  if (seconds < 30 * 60) return "#a5f3fc";
  if (seconds < 60 * 60) return "#22d3ee";
  if (seconds < 120 * 60) return "#0e7490";
  return "#f59e0b";
}

type Day = { key: string; date: Date; seconds: number };

function buildLastNDays(totalsByDay: Map<string, number>, n: number): Day[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: Day[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const key = dayKey(date);
    days.push({ key, date, seconds: totalsByDay.get(key) ?? 0 });
  }
  return days;
}

function buildHeatmapWeeks(days: Day[]) {
  // Pad the front so the grid starts on a Sunday, like GitHub's graph.
  const firstDayOfWeek = days[0].date.getDay();
  const padded: (Day | null)[] = Array(firstDayOfWeek).fill(null).concat(days);

  const weeks: (Day | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }
  return weeks;
}

function monthLabelForWeek(week: (Day | null)[], previousWeek: (Day | null)[] | undefined) {
  const firstDay = week.find((d) => d !== null);
  if (!firstDay) return "";
  const prevFirstDay = previousWeek?.find((d) => d !== null);
  if (prevFirstDay && prevFirstDay.date.getMonth() === firstDay.date.getMonth()) return "";
  return MONTH_LABELS[firstDay.date.getMonth()];
}

export default function StatsPage() {
  const [sessionList, setSessionList] = useState<StudySession[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    sessionsApi
      .list()
      .then(setSessionList)
      .finally(() => setLoading(false));
    projectsApi.list().then(setProjectList).catch(() => {});
    notesApi.list().then(setNoteList).catch(() => {});
  }, []);

  useEffect(() => {
    const hasActiveSession = sessionList.some((s) => s.ended_at === null);
    if (!hasActiveSession) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [sessionList]);

  function handleNoteSaved(note: Note) {
    setNoteList((list) => {
      const withoutExisting = list.filter((n) => !(n.scope === note.scope && n.date_key === note.date_key));
      return [...withoutExisting, note];
    });
  }

  function handleNoteDeleted(scope: "day" | "week", dateKey: string) {
    setNoteList((list) => list.filter((n) => !(n.scope === scope && n.date_key === dateKey)));
  }

  // dailyTotals/computeProjectTotals include the in-progress session's elapsed-so-far time,
  // using its live duration (computed from `now`) instead of waiting until it's stopped.
  const totalsByDay = dailyTotals(sessionList, now);

  const heatmapDays = buildLastNDays(totalsByDay, DAYS);
  const weeks = buildHeatmapWeeks(heatmapDays);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <ReportCards
        sessions={sessionList}
        notes={noteList}
        now={now}
        onNoteSaved={handleNoteSaved}
        onNoteDeleted={handleNoteDeleted}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hourglass className="text-muted-foreground size-4" />
            Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Study time over the last {WEEKS} weeks.</p>

          <div className="mt-4 overflow-x-auto pb-2">
            <div className="flex gap-1 pl-8">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="text-muted-foreground w-3.5 shrink-0 text-[10px] whitespace-nowrap">
                  {monthLabelForWeek(week, weeks[weekIndex - 1])}
                </div>
              ))}
            </div>

            <div className="mt-1 flex gap-1">
              <div className="flex w-7 shrink-0 flex-col gap-1">
                {WEEKDAY_LABELS.map((label, i) => (
                  <div key={i} className="text-muted-foreground h-3.5 text-[10px] leading-3.5">
                    {label}
                  </div>
                ))}
              </div>

              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-1">
                  {week.map((day, dayIndex) =>
                    day ? (
                      <Tooltip key={day.key}>
                        <TooltipTrigger
                          render={
                            <div
                              className="bg-muted size-3.5 rounded-sm"
                              style={{ backgroundColor: intensityColor(day.seconds) }}
                            />
                          }
                        />
                        <TooltipContent>
                          {day.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}:{" "}
                          {day.seconds > 0 ? formatDuration(day.seconds) : "no study"}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <div key={dayIndex} className="size-3.5" />
                    )
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="text-muted-foreground mt-2 flex items-center gap-1.5 pl-8 text-[10px]">
            <span>Less</span>
            <div className="bg-muted size-3 rounded-sm" />
            <div className="size-3 rounded-sm" style={{ backgroundColor: "#a5f3fc" }} />
            <div className="size-3 rounded-sm" style={{ backgroundColor: "#22d3ee" }} />
            <div className="size-3 rounded-sm" style={{ backgroundColor: "#0e7490" }} />
            <div className="size-3 rounded-sm" style={{ backgroundColor: "#f59e0b" }} />
            <span>More</span>
          </div>
        </CardContent>
      </Card>

      <ProjectBreakdownCard sessions={sessionList} now={now} />

      <HistorySection
        sessions={sessionList}
        projects={projectList}
        notes={noteList}
        now={now}
        onSessionsChange={setSessionList}
        onNoteSaved={handleNoteSaved}
        onNoteDeleted={handleNoteDeleted}
      />
    </div>
  );
}
