import Link from "next/link";
import { Clock3 } from "lucide-react";
import type { StudySession } from "@/lib/api";
import { formatDuration } from "@/lib/date";
import { NoProjectIcon, ProjectIcon } from "@/lib/icons";
import { LinkifiedText } from "@/components/linkified-text";
import { Skeleton } from "@/components/ui/skeleton";

type RecentRailProps = {
  exiting: boolean;
  loaded: boolean;
  sessions: StudySession[];
  onViewSession: (session: StudySession) => void;
};

export function RecentRail({ exiting, loaded, sessions, onViewSession }: RecentRailProps) {
  return (
    <aside className={`${exiting ? "animate-out fade-out slide-out-to-right-2 animation-duration-250 fill-mode-forwards" : "animate-in fade-in slide-in-from-right-2 animation-duration-500 delay-150 fill-mode-both"} order-3 space-y-3 motion-reduce:transition-none`}>
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
          <div key={session.id} className="hover:bg-muted/50 -mx-1 flex w-[calc(100%+0.5rem)] min-w-0 flex-col gap-0.5 rounded px-1 py-0.5 text-sm transition-colors duration-150">
            <button type="button" onClick={() => onViewSession(session)} className="flex min-w-0 cursor-pointer items-start justify-between gap-2 text-left">
              <p className="text-foreground/90 flex items-center gap-1.5 truncate">
                {session.project_id ? <ProjectIcon icon={session.project_icon} className="text-muted-foreground size-3.5 shrink-0" /> : <NoProjectIcon className="text-muted-foreground size-3.5 shrink-0" />}
                <span className="truncate">{session.project_name ?? "No project"}</span>
              </p>
              <span className="text-muted-foreground shrink-0 font-mono text-xs">{formatDuration(session.duration_seconds ?? 0)}</span>
            </button>
            {session.description ? (
              <LinkifiedText text={session.description} as="p" className="text-muted-foreground line-clamp-1 text-xs" />
            ) : (
              <p className="text-muted-foreground truncate text-xs">{new Date(session.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
            )}
          </div>
        ))}
        {loaded && sessions.length === 0 && <p className="text-muted-foreground text-sm">Your completed sessions will show here.</p>}
        <Link href="/app/calendar/history" className="text-primary block pt-1 text-xs font-medium hover:underline">View all activity →</Link>
      </div>
    </aside>
  );
}
