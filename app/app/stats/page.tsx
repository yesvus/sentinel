"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Hourglass } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sessions as sessionsApi, projects as projectsApi, notes as notesApi, StudySession, Project, Note } from "@/lib/api";
import { dayKey, formatDuration } from "@/lib/date";
import { dailyAllocationTotals, dailyTotals } from "@/lib/session-stats";
import { ReportCards } from "@/components/report-cards";
import { ProjectBreakdownCard } from "@/components/project-breakdown-card";
import { HistorySection } from "@/components/history-section";
import { LearningProducingChart } from "@/components/learning-producing-chart";
import { WeeklyTrendChart } from "@/components/weekly-trend-chart";
import { WeeklyReportHistory } from "@/components/weekly-report-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

function buildDateRange(totalsByDay: Map<string, number>, from: string, to: string): Day[] {
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const days: Day[] = [];
  while (cursor <= end && days.length < 366) {
    const date = new Date(cursor);
    const key = dayKey(date);
    days.push({ key, date, seconds: totalsByDay.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionList, setSessionList] = useState<StudySession[]>([]);
  const [historySessions, setHistorySessions] = useState<StudySession[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const initialRange = Number(searchParams.get("days"));
  const [rangeDays, setRangeDays] = useState([7, 28, 84].includes(initialRange) ? initialRange : 7);
  const [customFrom, setCustomFrom] = useState(searchParams.get("from") ?? "");
  const [customTo, setCustomTo] = useState(searchParams.get("to") ?? "");
  const [appliedFrom, setAppliedFrom] = useState(searchParams.get("from") ?? "");
  const [appliedTo, setAppliedTo] = useState(searchParams.get("to") ?? "");
  const [selectedRoot, setSelectedRoot] = useState(searchParams.get("project") ?? "all");

  useEffect(() => {
    const loadStart = appliedFrom ? new Date(`${appliedFrom}T00:00:00`) : new Date();
    if (!appliedFrom) {
      loadStart.setHours(0, 0, 0, 0);
      loadStart.setDate(loadStart.getDate() - DAYS + 1);
    }
    const loadTo = appliedTo ? new Date(`${appliedTo}T23:59:59.999`) : undefined;
    Promise.all([sessionsApi.list({ from: loadStart.toISOString(), to: loadTo?.toISOString() }), sessionsApi.page()])
      .then(([allSessions, firstPage]) => {
        setSessionList(allSessions);
        setHistorySessions(firstPage.items);
        setHistoryCursor(firstPage.nextCursor);
      })
      .finally(() => setLoading(false));
    projectsApi.list().then(setProjectList).catch(() => {});
    notesApi.list().then(setNoteList).catch(() => {});
  }, [appliedFrom, appliedTo]);

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

  function updateFilters(days: number, root = selectedRoot) {
    setRangeDays(days);
    setAppliedFrom("");
    setAppliedTo("");
    setSelectedRoot(root);
    const query = new URLSearchParams();
    query.set("days", String(days));
    if (root !== "all") query.set("project", root);
    router.replace(`/app/stats?${query}`, { scroll: false });
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) return;
    const from = new Date(`${customFrom}T00:00:00`);
    const to = new Date(`${customTo}T23:59:59.999`);
    if (to < from) return;
    setAppliedFrom(customFrom);
    setAppliedTo(customTo);
    setRangeDays(Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1));
    const query = new URLSearchParams({ from: customFrom, to: customTo });
    if (selectedRoot !== "all") query.set("project", selectedRoot);
    router.replace(`/app/stats?${query}`, { scroll: false });
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

  // dailyTotals/computeProjectTotals include the in-progress session's elapsed-so-far time,
  // using its live duration (computed from `now`) instead of waiting until it's stopped.
  const rangeStart = new Date();
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() - rangeDays + 1);
  const rangeSessions = appliedFrom && appliedTo
    ? sessionList.filter((session) => {
        const started = new Date(session.started_at);
        return started >= new Date(`${appliedFrom}T00:00:00`) &&
          started <= new Date(`${appliedTo}T23:59:59.999`);
      })
    : sessionList.filter((session) => new Date(session.started_at) >= rangeStart);
  const filteredSessions = selectedRoot === "all"
    ? rangeSessions
    : rangeSessions.filter((session) => String(session.root_project_id ?? session.project_id ?? "none") === selectedRoot);
  const totalsByDay = dailyTotals(filteredSessions, now);
  const allocationByDay = dailyAllocationTotals(filteredSessions, now);

  const heatmapDays = buildLastNDays(totalsByDay, DAYS);
  const weeks = buildHeatmapWeeks(heatmapDays);
  const recentDays = appliedFrom && appliedTo
    ? buildDateRange(totalsByDay, appliedFrom, appliedTo)
    : buildLastNDays(totalsByDay, rangeDays);
  const allocationPoints = recentDays.map((day) => {
    const allocation = allocationByDay.get(day.key) ?? {
      learning: 0, producing: 0, unclassified: 0, total: 0,
    };
    return {
      date: day.date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }),
      label: day.date.toLocaleDateString(undefined, { weekday: "short" }),
      learning: allocation.learning,
      producing: allocation.producing,
      total: allocation.total,
    };
  });

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
        sessions={historySessions}
        notes={noteList}
        now={now}
        onNoteSaved={handleNoteSaved}
        onNoteDeleted={handleNoteDeleted}
      />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3 print:hidden">
        <div className="flex gap-1" aria-label="Statistics range">
          {[7, 28, 84].map((days) => (
            <Button key={days} size="sm" variant={rangeDays === days ? "default" : "outline"} onClick={() => updateFilters(days)}>
              {days === 7 ? "7 days" : days === 28 ? "4 weeks" : "12 weeks"}
            </Button>
          ))}
        </div>
        <Input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} aria-label="Custom range start" className="w-auto" />
        <Input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} aria-label="Custom range end" className="w-auto" />
        <Button size="sm" variant="outline" onClick={applyCustomRange}>Apply custom</Button>
        <select
          value={selectedRoot}
          onChange={(event) => updateFilters(rangeDays, event.target.value)}
          aria-label="Filter by root project"
          className="border-input bg-background h-8 rounded-md border px-2 text-sm"
        >
          <option value="all">All root projects</option>
          {projectList.filter((project) => project.parentId === null).map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
          <option value="none">No project</option>
        </select>
        {selectedRoot !== "all" && <Button size="sm" variant="ghost" onClick={() => updateFilters(rangeDays, "all")}>Reset project</Button>}
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
          onSelectRoot={(rootId) => updateFilters(rangeDays, rootId)}
        />
      </div>

      <LearningProducingChart
        points={allocationPoints}
        rangeLabel={appliedFrom && appliedTo ? `${appliedFrom} to ${appliedTo}` : `${rangeDays} days`}
      />
      <WeeklyTrendChart sessions={filteredSessions} now={now} />
      <WeeklyReportHistory />

      <HistorySection
        sessions={filteredSessions}
        projects={projectList}
        notes={noteList}
        now={now}
        hasMore={historyCursor !== null}
        loadingMore={loadingMoreHistory}
        loadMoreError={historyLoadError}
        onLoadMore={loadMoreHistory}
        onSessionsChange={handleHistorySessionsChange}
        onNoteSaved={handleNoteSaved}
        onNoteDeleted={handleNoteDeleted}
      />
    </div>
  );
}
