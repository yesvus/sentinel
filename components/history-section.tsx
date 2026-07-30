"use client";

import { useState, FormEvent } from "react";
import { History as HistoryIcon, Trash2, Plus, Pencil, Download, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { sessions as sessionsApi, ApiError, StudySession, Project, Note } from "@/lib/api";
import { ProjectIcon } from "@/lib/icons";
import { NoteEditor } from "@/components/note-editor";
import { exportSessions } from "@/lib/export";
import { sessionDurationSeconds } from "@/lib/session-stats";
import {
  dayKey,
  weekKey,
  startOfDay,
  startOfWeek,
  formatDuration,
  formatTime,
  formatDayLabel,
  formatWeekRangeLabel,
  parseDateKey,
} from "@/lib/date";

const NO_PROJECT_LABEL = "No project";
const DESCRIPTION_PREVIEW_LENGTH = 80;
const NO_PROJECT_VALUE = "__none__";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInput(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type DayGroup = { key: string; date: Date; sessions: StudySession[]; totalSeconds: number };
type WeekGroup = { key: string; weekStart: Date; days: DayGroup[]; sessions: StudySession[]; totalSeconds: number };

/** Sessions arrive newest-first; grouping by first-seen key preserves that order for weeks and days. */
function groupSessions(sessionList: StudySession[], now: number): WeekGroup[] {
  const weeks: WeekGroup[] = [];
  const weekIndex = new Map<string, WeekGroup>();
  const dayIndex = new Map<string, DayGroup>();

  for (const session of sessionList) {
    const started = new Date(session.started_at);
    const wKey = weekKey(started);
    const dKey = dayKey(started);
    const seconds = sessionDurationSeconds(session, now);

    let week = weekIndex.get(wKey);
    if (!week) {
      week = { key: wKey, weekStart: startOfWeek(started), days: [], sessions: [], totalSeconds: 0 };
      weekIndex.set(wKey, week);
      weeks.push(week);
    }

    let day = dayIndex.get(`${wKey}:${dKey}`);
    if (!day) {
      day = { key: dKey, date: startOfDay(started), sessions: [], totalSeconds: 0 };
      dayIndex.set(`${wKey}:${dKey}`, day);
      week.days.push(day);
    }

    day.sessions.push(session);
    day.totalSeconds += seconds;
    week.sessions.push(session);
    week.totalSeconds += seconds;
  }

  return weeks;
}

export function HistorySection({
  sessions: sessionList,
  projects: projectList,
  notes,
  now,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  onSessionsChange,
  onNoteSaved,
  onNoteDeleted,
}: {
  sessions: StudySession[];
  projects: Project[];
  notes: Note[];
  now: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  onLoadMore: () => void;
  onSessionsChange: (updater: (list: StudySession[]) => StudySession[]) => void;
  onNoteSaved: (note: Note) => void;
  onNoteDeleted: (scope: "day" | "week", dateKey: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingActive, setEditingActive] = useState(false);
  const [addDate, setAddDate] = useState(() => toDateInput(new Date()));
  const [addStartTime, setAddStartTime] = useState(() => toTimeInput(new Date(Date.now() - 60 * 60 * 1000)));
  const [addEndTime, setAddEndTime] = useState(() => toTimeInput(new Date()));
  const [addProjectId, setAddProjectId] = useState<number | null>(null);
  const [addDescription, setAddDescription] = useState("");
  const [addProductionPercentage, setAddProductionPercentage] = useState(0);
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  function openAddDialog() {
    setEditingId(null);
    setEditingActive(false);
    setAddDate(toDateInput(new Date()));
    setAddStartTime(toTimeInput(new Date(Date.now() - 60 * 60 * 1000)));
    setAddEndTime(toTimeInput(new Date()));
    setAddProjectId(null);
    setAddDescription("");
    setAddProductionPercentage(0);
    setAddError(null);
    setAddOpen(true);
  }

  function openEditDialog(session: StudySession) {
    const start = new Date(session.started_at);
    const end = session.ended_at ? new Date(session.ended_at) : new Date();
    setEditingId(session.id);
    setEditingActive(session.ended_at === null);
    setAddDate(toDateInput(start));
    setAddStartTime(toTimeInput(start));
    setAddEndTime(toTimeInput(end));
    setAddProjectId(session.project_id);
    setAddDescription(session.description ?? "");
    setAddProductionPercentage(session.production_percentage ?? 0);
    setAddError(null);
    setAddOpen(true);
  }

  function toggleExpanded(id: number) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleWeekCollapsed(key: string) {
    setCollapsedWeeks((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleDeleteSession(id: number) {
    try {
      await sessionsApi.remove(id);
      onSessionsChange((list) => list.filter((s) => s.id !== id));
    } catch {
      // best-effort; leave the session in place if the delete failed
    }
  }

  async function handleAddSession(e: FormEvent) {
    e.preventDefault();
    setAddError(null);

    const startedAt = new Date(`${addDate}T${addStartTime}`);
    const endedAt = editingActive ? null : new Date(`${addDate}T${addEndTime}`);

    if (startedAt > new Date()) {
      setAddError("Start time cannot be in the future");
      return;
    }
    if (endedAt && endedAt <= startedAt) {
      setAddError("End time must be after start time");
      return;
    }

    const project = projectList.find((p) => p.id === addProjectId) ?? null;

    setAddBusy(true);
    try {
      if (editingId !== null) {
        await sessionsApi.update(editingId, {
          startedAt: startedAt.toISOString(),
          ...(endedAt ? { endedAt: endedAt.toISOString() } : {}),
          projectId: addProjectId,
          description: addDescription || null,
          ...(!editingActive ? { productionPercentage: addProductionPercentage } : {}),
        });
        onSessionsChange((list) =>
          list
            .map((s) =>
              s.id === editingId
                ? {
                    ...s,
                    started_at: startedAt.toISOString(),
                    ended_at: endedAt?.toISOString() ?? null,
                    duration_seconds: endedAt
                      ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
                      : null,
                    description: addDescription || null,
                    project_id: addProjectId,
                    project_name: project?.name ?? null,
                    project_icon: project?.icon ?? null,
                    production_percentage: editingActive
                      ? (s.production_percentage ?? 0)
                      : addProductionPercentage,
                  }
                : s
            )
            .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
        );
        if (editingActive) {
          const channel = new BroadcastChannel("sentinel-session-sync");
          channel.postMessage({
            type: "updated",
            projectId: addProjectId,
            description: addDescription || null,
            startedAt: startedAt.toISOString(),
          });
          channel.close();
        }
      } else {
        const created = await sessionsApi.createManual({
          startedAt: startedAt.toISOString(),
          endedAt: endedAt!.toISOString(),
          projectId: addProjectId,
          description: addDescription || null,
          productionPercentage: addProductionPercentage,
        });
        onSessionsChange((list) =>
          [
            {
              id: created.id,
              started_at: created.startedAt,
              ended_at: created.endedAt,
              duration_seconds: created.durationSeconds,
              description: addDescription || null,
              project_id: addProjectId,
              project_name: project?.name ?? null,
              project_icon: project?.icon ?? null,
              production_percentage: addProductionPercentage,
            },
            ...list,
          ].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
        );
      }
      setAddOpen(false);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setAddBusy(false);
    }
  }

  const weeks = groupSessions(sessionList, now);

  function findNote(scope: "day" | "week", key: string) {
    return notes.find((n) => n.scope === scope && n.date_key === key);
  }

  function notesForWeek(key: string) {
    return notes.filter(
      (n) => (n.scope === "week" && n.date_key === key) || (n.scope === "day" && weekKey(parseDateKey(n.date_key)) === key)
    );
  }

  function notesForDay(key: string) {
    return notes.filter((n) => n.scope === "day" && n.date_key === key);
  }

  function exportFilename(scope: "all" | "week" | "day", key: string) {
    const today = toDateInput(new Date());
    if (scope === "all") return `sentinel-sessions-all-${today}.csv`;
    if (scope === "week") return `sentinel-sessions-week-${key}.csv`;
    return `sentinel-sessions-${key}.csv`;
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="text-muted-foreground size-4" />
          History
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={sessionList.length === 0}
            onClick={() => exportSessions(exportFilename("all", ""), sessionList, notes, projectList, now)}
          >
            <Download className="size-4" />
            Export all
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={openAddDialog}>
            <Plus className="size-4" />
            Add session
          </Button>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId !== null ? "Edit session" : "Add a session"}</DialogTitle>
              <DialogDescription>
                {editingId !== null
                  ? editingActive
                    ? "Update the running session without stopping it."
                    : "Fix a session that ran long, or update its details."
                  : "For time you forgot to track live. It's added as an already-finished session."}
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleAddSession}>
              <div className="space-y-2">
                <Label htmlFor="add-date">Date</Label>
                <Input
                  id="add-date"
                  type="date"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  required
                />
              </div>
              <div className={`grid gap-3 ${editingActive ? "grid-cols-1" : "grid-cols-2"}`}>
                <div className="space-y-2">
                  <Label htmlFor="add-start">Start time</Label>
                  <Input
                    id="add-start"
                    type="time"
                    value={addStartTime}
                    onChange={(e) => setAddStartTime(e.target.value)}
                    required
                  />
                </div>
                {!editingActive && (
                  <div className="space-y-2">
                    <Label htmlFor="add-end">End time</Label>
                    <Input
                      id="add-end"
                      type="time"
                      value={addEndTime}
                      onChange={(e) => setAddEndTime(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Project</Label>
                <Select
                  value={addProjectId !== null ? String(addProjectId) : NO_PROJECT_VALUE}
                  onValueChange={(value) =>
                    setAddProjectId(value === NO_PROJECT_VALUE ? null : Number(value))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string) => {
                        const project = projectList.find((p) => String(p.id) === value);
                        return (
                          <span className="flex items-center gap-2">
                            <ProjectIcon icon={project?.icon ?? null} className="size-4" />
                            {project?.name ?? "No project"}
                          </span>
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT_VALUE}>
                      <ProjectIcon icon={null} className="size-4" />
                      No project
                    </SelectItem>
                    {projectList.map((project) => (
                      <SelectItem key={project.id} value={String(project.id)}>
                        <ProjectIcon icon={project.icon} className="size-4" />
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-description">Description (optional)</Label>
                <Textarea
                  id="add-description"
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  placeholder="What were you working on?"
                />
              </div>
              {!editingActive && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="add-production">Session allocation</Label>
                    <span className="text-muted-foreground text-xs">Producing {addProductionPercentage}%</span>
                  </div>
                  <input
                    id="add-production"
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={addProductionPercentage}
                    onChange={(event) => setAddProductionPercentage(Number(event.target.value))}
                    aria-valuetext={`Learning ${100 - addProductionPercentage} percent, Producing ${addProductionPercentage} percent`}
                    className="accent-primary w-full"
                  />
                  <p className="text-muted-foreground text-center text-xs">
                    Learning {100 - addProductionPercentage}% · Producing {addProductionPercentage}%
                  </p>
                </div>
              )}
              {addError && <p className="text-destructive text-sm">{addError}</p>}
              <DialogFooter>
                <Button type="submit" disabled={addBusy}>
                  {addBusy ? "Saving..." : editingId !== null ? "Save changes" : "Add session"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {sessionList.length === 0 && (
          <p className="text-muted-foreground text-sm">No sessions yet, start one on Home.</p>
        )}
        <div className="space-y-6">
          {weeks.map((week) => {
            const weekNote = findNote("week", week.key);
            const weekCollapsed = collapsedWeeks.has(week.key);

            return (
              <div key={week.key} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2">
                  <button
                    type="button"
                    onClick={() => toggleWeekCollapsed(week.key)}
                    className="flex items-center gap-1.5 text-left"
                  >
                    {weekCollapsed ? (
                      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                    ) : (
                      <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                    )}
                    <span className="font-medium">{formatWeekRangeLabel(week.weekStart)}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {formatDuration(week.totalSeconds)}
                    </span>
                  </button>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          onClick={() => exportSessions(exportFilename("week", week.key), week.sessions, notesForWeek(week.key), projectList, now)}
                        >
                          <Download />
                        </Button>
                      }
                    />
                    <TooltipContent>Export this week as CSV</TooltipContent>
                  </Tooltip>
                </div>

                {!weekCollapsed && (
                  <>
                    <div className="pl-5">
                      <NoteEditor
                        scope="week"
                        dateKey={week.key}
                        note={weekNote}
                        label={formatWeekRangeLabel(week.weekStart)}
                        onSaved={onNoteSaved}
                        onDeleted={() => onNoteDeleted("week", week.key)}
                      />
                    </div>

                    <div className="space-y-4 pl-5">
                      {week.days.map((day) => {
                        const dayNote = findNote("day", day.key);

                        return (
                          <div key={day.key} className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{formatDayLabel(day.date)}</span>
                                <span className="text-muted-foreground font-mono text-xs">
                                  {formatDuration(day.totalSeconds)}
                                </span>
                              </div>
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="text-muted-foreground"
                                      onClick={() => exportSessions(exportFilename("day", day.key), day.sessions, notesForDay(day.key), projectList, now)}
                                    >
                                      <Download />
                                    </Button>
                                  }
                                />
                                <TooltipContent>Export this day as CSV</TooltipContent>
                              </Tooltip>
                            </div>

                            <NoteEditor
                              scope="day"
                              dateKey={day.key}
                              note={dayNote}
                              label={formatDayLabel(day.date)}
                              onSaved={onNoteSaved}
                              onDeleted={() => onNoteDeleted("day", day.key)}
                            />

                            <div className="space-y-2">
                              {day.sessions.map((session) => {
                                const isActive = session.ended_at === null;
                                const seconds = sessionDurationSeconds(session, now);
                                const isExpanded = expandedIds.has(session.id);
                                const isLong =
                                  !!session.description &&
                                  (session.description.length > DESCRIPTION_PREVIEW_LENGTH ||
                                    session.description.includes("\n"));

                                return (
                                  <div
                                    key={session.id}
                                    className="ring-foreground/10 flex flex-col gap-2 rounded-lg px-3 py-2 ring-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                                  >
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-muted-foreground font-mono text-xs">
                                          {formatTime(session.started_at)}
                                          {"-"}
                                          {session.ended_at ? formatTime(session.ended_at) : "now"}
                                        </span>
                                        <Badge variant={session.project_name ? "secondary" : "outline"} className="gap-1">
                                          <ProjectIcon icon={session.project_icon} className="size-3" />
                                          {session.project_name ?? NO_PROJECT_LABEL}
                                        </Badge>
                                        {isActive && (
                                          <Badge className="bg-primary/15 text-primary gap-1">
                                            <span className="bg-primary size-1.5 animate-pulse rounded-full" />
                                            In progress
                                          </Badge>
                                        )}
                                        {!isActive && (
                                          <Badge variant="outline">
                                            L {100 - (session.production_percentage ?? 0)}% · P {session.production_percentage ?? 0}%
                                          </Badge>
                                        )}
                                      </div>
                                      {session.description && (
                                        <div>
                                          <p
                                            className={`text-muted-foreground text-sm whitespace-pre-wrap ${isExpanded ? "" : "line-clamp-2"}`}
                                          >
                                            {session.description}
                                          </p>
                                          {isLong && (
                                            <button
                                              type="button"
                                              onClick={() => toggleExpanded(session.id)}
                                              className="text-primary text-xs hover:underline"
                                            >
                                              {isExpanded ? "Show less" : "Show more"}
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                                      <span className="font-mono text-sm whitespace-nowrap">
                                        {formatDuration(seconds)}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="text-muted-foreground"
                                        aria-label="Edit session"
                                        onClick={() => openEditDialog(session)}
                                      >
                                        <Pencil />
                                      </Button>
                                      <AlertDialog>
                                        <AlertDialogTrigger
                                          render={
                                            <Button
                                              variant="ghost"
                                              size="icon-sm"
                                              className="text-muted-foreground hover:text-destructive"
                                              aria-label="Delete session"
                                            >
                                              <Trash2 />
                                            </Button>
                                          }
                                        />
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This will permanently delete this study session and its recorded time.
                                              This can&apos;t be undone.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteSession(session.id)}>
                                              Delete
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
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
    </Card>
  );
}
