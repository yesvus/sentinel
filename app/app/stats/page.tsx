"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { sessions as sessionsApi, projects as projectsApi, notes as notesApi, tasks as tasksApi, StudySession, Project, Note, Task } from "@/lib/api";
import { addDays, dayKey, startOfDay } from "@/lib/date";
import { dailyAllocationTotals } from "@/lib/session-stats";
import { ReportCards } from "@/components/report-cards";
import { ProjectBreakdownCard } from "@/components/project-breakdown-card";
import { HistorySection } from "@/components/history-section";
import { LearningProducingChart } from "@/components/learning-producing-chart";
import { WeeklyReportHistory } from "@/components/weekly-report-history";
import { Button } from "@/components/ui/button";
import { orderProjectsAsTree, projectTreeText } from "@/lib/project-tree";
import { useActiveSession } from "@/lib/active-session-context";
import { mergeActiveSession, refreshSessionPage } from "@/lib/session-list";
import { useAuth } from "@/lib/auth-context";

const WEEKS = 14;
const DAYS = WEEKS * 7;
type Day = { key: string; date: Date; seconds: number };

function buildLastNDays(totalsByDay: Map<string, number>, n: number, now: number, timeZone?: string): Day[] {
  const today = startOfDay(new Date(now), timeZone);

  const days: Day[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i, timeZone);
    const key = dayKey(date, timeZone);
    days.push({ key, date, seconds: totalsByDay.get(key) ?? 0 });
  }
  return days;
}

export default function StatsPage() {
  const { user } = useAuth();
  const timeZone = user?.timezone ?? undefined;
  const { activeSession, now, sessionRevision } = useActiveSession();
  const [sessionList, setSessionList] = useState<StudySession[]>([]);
  const [historySessions, setHistorySessions] = useState<StudySession[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState("all");
  const historyCountRef = useRef(30);
  const [rangeStart] = useState(() => {
    return addDays(startOfDay(new Date(now), timeZone), -DAYS + 1, timeZone);
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      sessionsApi.list({ from: rangeStart.toISOString() }),
      refreshSessionPage(historyCountRef.current),
    ])
      .then(([allSessions, firstPage]) => {
        if (cancelled) return;
        setSessionList(allSessions);
        setHistorySessions(firstPage.items);
        setHistoryCursor(firstPage.nextCursor);
        historyCountRef.current = Math.max(30, firstPage.items.length);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [rangeStart, sessionRevision]);

  useEffect(() => {
    projectsApi.list().then(setProjectList).catch(() => {});
    notesApi.list().then(setNoteList).catch(() => {});
    tasksApi.list().then(setTaskList).catch(() => {});
  }, []);

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
    const previousVisible = filteredHistorySessions;
    const nextVisible = updater(previousVisible);
    const previousIds = new Set(previousVisible.map((session) => session.id));
    const mergeChanges = (current: StudySession[], bounded: boolean) => [
      ...current.filter((session) => !previousIds.has(session.id)),
      ...nextVisible.filter((session) => !bounded || new Date(session.started_at) >= rangeStart),
    ].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    setHistorySessions((current) => mergeChanges(current, false));
    setSessionList((current) => mergeChanges(current, true));
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
      historyCountRef.current += page.items.length;
      setHistoryCursor(page.nextCursor);
    } catch {
      setHistoryLoadError("Could not load more history.");
    } finally {
      setLoadingMoreHistory(false);
    }
  }

  // Totals include the in-progress session's elapsed-so-far time.
  const rangeSessions = mergeActiveSession(
    sessionList,
    activeSession,
    (session) => new Date(session.started_at) >= rangeStart,
  );
  const mergedHistorySessions = mergeActiveSession(historySessions, activeSession);
  const filteredSessions = selectedProject === "all"
    ? rangeSessions
    : rangeSessions.filter((session) => String(session.project_id ?? "none") === selectedProject);
  const filteredHistorySessions = selectedProject === "all"
    ? mergedHistorySessions
    : mergedHistorySessions.filter((session) => String(session.project_id ?? "none") === selectedProject);
  const allocationByDay = dailyAllocationTotals(filteredSessions, now, timeZone);

  const rangeDays = buildLastNDays(new Map(), DAYS, now, timeZone);
  const toAllocationPoints = (days: Day[]) => days.map((day) => {
    const allocation = allocationByDay.get(day.key) ?? {
      learning: 0, producing: 0, unclassified: 0, total: 0,
    };
    return {
      key: day.key,
      date: day.date.toLocaleDateString(undefined, { timeZone, month: "long", day: "numeric", year: "numeric" }),
      label: day.date.toLocaleDateString(undefined, { timeZone, weekday: "short" }),
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
        sessions={mergedHistorySessions}
        notes={noteList}
        now={now}
        onNoteSaved={handleNoteSaved}
        onNoteDeleted={handleNoteDeleted}
        timeZone={timeZone}
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
        timeZone={timeZone}
      />

      <LearningProducingChart
        points={allocationPoints}
        now={now}
        timeZone={timeZone}
      />
      <WeeklyReportHistory timeZone={timeZone} />

      <HistorySection
        sessions={filteredHistorySessions}
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
