import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
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
  onEdit,
  onDelete,
}: {
  session: StudySession;
  now: number;
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
    <div className="ring-foreground/10 flex flex-col gap-2 rounded-lg px-3 py-2 ring-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground font-mono text-xs">
            {formatTime(session.started_at)}-{session.ended_at ? formatTime(session.ended_at) : "now"}
          </span>
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
              <span className="bg-primary size-1.5 animate-pulse rounded-full" />
              In progress
            </Badge>
          ) : (
            <Badge variant="outline">
              L {100 - (session.production_percentage ?? 0)}% · P {session.production_percentage ?? 0}%
            </Badge>
          )}
        </div>
        {session.description && (
          <div>
            <LinkifiedText
              text={session.description}
              as="p"
              className={`text-muted-foreground text-sm whitespace-pre-wrap ${expanded ? "" : "line-clamp-2"}`}
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
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
        <span className="font-mono text-sm whitespace-nowrap">
          {formatDuration(sessionDurationSeconds(session, now))}
        </span>
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
  );
}
