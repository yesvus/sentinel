"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sessions, StudySession } from "@/lib/api";
import { ProjectIcon, NoProjectIcon } from "@/lib/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BROADCAST_CHANNEL_NAME, SessionBroadcastMessage } from "@/lib/session-sync";

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
  const [active, setActive] = useState<StudySession | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const channelRef = useRef<BroadcastChannel | null>(null);

  function refetch() {
    sessions
      .getActive()
      .then((session) => {
        setActive(session);
        setElapsedMs(session ? Math.max(0, Date.now() - new Date(session.started_at).getTime()) : 0);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refetch();
  }, []);

  // Same-tab-group sync: mirrors the broadcast the Home page's timer sends.
  useEffect(() => {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channelRef.current = channel;

    function handleMessage(event: MessageEvent<SessionBroadcastMessage>) {
      const message = event.data;
      if (message.type === "started" || message.type === "updated") {
        // Broadcasts carry projectId but not the project's name/icon; refetch for the full record.
        refetch();
      } else if (message.type === "stopped") {
        setActive(null);
        setElapsedMs(0);
      }
    }

    channel.addEventListener("message", handleMessage);
    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
      channelRef.current = null;
    };
  }, []);

  // Cross-device/tab catch-up when this tab regains focus.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") refetch();
    }
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const started = new Date(active.started_at).getTime();
    const interval = setInterval(() => setElapsedMs(Date.now() - started), 1000);
    return () => clearInterval(interval);
  }, [active]);

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
          <p className="font-mono text-3xl font-medium tabular-nums">{formatElapsed(elapsedMs)}</p>
          {active.description && (
            <p className="text-muted-foreground line-clamp-3 text-sm whitespace-pre-wrap">{active.description}</p>
          )}
          <Link href="/app" className="text-primary block pt-1 text-xs font-medium hover:underline">
            Go to timer →
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
