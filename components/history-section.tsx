"use client";

import { useState } from "react";
import type { Note, Project, StudySession, Task } from "@/lib/api";
import { sessions as sessionsApi } from "@/lib/api";
import { buildAiPrompt, exportSessions } from "@/lib/export";
import {
  findHistoryNote,
  groupHistorySessions,
  historyExportFilename,
  historyNotesForDay,
  historyNotesForWeek,
  type HistoryDayGroup,
  type HistoryWeekGroup,
} from "@/lib/history";
import { partialWeekStats } from "@/lib/session-stats";
import { dateInputValue } from "@/lib/session-form";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
}) {
  const { user } = useAuth();
  const [dialogSession, setDialogSession] = useState<StudySession | null | undefined>(undefined);
  const weeks = groupHistorySessions(sessionList, now);
  const today = dateInputValue(new Date());

  async function deleteSession(id: number) {
    try {
      await sessionsApi.remove(id);
      onSessionsChange((list) => list.filter((session) => session.id !== id));
    } catch {
      // Leave the session in place when the best-effort delete fails.
    }
  }

  function exportDay(day: HistoryDayGroup) {
    exportSessions(
      historyExportFilename("day", day.key, today),
      day.sessions,
      historyNotesForDay(notes, day.key),
      projects,
      now,
    );
  }

  function exportWeek(week: HistoryWeekGroup) {
    exportSessions(
      historyExportFilename("week", week.key, today),
      week.sessions,
      historyNotesForWeek(notes, week.key),
      projects,
      now,
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
      weekSoFar: partialWeekStats(week.sessions, week.weekStart, day.key, now),
      dayNote: findHistoryNote(notes, "day", day.key),
      now,
    });
    navigator.clipboard.writeText(prompt);
    toast.add({
      id: `ai-prompt-${day.key}`,
      type: "success",
      title: "Copied AI prompt",
      description: "Paste it into your AI chat for a review.",
    });
  }

  return (
    <Card>
      <HistoryToolbar
        canExport={sessionList.length > 0}
        onExportAll={() =>
          exportSessions(historyExportFilename("all", "", today), sessionList, notes, projects, now)
        }
        onAddSession={() => setDialogSession(null)}
      />
      <CardContent>
        {sessionList.length === 0 && (
          <p className="text-muted-foreground text-sm">No sessions yet, start one on Home.</p>
        )}
        <HistoryList
          weeks={weeks}
          now={now}
          onCopyPrompt={copyAiPrompt}
          onExportDay={exportDay}
          onExportWeek={exportWeek}
          onEdit={setDialogSession}
          onDelete={deleteSession}
        />
        {(hasMore || loadMoreError) && (
          <div className="mt-6 flex flex-col items-center gap-2 border-t pt-4">
            {loadMoreError && <p className="text-destructive text-sm">{loadMoreError}</p>}
            {hasMore && (
              <Button type="button" variant="outline" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? "Loading..." : loadMoreError ? "Try again" : "Load more"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
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
    </Card>
  );
}
