"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Clock3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, ProjectIcon } from "@/lib/icons";
import { FriendActivity, social } from "@/lib/api";

function name(item: FriendActivity) {
  return item.user_name?.trim() || item.user_email;
}

function duration(item: FriendActivity) {
  const seconds =
    item.duration_seconds ??
    Math.max(0, Math.floor((Date.now() - new Date(item.started_at).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`;
}

export function FriendsControl() {
  const [activity, setActivity] = useState<FriendActivity[]>([]);

  const load = useCallback(() => {
    social.activity().then((page) => setActivity(page.items)).catch(() => {});
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(load, 0);
    const pollTimer = window.setInterval(load, 10_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  const currentStudyers = activity.filter((item) => item.ended_at === null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${currentStudyers.length} friends currently active`}
          />
        }
      >
        <Users />
        <span className="hidden sm:inline">Activity</span>
        {currentStudyers.length > 0 && (
          <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs">
            {currentStudyers.length}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Current activity</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {currentStudyers.slice(0, 5).map((item) => (
          <DropdownMenuItem
            key={item.id}
            render={<Link href="/app/friends" />}
            className="items-start gap-3 py-2"
          >
            <Avatar avatar={item.user_avatar} className="size-8 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{name(item)}</span>
                <span className="bg-primary size-1.5 shrink-0 animate-pulse rounded-full" />
              </div>
              <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                <ProjectIcon icon={item.project_icon} className="size-3.5" />
                <span className="max-w-32 truncate">{item.project_name || "No project"}</span>
                <span>·</span>
                <Clock3 className="size-3" />
                <span>{duration(item)}</span>
              </div>
            </div>
          </DropdownMenuItem>
        ))}
        {currentStudyers.length === 0 && (
          <p className="text-muted-foreground px-2 py-4 text-center text-sm">
            No current friend activity.
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/app/friends" />}>
          <Users />
          Open Friends
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
