"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, NAV_ITEMS } from "@/components/app-sidebar";
import { useAuth } from "@/lib/auth-context";
import { NoisePlayerProvider } from "@/lib/noise-player";
import { NoiseControl } from "@/components/noise-control";
import { FriendsControl } from "@/components/friends-control";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return null;
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
      <SidebarProvider>
        <AppSidebar />
        <main className="flex h-svh min-w-0 flex-1 flex-col overflow-hidden">
          <header className="bg-sidebar z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <h1 className="flex-1 text-sm font-medium">{pageTitle}</h1>
            <FriendsControl />
            <NoiseControl />
          </header>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
            {children}
          </div>
        </main>
      </SidebarProvider>
    </NoisePlayerProvider>
  );
}
