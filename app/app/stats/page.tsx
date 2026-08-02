"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { sessions as sessionsApi, projects as projectsApi, notes as notesApi, tasks as tasksApi, StudySession, Project, Note, Task } from "@/lib/api";
import { dayKey } from "@/lib/date";
import { dailyAllocationTotals } from "@/lib/session-stats";
import { ReportCards } from "@/components/report-cards";
import { ProjectBreakdownCard } from "@/components/project-breakdown-card";
import { HistorySection } from "@/components/history-section";
import { LearningProducingChart } from "@/components/learning-producing-chart";
import { WeeklyReportHistory } from "@/components/weekly-report-history";
import { Button } from "@/components/ui/button";
import { orderProjectsAsTree, projectTreeText } from "@/lib/project-tree";

const WEEKS = 14;
const DAYS = WEEKS * 7;
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
  const [selectedProject, setSelectedProject] = useState("all");

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
  const filteredSessions = selectedProject === "all"
    ? rangeSessions
    : rangeSessions.filter((session) => String(session.project_id ?? "none") === selectedProject);
  const allocationByDay = dailyAllocationTotals(filteredSessions, now);

  const rangeDays = buildLastNDays(new Map(), DAYS);
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
  const allocationPoints = toAllocationPoints(rangeDays);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
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
          value={selectedProject}
          onChange={(event) => setSelectedProject(event.target.value)}
          aria-label="Filter by project"
          className="border-input bg-background h-8 rounded-md border px-2 text-sm"
        >
          <option value="all">All projects</option>
          {orderProjectsAsTree(projectList.filter((project) => !project.archived)).map(({ project, treeDepth }) => (
            <option key={project.id} value={project.id}>{projectTreeText(project, treeDepth)}</option>
          ))}
          <option value="none">No project</option>
        </select>
        {selectedProject !== "all" && <Button size="sm" variant="ghost" onClick={() => setSelectedProject("all")}>Reset project</Button>}
      </div>

      <ProjectBreakdownCard
        sessions={rangeSessions}
        now={now}
        className="w-full"
        onSelectProject={setSelectedProject}
      />

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
