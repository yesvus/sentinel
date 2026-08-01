"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { social, SocialNotification } from "@/lib/api";
import { Avatar } from "@/lib/icons";
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
import { toast, TOAST_HISTORY_EVENT, ToastHistoryEntry } from "@/components/ui/toast";

const POLL_INTERVAL_MS = 5_000;
const MAX_TOAST_HISTORY = 15;
const TOAST_HISTORY_STORAGE_KEY = "sentinel-toast-history";

function loadStoredToastHistory(): ToastHistoryEntry[] {
  try {
    const stored = JSON.parse(localStorage.getItem(TOAST_HISTORY_STORAGE_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function toastTimeLabel(createdAt: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function actorName(notification: SocialNotification) {
  return notification.actor.name?.trim() || notification.actor.email;
}

function playNudgeSound() {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const gain = context.createGain();
  const oscillator = context.createOscillator();
  const now = context.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(620, now);
  oscillator.frequency.exponentialRampToValueAtTime(820, now + 0.14);
  oscillator.frequency.setValueAtTime(720, now + 0.3);
  oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.48);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.32);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.65);
  oscillator.addEventListener("ended", () => void context.close(), { once: true });
  void context.resume();
}

function timeLabel(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(`${value}Z`).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationsControl({ userId }: { userId: number }) {
  const [notifications, setNotifications] = useState<SocialNotification[]>([]);
  const [toastHistory, setToastHistory] = useState<ToastHistoryEntry[]>([]);
  const [clearingNudges, setClearingNudges] = useState(false);
  const [clearingToasts, setClearingToasts] = useState(false);
  const initialized = useRef(false);
  const knownIds = useRef(new Set<number>());
  const soundKey = `sentinel-last-nudge-sound:${userId}`;

  useEffect(() => {
    const timer = window.setTimeout(() => setToastHistory(loadStoredToastHistory()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleToast(event: Event) {
      const entry = (event as CustomEvent<ToastHistoryEntry>).detail;
      // Nudge toasts already show up in the Notifications group above — don't duplicate them here.
      if (entry.id.startsWith("nudge-")) return;
      setToastHistory((current) => {
        const next = [entry, ...current].slice(0, MAX_TOAST_HISTORY);
        localStorage.setItem(TOAST_HISTORY_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }
    window.addEventListener(TOAST_HISTORY_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_HISTORY_EVENT, handleToast);
  }, []);

  const load = useCallback(async () => {
    const next = await social.notifications();
    const fresh = initialized.current
      ? next.filter((notification) => !knownIds.current.has(notification.id))
      : [];
    next.forEach((notification) => knownIds.current.add(notification.id));
    initialized.current = true;
    setNotifications(next);

    if (document.visibilityState !== "visible") return;
    for (const notification of fresh.reverse()) {
      const lastSoundId = Number(localStorage.getItem(soundKey) ?? 0);
      if (notification.id <= lastSoundId) continue;
      localStorage.setItem(soundKey, String(notification.id));
      playNudgeSound();
      toast.add({
        id: `nudge-${notification.id}`,
        type: "info",
        title: `${actorName(notification)} nudged you`,
        description: "A little push to get back into focus.",
      });
    }
  }, [soundKey]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void load(), 0);
    const pollTimer = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  const unread = notifications.filter((notification) => notification.readAt === null).length;

  async function markRead(open: boolean) {
    if (!open || unread === 0) return;
    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        readAt: notification.readAt ?? new Date().toISOString(),
      }))
    );
    await social.readNotifications().catch(() => void load());
  }

  async function dismiss(id: number) {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
    await social.dismissNotification(id).catch(() => void load());
  }

  async function clearAll() {
    setClearingNudges(true);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    setNotifications([]);
    setClearingNudges(false);
    await social.clearNotifications().catch(() => void load());
  }

  async function clearToastHistory() {
    setClearingToasts(true);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    setToastHistory([]);
    localStorage.removeItem(TOAST_HISTORY_STORAGE_KEY);
    setClearingToasts(false);
  }

  return (
    <DropdownMenu onOpenChange={markRead}>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={unread ? `${unread} unread notifications` : "Notifications"}
            className="relative"
          />
        }
      >
        <Bell />
        {unread > 0 && (
          <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 min-w-4 rounded-full px-1 text-center text-[10px] leading-4">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="w-80">
        <DropdownMenuGroup>
          <div className="flex items-center justify-between gap-2 px-1.5 py-1">
            <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
            {notifications.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground h-auto px-1.5 py-0.5 text-xs"
                onClick={clearAll}
              >
                Clear all
              </Button>
            )}
          </div>
          {notifications.length === 0 && (
            <DropdownMenuItem disabled>No notifications yet.</DropdownMenuItem>
          )}
          {notifications.slice(0, 10).map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              closeOnClick={false}
              className={`items-start gap-3 py-2 transition-opacity duration-150 ${clearingNudges ? "opacity-0" : "opacity-100"}`}
            >
              <Avatar avatar={notification.actor.avatar} className="size-8 shrink-0 rounded-full" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">
                  <span className="font-medium">{actorName(notification)}</span> nudged you
                </span>
                <span className="text-muted-foreground block text-xs">
                  {timeLabel(notification.createdAt)}
                </span>
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground shrink-0"
                aria-label="Dismiss notification"
                onClick={(event) => {
                  event.stopPropagation();
                  dismiss(notification.id);
                }}
              >
                <X className="size-3.5" />
              </Button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {toastHistory.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <div className="flex items-center justify-between gap-2 px-1.5 py-1">
                <DropdownMenuLabel className="p-0">Recent activity</DropdownMenuLabel>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground h-auto px-1.5 py-0.5 text-xs"
                  onClick={clearToastHistory}
                >
                  Clear
                </Button>
              </div>
              {toastHistory.map((entry) => (
                <DropdownMenuItem
                  key={entry.id}
                  closeOnClick={false}
                  className={`items-start gap-3 py-2 transition-opacity duration-150 ${clearingToasts ? "opacity-0" : "opacity-100"}`}
                >
                  <span className="min-w-0 flex-1">
                    {entry.title && <span className="block text-sm font-medium">{entry.title}</span>}
                    {entry.description && (
                      <span className="text-muted-foreground block text-xs">{entry.description}</span>
                    )}
                    <span className="text-muted-foreground/70 block text-xs">{toastTimeLabel(entry.createdAt)}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
