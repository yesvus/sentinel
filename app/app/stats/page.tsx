"use client";

import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sessions as sessionsApi, projects as projectsApi, notes as notesApi, tasks as tasksApi, StudySession, Project, Note, Task } from "@/lib/api";
import { dayKey, formatDuration } from "@/lib/date";
import { dailyAllocationTotals, dailyTotals } from "@/lib/session-stats";
import { ReportCards } from "@/components/report-cards";
import { ProjectBreakdownCard } from "@/components/project-breakdown-card";
import { HistorySection } from "@/components/history-section";
import { LearningProducingChart } from "@/components/learning-producing-chart";
import { WeeklyReportHistory } from "@/components/weekly-report-history";
import { Button } from "@/components/ui/button";

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
  const [historySessions, setHistorySessions] = useState<StudySession[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [selectedRoot, setSelectedRoot] = useState("all");

  useEffect(() => {
    const loadStart = new Date();
    loadStart.setHours(0, 0, 0, 0);
    loadStart.setDate(loadStart.getDate() - DAYS + 1);
    Promise.all([sessionsApi.list({ from: loadStart.toISOString() }), sessionsApi.page()])
      .then(([allSessions, firstPage]) => {
        setSessionList(allSessions);
        setHistorySessions(firstPage.items);
        setHistoryCursor(firstPage.nextCursor);
      })
      .finally(() => setLoading(false));
    projectsApi.list().then(setProjectList).catch(() => {});
    notesApi.list().then(setNoteList).catch(() => {});
    tasksApi.list().then(setTaskList).catch(() => {});
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

  function handleHistorySessionsChange(updater: (list: StudySession[]) => StudySession[]) {
    setHistorySessions(updater);
    setSessionList(updater);
  }

  async function loadMoreHistory() {
    if (!historyCursor || loadingMoreHistory) return;
    setLoadingMoreHistory(true);
    setHistoryLoadError(null);
    try {
      const page = await sessionsApi.page(historyCursor);
      setHistorySessions((current) => {
        const existingIds = new Set(current.map((session) => session.id));
        return [...current, ...page.items.filter((session) => !existingIds.has(session.id))];
      });
      setHistoryCursor(page.nextCursor);
    } catch {
      setHistoryLoadError("Could not load more history.");
    } finally {
      setLoadingMoreHistory(false);
    }
  }

  // Totals include the in-progress session's elapsed-so-far time.
  const rangeSessions = sessionList;
  const filteredSessions = selectedRoot === "all"
    ? rangeSessions
    : rangeSessions.filter((session) => String(session.root_project_id ?? session.project_id ?? "none") === selectedRoot);
  const totalsByDay = dailyTotals(filteredSessions, now);
  const allocationByDay = dailyAllocationTotals(filteredSessions, now);

  const heatmapDays = buildLastNDays(totalsByDay, DAYS);
  const weeks = buildHeatmapWeeks(heatmapDays);
  const toAllocationPoints = (days: Day[]) => days.map((day) => {
    const allocation = allocationByDay.get(day.key) ?? {
      learning: 0, producing: 0, unclassified: 0, total: 0,
    };
    return {
      key: day.key,
      date: day.date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }),
      label: day.date.toLocaleDateString(undefined, { weekday: "short" }),
      learning: allocation.learning,
      producing: allocation.producing,
      total: allocation.total,
    };
  });
  const allocationPoints = toAllocationPoints(heatmapDays);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="grid gap-8 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex flex-wrap items-stretch gap-4 sm:gap-8">
          <Card className="w-full shrink-0 sm:w-auto">
            <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-56" />
              <Skeleton className="mt-4 h-28 w-full max-w-md" />
            </CardContent>
          </Card>
          <Card className="min-w-64 flex-1">
            <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent className="space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
          <CardContent><Skeleton className="h-40 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 fill-mode-both mx-auto w-full max-w-5xl space-y-8">
      <ReportCards
        sessions={historySessions}
        notes={noteList}
        now={now}
        onNoteSaved={handleNoteSaved}
        onNoteDeleted={handleNoteDeleted}
      />

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <select
          value={selectedRoot}
          onChange={(event) => setSelectedRoot(event.target.value)}
          aria-label="Filter by root project"
          className="border-input bg-background h-8 rounded-md border px-2 text-sm"
        >
          <option value="all">All root projects</option>
          {projectList.filter((project) => project.parentId === null).map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
          <option value="none">No project</option>
        </select>
        {selectedRoot !== "all" && <Button size="sm" variant="ghost" onClick={() => setSelectedRoot("all")}>Reset project</Button>}
      </div>

      <div className="flex flex-wrap items-stretch gap-4 sm:gap-8">
        <Card className="w-full shrink-0 sm:w-auto">
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
                                tabIndex={0}
                                role="gridcell"
                                aria-label={`${day.date.toLocaleDateString()}: ${day.seconds > 0 ? formatDuration(day.seconds) : "no activity"}`}
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

        <ProjectBreakdownCard
          sessions={rangeSessions}
          now={now}
          className="min-w-64 flex-1"
          onSelectRoot={setSelectedRoot}
        />
      </div>

      <LearningProducingChart
        points={allocationPoints}
        now={now}
      />
      <WeeklyReportHistory />

      <HistorySection
        sessions={filteredSessions}
        projects={projectList}
        notes={noteList}
        tasks={taskList}
        now={now}
        hasMore={historyCursor !== null}
        loadingMore={loadingMoreHistory}
        loadMoreError={historyLoadError}
        onLoadMore={loadMoreHistory}
        onSessionsChange={handleHistorySessionsChange}
      />
    </div>
  );
}
