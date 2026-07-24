"use client";

import { useEffect, useState, FormEvent } from "react";
import { Trophy, Hourglass, BarChart3, Layers, History as HistoryIcon, Trash2, Plus } from "lucide-react";
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
  DialogTrigger,
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
import { sessions as sessionsApi, projects as projectsApi, ApiError, StudySession, Project } from "@/lib/api";
import { ProjectIcon } from "@/lib/icons";

const WEEKS = 14;
const DAYS = WEEKS * 7;
const BAR_CHART_DAYS = 14;
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const NO_PROJECT_LABEL = "No project";

function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

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

export default function StatsPage() {
  const [sessionList, setSessionList] = useState<StudySession[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState(() => toDateInput(new Date()));
  const [addStartTime, setAddStartTime] = useState(() => toTimeInput(new Date(Date.now() - 60 * 60 * 1000)));
  const [addEndTime, setAddEndTime] = useState(() => toTimeInput(new Date()));
  const [addProjectId, setAddProjectId] = useState<number | null>(null);
  const [addDescription, setAddDescription] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  function toggleExpanded(id: number) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    sessionsApi
      .list()
      .then(setSessionList)
      .finally(() => setLoading(false));
    projectsApi.list().then(setProjectList).catch(() => {});
  }, []);

  useEffect(() => {
    const hasActiveSession = sessionList.some((s) => s.ended_at === null);
    if (!hasActiveSession) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [sessionList]);

  const completed = sessionList.filter((s) => s.ended_at !== null && s.duration_seconds !== null);

  const totalsByDay = new Map<string, number>();
  for (const session of completed) {
    const key = dayKey(new Date(session.started_at));
    totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + session.duration_seconds!);
  }

  const heatmapDays = buildLastNDays(totalsByDay, DAYS);
  const weeks = buildHeatmapWeeks(heatmapDays);
  const barDays = buildLastNDays(totalsByDay, BAR_CHART_DAYS);
  const maxBarSeconds = Math.max(1, ...barDays.map((d) => d.seconds));

  const projectTotals = new Map<string, { name: string; icon: string | null; seconds: number }>();
  for (const session of completed) {
    const key = session.project_id !== null ? String(session.project_id) : "none";
    const name = session.project_name ?? NO_PROJECT_LABEL;
    const existing = projectTotals.get(key);
    projectTotals.set(key, {
      name,
      icon: session.project_icon,
      seconds: (existing?.seconds ?? 0) + session.duration_seconds!,
    });
  }
  const breakdown = Array.from(projectTotals.values()).sort((a, b) => b.seconds - a.seconds);
  const maxProjectSeconds = Math.max(1, ...breakdown.map((p) => p.seconds));
  const topProject = breakdown.filter((p) => p.name !== NO_PROJECT_LABEL)[0] ?? null;

  async function handleDeleteSession(id: number) {
    try {
      await sessionsApi.remove(id);
      setSessionList((list) => list.filter((s) => s.id !== id));
    } catch {
      // best-effort; leave the session in place if the delete failed
    }
  }

  async function handleAddSession(e: FormEvent) {
    e.preventDefault();
    setAddError(null);

    const startedAt = new Date(`${addDate}T${addStartTime}`);
    const endedAt = new Date(`${addDate}T${addEndTime}`);

    if (endedAt <= startedAt) {
      setAddError("End time must be after start time");
      return;
    }

    setAddBusy(true);
    try {
      const created = await sessionsApi.createManual({
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        projectId: addProjectId,
        description: addDescription || null,
      });
      const project = projectList.find((p) => p.id === addProjectId) ?? null;
      setSessionList((list) =>
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
          },
          ...list,
        ].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      );
      setAddOpen(false);
      setAddDescription("");
      setAddProjectId(null);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setAddBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div className="flex flex-wrap items-stretch gap-8">
        <Card className="shrink-0">
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

        <Card className="min-w-48 flex-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="text-muted-foreground size-4" />
              Top project
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProject ? (
              <p className="text-lg font-medium">
                {topProject.name}{" "}
                <span className="text-muted-foreground text-sm font-normal">
                  ({formatDuration(topProject.seconds)})
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">No project sessions yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="text-muted-foreground size-4" />
              Duration by day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Last {BAR_CHART_DAYS} days.</p>

            <div className="mt-4 flex h-32 items-end gap-1">
              {barDays.map((day) => (
                <Tooltip key={day.key}>
                  <TooltipTrigger
                    render={
                      <div className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                        <div
                          className="bg-primary min-h-[2px] w-full rounded-t-sm"
                          style={{ height: `${(day.seconds / maxBarSeconds) * 100}%` }}
                        />
                      </div>
                    }
                  />
                  <TooltipContent>
                    {day.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}:{" "}
                    {day.seconds > 0 ? formatDuration(day.seconds) : "no study"}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <div className="text-muted-foreground mt-1 flex justify-between text-[10px]">
              <span>{barDays[0].date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <span>
                {barDays[barDays.length - 1].date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="text-muted-foreground size-4" />
              Project breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {breakdown.length === 0 && (
              <p className="text-muted-foreground text-sm">No sessions yet.</p>
            )}
            <div className="space-y-3">
              {breakdown.map((project) => (
                <div key={project.name} className="space-y-1">
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
                      style={{ width: `${(project.seconds / maxProjectSeconds) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <HistoryIcon className="text-muted-foreground size-4" />
            History
          </CardTitle>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm" className="gap-1">
                  <Plus className="size-4" />
                  Add session
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a session</DialogTitle>
                <DialogDescription>
                  For time you forgot to track live. It's added as an already-finished session.
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
                <div className="grid grid-cols-2 gap-3">
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
                {addError && <p className="text-destructive text-sm">{addError}</p>}
                <DialogFooter>
                  <Button type="submit" disabled={addBusy}>
                    {addBusy ? "Adding..." : "Add session"}
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
          <div className="space-y-2">
            {sessionList.map((session) => {
              const isActive = session.ended_at === null;
              const seconds = isActive
                ? Math.floor((now - new Date(session.started_at).getTime()) / 1000)
                : (session.duration_seconds ?? 0);

              const isExpanded = expandedIds.has(session.id);
              const isLong =
                !!session.description &&
                (session.description.length > DESCRIPTION_PREVIEW_LENGTH || session.description.includes("\n"));

              return (
              <div key={session.id} className="flex items-start justify-between gap-4 rounded-lg ring-1 ring-foreground/10 px-3 py-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {new Date(session.started_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
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
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-sm whitespace-nowrap">
                    {formatDuration(seconds)}
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive">
                          <Trash2 />
                        </Button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this study session and its recorded time. This can&apos;t be undone.
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
        </CardContent>
      </Card>
    </div>
  );
}
