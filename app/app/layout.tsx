import { cookies } from "next/headers";
import { AuthProvider } from "@/lib/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_state")?.value;

  return (
    <AuthProvider>
      <TooltipProvider>
        <AppShell defaultSidebarOpen={sidebarState !== "false"}>
          {children}
        </AppShell>
      </TooltipProvider>
    </AuthProvider>
  );
}
