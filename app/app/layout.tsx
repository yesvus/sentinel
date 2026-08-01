import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_state")?.value;

  return <AppShell defaultSidebarOpen={sidebarState !== "false"}>{children}</AppShell>;
}
