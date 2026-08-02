"use client";

import { useEffect, useRef, useState } from "react";
import { HistorySection } from "@/components/history-section";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Note,
  Project,
  StudySession,
  Task,
  notes as notesApi,
  projects as projectsApi,
  sessions as sessionsApi,
  tasks as tasksApi,
} from "@/lib/api";
import { PageHeaderActions } from "@/lib/page-header-actions-context";
import { useActiveSession } from "@/lib/active-session-context";
import { mergeActiveSession, refreshSessionPage } from "@/lib/session-list";

export default function CalendarHistoryPage() {
  const { activeSession, now, sessionRevision } = useActiveSession();
  const [sessionList, setSessionList] = useState<StudySession[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedCountRef = useRef(30);

  useEffect(() => {
    Promise.all([projectsApi.list(), notesApi.list(), tasksApi.list()])
      .then(([projects, notes, tasks]) => {
        setProjectList(projects);
        setNoteList(notes);
        setTaskList(tasks);
      })
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshSessionPage(loadedCountRef.current)
      .then((page) => {
        if (cancelled) return;
        setSessionList(page.items);
        setCursor(page.nextCursor);
        loadedCountRef.current = Math.max(30, page.items.length);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionRevision]);

  const canonicalSessions = mergeActiveSession(sessionList, activeSession);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const page = await sessionsApi.page(cursor);
      setSessionList((list) => {
        const ids = new Set(list.map((session) => session.id));
        return [...list, ...page.items.filter((session) => !ids.has(session.id))];
      });
      loadedCountRef.current += page.items.length;
      setCursor(page.nextCursor);
    } catch {
      setLoadError("Could not load more history.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="animate-in fade-in mx-auto w-full max-w-5xl duration-500 fill-mode-both">
      <PageHeaderActions>
        <Breadcrumb>
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>History</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeaderActions>

      {loading ? (
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-16 w-full" />)}
          </CardContent>
        </Card>
      ) : (
        <HistorySection
          sessions={canonicalSessions}
          projects={projectList}
          notes={noteList}
          tasks={taskList}
          now={now}
          hasMore={cursor !== null}
          loadingMore={loadingMore}
          loadMoreError={loadError}
          onLoadMore={() => void loadMore()}
          onSessionsChange={setSessionList}
        />
      )}
    </div>
  );
}
