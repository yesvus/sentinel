"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, NAV_ITEMS } from "@/components/app-sidebar";
import { sessions, StudySession } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ActiveSessionProvider } from "@/lib/active-session-context";
import { NoisePlayerProvider } from "@/lib/noise-player";
import { NoiseControl } from "@/components/noise-control";
import { FriendsControl } from "@/components/friends-control";
import { NotificationsControl } from "@/components/notifications-control";
import { SessionTimerIndicator } from "@/components/session-timer-indicator";
import { Toaster } from "@/components/ui/toast";

function Splash() {
  return (
    <div className="flex h-svh w-full items-center justify-center bg-zinc-950">
      <p
        className="animate-pulse text-2xl tracking-tight text-white"
        style={{ fontFamily: "var(--font-wordmark)", fontWeight: 800 }}
      >
        Sentinel
      </p>
    </div>
  );
}

export function AppShell({
  children,
  defaultSidebarOpen,
}: {
  children: React.ReactNode;
  defaultSidebarOpen: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [activeSession, setActiveSession] = useState<StudySession | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    sessions
      .getActive()
      .then(setActiveSession)
      .catch(() => {})
      .finally(() => setSessionChecked(true));
  }, [user]);

  if (loading || !user || !sessionChecked) {
    return <Splash />;
  }

  const currentPage = NAV_ITEMS.find((item) => item.url === pathname);
  const pageTitle =
    currentPage?.title ??
    ({
      "/app/friends": "Friends",
      "/app/profile": "Profile",
      "/app/settings": "Settings",
    } as Record<string, string>)[pathname];

  return (
    <NoisePlayerProvider>
      <ActiveSessionProvider activeSession={activeSession}>
        <SidebarProvider defaultOpen={activeSession ? false : defaultSidebarOpen}>
          <AppSidebar />
          <main className="flex h-svh min-w-0 flex-1 flex-col overflow-hidden">
            <header className="bg-sidebar z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4">
              <SidebarTrigger />
              <SessionTimerIndicator />
              <h1 className="flex-1 text-sm font-medium">{pageTitle}</h1>
              <FriendsControl />
              <NotificationsControl userId={user.id} />
              <NoiseControl />
            </header>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
              {children}
            </div>
          </main>
        </SidebarProvider>
      </ActiveSessionProvider>
      <Toaster />
    </NoisePlayerProvider>
  );
}
