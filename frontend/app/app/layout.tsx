"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, NAV_ITEMS } from "@/components/app-sidebar";
import { useAuth } from "@/lib/auth-context";

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

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="bg-sidebar sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <h1 className="text-sm font-medium">{currentPage?.title}</h1>
        </header>
        <div className="flex min-w-0 flex-1 flex-col px-4 py-6 sm:px-6">{children}</div>
      </main>
    </SidebarProvider>
  );
}
