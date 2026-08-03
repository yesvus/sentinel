import Link from "next/link";
import { Clock3 } from "lucide-react";
import type { StudySession } from "@/lib/api";
import { formatDuration } from "@/lib/date";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { Skeleton } from "@/components/ui/skeleton";

type RecentRailProps = {
  exiting: boolean;
  loaded: boolean;
  sessions: StudySession[];
  timeZone?: string;
  onViewSession: (session: StudySession) => void;
};

export function RecentRail({ exiting, loaded, sessions, timeZone, onViewSession }: RecentRailProps) {
  return (
    <aside className={`${exiting ? "animate-out fade-out slide-out-to-right-2 animation-duration-120 fill-mode-forwards" : "animate-in fade-in slide-in-from-right-1 animation-duration-180 fill-mode-both"} order-3 space-y-3 motion-reduce:transition-none`}>
      <div className="flex items-center justify-between px-1">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <Clock3 className="size-3.5" /> Recent
        </div>
      </div>
      <div className="space-y-3 px-1">
        {!loaded && (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-3 w-8 shrink-0" />
              </div>
            ))}
          </div>
        )}
        {loaded && sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => onViewSession(session)}
            className="hover:bg-muted/50 focus-visible:ring-ring -mx-1 flex w-[calc(100%+0.5rem)] min-w-0 cursor-pointer flex-col gap-0.5 rounded px-1 py-0.5 text-left text-sm transition-colors duration-150 focus-visible:ring-2"
          >
            <span className="flex min-w-0 items-start justify-between gap-2">
              <span className="text-foreground/90 flex items-center gap-1.5 truncate">
                {session.project_id ? <ProjectIcon icon={session.project_icon} className="text-muted-foreground size-3.5 shrink-0" /> : <NoProjectIcon className="text-muted-foreground size-3.5 shrink-0" />}
                <span className="truncate">{session.project_name ?? "No project"}</span>
              </span>
              <span className="text-muted-foreground shrink-0 font-mono text-xs">{formatDuration(session.duration_seconds ?? 0)}</span>
            </span>
            {session.description ? (
              <span className="text-muted-foreground line-clamp-1 text-xs">{session.description}</span>
            ) : (
              <span className="text-muted-foreground truncate text-xs">{new Date(session.started_at).toLocaleDateString(undefined, { timeZone, month: "short", day: "numeric" })}</span>
            )}
          </button>
        ))}
        {loaded && sessions.length === 0 && <p className="text-muted-foreground text-sm">Your completed sessions will show here.</p>}
        <Link href="/app/calendar/history" className="text-primary block pt-1 text-xs font-medium hover:underline">View all activity →</Link>
      </div>
    </aside>
  );
}
