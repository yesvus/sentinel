"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProjectIcon, NoProjectIcon } from "@/lib/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LinkifiedText } from "@/components/linkified-text";
import { useActiveSession } from "@/lib/active-session-context";

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds];
  return parts.map((n) => String(n).padStart(2, "0")).join(":");
}

/**
 * Lives in the app header, outside any single page, so it keeps ticking while browsing other
 * tabs. Hidden on the Home page itself, which already has its own full-size timer.
 */
export function SessionTimerIndicator() {
  const pathname = usePathname();
  const { activeSession: active, elapsedMs } = useActiveSession();

  if (!active || pathname === "/app") return null;

  const projectLabel = active.project_path ?? active.project_name ?? "No project";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="bg-primary/10 text-primary hover:bg-primary/15 flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-3 pl-2 text-sm transition-colors"
          />
        }
      >
        {active.project_id ? (
          <ProjectIcon icon={active.project_icon} className="size-3.5 shrink-0" />
        ) : (
          <NoProjectIcon className="size-3.5 shrink-0" />
        )}
        <span className="font-mono tabular-nums">{formatElapsed(elapsedMs)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            {active.project_id ? (
              <ProjectIcon icon={active.project_icon} className="size-4 shrink-0" />
            ) : (
              <NoProjectIcon className="size-4 shrink-0" />
            )}
            <span className="min-w-0 truncate">{projectLabel}</span>
          </div>
          <p className="font-mono text-2xl font-medium tabular-nums sm:text-3xl">{formatElapsed(elapsedMs)}</p>
          {active.description && (
            <LinkifiedText text={active.description} as="p" className="text-muted-foreground line-clamp-3 text-sm" />
          )}
          <Link href="/app" className="text-primary block pt-1 text-xs font-medium hover:underline">
            Go to timer →
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
