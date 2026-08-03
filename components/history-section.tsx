"use client";

import { useState } from "react";
import type { Note, Project, StudySession, Task } from "@/lib/api";
import { buildAiPrompt, buildWeeklyAiPrompt, exportSessions } from "@/lib/export";
import {
  filterHistorySessions,
  findHistoryNote,
  groupHistorySessions,
  historyExportFilename,
  historyNotesForDay,
  historyNotesForWeek,
  type HistoryDayGroup,
  type HistoryWeekGroup,
} from "@/lib/history";
import { partialWeekStats, sessionDurationSeconds, weekStatsFor } from "@/lib/session-stats";
import { addDays, dayKey } from "@/lib/date";
import { LONG_TERM_NOTE_KEY } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useActiveSession } from "@/lib/active-session-context";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { HistoryList } from "@/components/history/history-list";
import { HistorySessionDialog } from "@/components/history/history-session-dialog";
import { HistoryToolbar } from "@/components/history/history-toolbar";

export function HistorySection({
  sessions: sessionList,
  projects,
  notes,
  tasks,
  now,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  onSessionsChange,
  mode = "embedded",
}: {
  sessions: StudySession[];
  projects: Project[];
  notes: Note[];
  tasks: Task[];
  now: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  onLoadMore: () => void;
  onSessionsChange: (updater: (list: StudySession[]) => StudySession[]) => void;
  mode?: "page" | "embedded";
}) {
  const { user } = useAuth();
  const { deleteSession: deleteSessionMutation } = useActiveSession();
  const [dialogSession, setDialogSession] = useState<StudySession | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "ongoing">("all");
  const visibleSessions = filterHistorySessions(sessionList, {
    query,
    project: projectFilter,
    status: statusFilter,
  });
  const timeZone = user?.timezone ?? undefined;
  const weeks = groupHistorySessions(visibleSessions, now, timeZone);
  const trackedSeconds = visibleSessions.reduce((total, session) => total + sessionDurationSeconds(session, now), 0);
  const completedCount = visibleSessions.filter((session) => session.ended_at !== null).length;
  const ongoingCount = visibleSessions.length - completedCount;
  const filtersActive = Boolean(query.trim()) || projectFilter !== "all" || statusFilter !== "all";
  const today = dayKey(new Date(), timeZone);

  async function deleteSession(id: number) {
    try {
      await deleteSessionMutation(id);
      onSessionsChange((list) => list.filter((session) => session.id !== id));
    } catch {
      toast.add({
        id: `delete-session-${id}`,
        type: "error",
        title: "Could not delete session",
        description: "The session was not removed. Try again.",
      });
    }
  }

  function exportDay(day: HistoryDayGroup) {
    exportSessions(
      historyExportFilename("day", day.key, today),
      day.sessions,
      historyNotesForDay(notes, day.key),
      projects,
      now,
      timeZone,
    );
  }

  function exportWeek(week: HistoryWeekGroup) {
    exportSessions(
      historyExportFilename("week", week.key, today),
      week.sessions,
      historyNotesForWeek(notes, week.key),
      projects,
      now,
      timeZone,
    );
  }

  function copyAiPrompt(day: HistoryDayGroup, week: HistoryWeekGroup) {
    const prompt = buildAiPrompt({
      userContext: user?.planContext ?? null,
      date: day.date,
      sessionList: day.sessions,
      dayTasks: tasks.filter((task) => task.period_start === day.key),
      projectList: projects,
      weekGoalsText: findHistoryNote(notes, "week", week.key)?.content ?? null,
      weekSoFar: partialWeekStats(week.sessions, week.weekStart, day.key, now, timeZone),
      dayNote: findHistoryNote(notes, "day", day.key),
      now,
      timeZone,
    });
    navigator.clipboard.writeText(prompt);
    toast.add({
      id: `ai-prompt-${day.key}`,
      type: "success",
      title: "Copied AI prompt",
      description: "Paste it into your AI chat for a review.",
    });
  }

  function copyWeeklyAiPrompt(week: HistoryWeekGroup) {
    const prompt = buildWeeklyAiPrompt({
      userContext: user?.planContext ?? null,
      longTermGoalsText: notes.find((note) => note.scope === "long-term" && note.date_key === LONG_TERM_NOTE_KEY)?.content ?? null,
      previousWeeks: [4, 3, 2, 1].map((weeksAgo) =>
        weekStatsFor(sessionList, addDays(week.weekStart, -7 * weeksAgo, timeZone), now, timeZone)),
      currentWeek: weekStatsFor(sessionList, week.weekStart, now, timeZone),
      weekNote: findHistoryNote(notes, "week", week.key),
      now,
    });
    navigator.clipboard.writeText(prompt);
    toast.add({
      id: `weekly-ai-prompt-${week.key}`,
      type: "success",
      title: "Copied weekly AI prompt",
      description: "Paste it into your AI chat for a weekly review.",
    });
  }

  return (
    <section className="space-y-4" aria-label={mode === "page" ? "History" : "Session history"}>
      <HistoryToolbar
        mode={mode}
        projects={projects}
        query={query}
        projectFilter={projectFilter}
        statusFilter={statusFilter}
        visibleCount={visibleSessions.length}
        totalCount={sessionList.length}
        trackedSeconds={trackedSeconds}
        completedCount={completedCount}
        ongoingCount={ongoingCount}
        canExport={visibleSessions.length > 0}
        onExportAll={() =>
          exportSessions(historyExportFilename("all", "", today), visibleSessions, notes, projects, now, timeZone)
        }
        onAddSession={() => setDialogSession(null)}
        onQueryChange={setQuery}
        onProjectFilterChange={setProjectFilter}
        onStatusFilterChange={setStatusFilter}
        onResetFilters={() => {
          setQuery("");
          setProjectFilter("all");
          setStatusFilter("all");
        }}
      />
      {sessionList.length === 0 ? (
        <div className="ring-foreground/10 rounded-xl px-4 py-10 text-center ring-1">
          <p className="font-medium">No sessions yet</p>
          <p className="text-muted-foreground mt-1 text-sm">Start a session on Home or add one manually.</p>
        </div>
      ) : visibleSessions.length === 0 ? (
        <div className="ring-foreground/10 rounded-xl px-4 py-10 text-center ring-1">
          <p className="font-medium">No sessions match these filters</p>
          <p className="text-muted-foreground mt-1 text-sm">Try a different search, project, or status.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setQuery("");
              setProjectFilter("all");
              setStatusFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <HistoryList
          weeks={weeks}
          now={now}
          timeZone={timeZone}
          onCopyWeekPrompt={copyWeeklyAiPrompt}
          onCopyPrompt={copyAiPrompt}
          onExportDay={exportDay}
          onExportWeek={exportWeek}
          onEdit={setDialogSession}
          onDelete={deleteSession}
        />
      )}
      {(hasMore || loadMoreError) && (
        <div className="flex flex-col items-center gap-2 pt-2">
          {filtersActive && hasMore && <p className="text-muted-foreground text-xs">Filters apply to loaded sessions.</p>}
          {loadMoreError && <p className="text-destructive text-sm" role="alert">{loadMoreError}</p>}
          {hasMore && (
            <Button type="button" variant="outline" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? "Loading..." : loadMoreError ? "Try again" : "Load more"}
            </Button>
          )}
        </div>
      )}
      {dialogSession !== undefined && (
        <HistorySessionDialog
          key={dialogSession?.id ?? "new"}
          session={dialogSession}
          projects={projects}
          trackProductionSplit={user?.trackProductionSplit ?? true}
          onClose={() => setDialogSession(undefined)}
          onSaved={onSessionsChange}
        />
      )}
    </section>
  );
}
