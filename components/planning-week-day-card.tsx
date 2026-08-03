"use client";

import { Clock3, Square } from "lucide-react";
import { LinkifiedText } from "@/components/linkified-text";
import { Note, Project, StudySession, Task } from "@/lib/api";
import { formatDuration, formatTime } from "@/lib/date";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { sessionDurationSeconds } from "@/lib/session-stats";

export function PlanningWeekDayCard({
  date,
  isToday,
  tasks,
  note,
  projects,
  sessions,
  trackedSeconds,
  now,
  timeZone,
  onOpen,
}: {
  date: Date;
  isToday: boolean;
  tasks: Task[];
  note?: Note;
  projects: Project[];
  sessions: StudySession[];
  trackedSeconds: number;
  now: number;
  timeZone?: string;
  onOpen: () => void;
}) {
  const weekday = date.toLocaleDateString(undefined, { timeZone, weekday: "short" });
  const openTasks = tasks.filter((task) => task.completed_at === null);
  const taskGroups = new Map<string, { project: Project | null; tasks: Task[] }>();
  for (const task of openTasks) {
    const project = projects.find((item) => item.id === task.project_id) ?? null;
    const key = project ? String(project.id) : "none";
    const group = taskGroups.get(key) ?? { project, tasks: [] };
    group.tasks.push(task);
    taskGroups.set(key, group);
  }
  const orderedTaskGroups = Array.from(taskGroups.values()).sort((a, b) => {
    if (!a.project) return 1;
    if (!b.project) return -1;
    return a.project.path.localeCompare(b.project.path);
  });

  function openCard(event: React.MouseEvent | React.KeyboardEvent) {
    if ((event.target as HTMLElement).closest("a,button,input,textarea,select")) return;
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
    if ("key" in event) event.preventDefault();
    onOpen();
  }

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${weekday}, ${date.toLocaleDateString(undefined, { timeZone })}`}
      onClick={openCard}
      onKeyDown={openCard}
      className={`hover:border-primary/40 hover:bg-muted/20 focus-visible:border-ring focus-visible:ring-ring/50 flex h-[30rem] min-w-0 cursor-pointer select-none flex-col items-start overflow-hidden rounded-xl border text-left outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:ring-3 active:scale-[0.995] ${
        isToday ? "border-primary/50 bg-primary/5" : "border-border"
      }`}
    >
      <div className="bg-muted/20 flex w-full items-center justify-between gap-1 border-b px-2.5 py-2 text-left transition-colors duration-150">
        <span className="truncate text-sm font-medium">
          {weekday} <span className="text-muted-foreground font-normal">{date.toLocaleDateString(undefined, { timeZone, day: "numeric" })}</span>
        </span>
        {isToday && (
          <span className="bg-primary/15 text-primary shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
            Today
          </span>
        )}
      </div>

      <section className="flex min-h-0 w-full flex-1 flex-col border-b" aria-label={`${weekday} tasks`}>
        <div className="flex shrink-0 items-center justify-between gap-2 px-2.5 pt-2 pb-1">
          <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">Tasks</span>
          {trackedSeconds > 0 && (
            <span className="text-muted-foreground font-mono text-[10px]">{formatDuration(trackedSeconds)}</span>
          )}
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
          {orderedTaskGroups.length > 0 ? (
            <div className="w-full space-y-2.5">
              {orderedTaskGroups.map(({ project, tasks: groupTasks }) => (
                <section key={project?.id ?? "none"} className="space-y-1" aria-label={project?.name ?? "No project"}>
                  <div className="text-muted-foreground/80 flex items-center gap-1 text-[10px] font-medium">
                    {project ? <ProjectIcon icon={project.icon} className="size-3" /> : <NoProjectIcon className="size-3" />}
                    <span className="truncate" title={project?.path}>{project?.name ?? "No project"}</span>
                  </div>
                  <ul className="space-y-1">
                    {groupTasks.map((task) => (
                      <li key={task.id} className="flex items-start gap-1 text-xs">
                        <Square className="text-muted-foreground mt-0.5 size-3 shrink-0" />
                        <span className="min-w-0 break-words">{task.title}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground/60 text-xs">No open tasks</span>
          )}
        </div>
      </section>

      <section className="flex h-28 w-full shrink-0 flex-col border-b" aria-label={`${weekday} sessions`}>
        <div className="text-muted-foreground flex shrink-0 items-center gap-1 px-2.5 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide">
          <Clock3 className="size-3" /> Sessions
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
          {sessions.length > 0 ? (
            <ul className="space-y-1.5">
              {sessions.map((session) => {
                const project = projects.find((item) => item.id === session.project_id);
                return (
                  <li key={session.id} className="min-w-0 text-[10px] leading-tight">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-muted-foreground truncate">{formatTime(session.started_at, timeZone)} · {project?.name ?? "No project"}</span>
                      <span className="shrink-0 font-mono">{formatDuration(sessionDurationSeconds(session, now))}</span>
                    </div>
                    {session.description && <p className="text-muted-foreground/70 mt-0.5 line-clamp-1">{session.description}</p>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <span className="text-muted-foreground/60 text-xs">No sessions</span>
          )}
        </div>
      </section>

      <section className="bg-muted/10 flex h-24 w-full shrink-0 flex-col" aria-label={`${weekday} day note`}>
        <div className="text-muted-foreground shrink-0 px-2.5 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide">
          Day note
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
          {note?.content ? (
            <LinkifiedText text={note.content} as="p" className="text-muted-foreground w-full text-xs" />
          ) : (
            <span className="text-muted-foreground/60 text-xs">No note</span>
          )}
        </div>
      </section>
    </div>
  );
}
