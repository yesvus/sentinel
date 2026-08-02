import Link from "next/link";
import { Clock3 } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
import { LinkifiedText } from "@/components/linkified-text";
import { SessionEditorDialog } from "@/components/session-editor-dialog";
import { TaskEditorPopover } from "@/components/task-editor-popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { buildDaySessionTimeline } from "@/components/planning/day-session-timeline-model";
import type { StudySession, Task } from "@/lib/api";
import { formatDuration, formatTime } from "@/lib/date";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";

type DaySessionTimelineProps = {
  sessions: StudySession[];
  sessionTasks: Record<number, Task[]>;
  sessionTaskErrors: Record<number, string>;
  taskList: Task[];
  totalSessionSeconds: number;
  now: number;
  onSessionUpdated: (session: StudySession) => void;
  onTaskUpdated: (task: Task) => void;
  onSessionTasksChanged: (sessionId: number, tasks: Task[]) => void;
  onSessionTaskCreated: (sessionId: number, task: Task) => void;
  onRetrySessionTasks: (sessionId: number) => void;
};

export function DaySessionTimeline({
  sessions,
  sessionTasks,
  sessionTaskErrors,
  taskList,
  totalSessionSeconds,
  now,
  onSessionUpdated,
  onTaskUpdated,
  onSessionTasksChanged,
  onSessionTaskCreated,
  onRetrySessionTasks,
}: DaySessionTimelineProps) {
  const items = buildDaySessionTimeline(sessions, sessionTasks, now);
  const availableTasks = taskList.filter((task) => task.completed_at !== null || task.period_start === null);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          Sessions
          <HelpTooltip>A chronological record of the work behind this day.</HelpTooltip>
        </CardTitle>
        {totalSessionSeconds > 0 && (
          <CardAction><Badge variant="secondary">{formatDuration(totalSessionSeconds)}</Badge></CardAction>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <Empty className="min-h-52 border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Clock3 /></EmptyMedia>
              <EmptyTitle>No sessions on this day</EmptyTitle>
              <EmptyDescription>Tracked sessions and their descriptions will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol className="flex flex-col">
            {items.map(({ session, running, duration, completedTasks }, index) => (
              <li
                key={session.id}
                className="group/session animate-in fade-in slide-in-from-bottom-1 grid grid-cols-[4.5rem_0.75rem_minmax(0,1fr)] gap-3 pb-6 duration-300 fill-mode-both last:pb-0"
                style={{ animationDelay: `${Math.min(index * 60, 240)}ms` }}
              >
                <div className="text-muted-foreground flex flex-col gap-0.5 font-mono text-xs">
                  <time dateTime={session.started_at}>{formatTime(session.started_at)}</time>
                  <span>{running ? "Now" : formatTime(session.ended_at!)}</span>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-primary ring-card relative mt-1.5 size-2 rounded-full ring-4" />
                  {index < items.length - 1 && (
                    <span className="bg-border absolute top-4 bottom-[-1.5rem] w-px" aria-hidden="true" />
                  )}
                </div>
                <div className="relative flex min-w-0 flex-col gap-2 pr-8">
                  <div className="absolute -top-1 right-0 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover/session:opacity-100 sm:group-focus-within/session:opacity-100">
                    {!sessionTaskErrors[session.id] && sessionTasks[session.id] && (
                      <SessionEditorDialog
                        session={session}
                        tasks={completedTasks}
                        availableTasks={availableTasks}
                        onUpdated={onSessionUpdated}
                        onTaskUpdated={onTaskUpdated}
                        onTasksChanged={onSessionTasksChanged}
                        onTaskCreated={onSessionTaskCreated}
                      />
                    )}
                  </div>
                  <LinkifiedText
                    text={session.description?.trim() || "No description recorded for this session."}
                    as="p"
                    className={session.description?.trim()
                      ? "text-sm leading-relaxed whitespace-pre-wrap"
                      : "text-muted-foreground text-sm italic"}
                  />
                  {sessionTaskErrors[session.id] && (
                    <div className="border-destructive/30 bg-destructive/5 animate-in fade-in flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-2 text-xs duration-200">
                      <span className="text-destructive flex-1">{sessionTaskErrors[session.id]}</span>
                      <Button type="button" variant="outline" size="xs" onClick={() => onRetrySessionTasks(session.id)}>Retry</Button>
                    </div>
                  )}
                  {completedTasks.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-muted-foreground text-xs font-medium">Completed in this session</p>
                      <div className="flex flex-wrap gap-1.5">
                        {completedTasks.map((task) => (
                          <TaskEditorPopover
                            key={task.id}
                            task={task}
                            onUpdated={onTaskUpdated}
                            trigger="badge"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {session.project_id ? (
                      <Badge
                        variant="outline"
                        render={<Link href={`/app/projects/${session.project_id}`} />}
                        className="max-w-full"
                      >
                        <ProjectIcon icon={session.project_icon} />
                        <span className="max-w-48 truncate" title={session.project_path ?? session.project_name ?? "Project"}>
                          {session.project_path ?? session.project_name ?? "Project"}
                        </span>
                      </Badge>
                    ) : (
                      <Badge variant="outline"><NoProjectIcon />No project</Badge>
                    )}
                    <Badge variant="secondary">{running ? "Running" : formatDuration(duration)}</Badge>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
