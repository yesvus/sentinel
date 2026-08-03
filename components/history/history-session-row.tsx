import { useState } from "react";
import { CheckCircle2, CircleDot, Clock3, Pencil, Trash2 } from "lucide-react";
import type { StudySession } from "@/lib/api";
import { formatDuration, formatTime } from "@/lib/date";
import { sessionDurationSeconds } from "@/lib/session-stats";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { LinkifiedText } from "@/components/linkified-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const DESCRIPTION_PREVIEW_LENGTH = 80;

export function HistorySessionRow({
  session,
  now,
  timeZone,
  onEdit,
  onDelete,
}: {
  session: StudySession;
  now: number;
  timeZone?: string;
  onEdit: (session: StudySession) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const active = session.ended_at === null;
  const isLong = Boolean(
    session.description &&
      (session.description.length > DESCRIPTION_PREVIEW_LENGTH || session.description.includes("\n")),
  );

  return (
    <article className="ring-foreground/10 hover:bg-muted/10 grid gap-3 rounded-lg px-3 py-2.5 ring-1 transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={session.project_name ? "secondary" : "outline"} className="gap-1">
            {session.project_id ? (
              <ProjectIcon icon={session.project_icon} className="size-3" />
            ) : (
              <NoProjectIcon className="size-3" />
            )}
            {session.project_path ?? session.project_name ?? "No project"}
          </Badge>
          {active ? (
            <Badge className="bg-primary/15 text-primary gap-1">
              <CircleDot className="animate-pulse" />
              Ongoing
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <CheckCircle2 /> Completed
            </Badge>
          )}
          {!active && session.production_percentage !== undefined && session.production_percentage !== null && (
            <span className="text-muted-foreground text-xs">
              L {100 - session.production_percentage}% · P {session.production_percentage}%
            </span>
          )}
        </div>
        {session.description && (
          <div>
            <LinkifiedText
              text={session.description}
              as="p"
              className={`text-sm whitespace-pre-wrap ${expanded ? "" : "line-clamp-2"}`}
            />
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="text-primary text-xs hover:underline"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
        {!session.description && <p className="text-muted-foreground/70 text-sm italic">No description</p>}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
        <div className="mr-auto flex items-center gap-3 sm:mr-1 sm:flex-col sm:items-end sm:gap-0.5">
          <span className="flex items-center gap-1 font-mono text-sm font-medium whitespace-nowrap">
            <Clock3 className="text-muted-foreground size-3.5" />
            {formatDuration(sessionDurationSeconds(session, now))}
          </span>
          <span className="text-muted-foreground font-mono text-xs whitespace-nowrap">
            {formatTime(session.started_at, timeZone)}-{session.ended_at ? formatTime(session.ended_at, timeZone) : "now"}
          </span>
        </div>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="Edit session"
            onClick={() => onEdit(session)}
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
                  This will permanently delete this study session and its recorded time. This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(session.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </article>
  );
}
