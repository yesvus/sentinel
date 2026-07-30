"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, BarChart2, User, Settings, LogOut, ChevronsUpDown, Moon, Sun, FolderKanban, Monitor, Clock3, Check, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { auth } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/lib/icons";
import { useTheme } from "@/lib/theme-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const NAV_ITEMS = [
  { title: "Home", url: "/app", icon: Home },
  { title: "Stats", url: "/app/stats", icon: BarChart2 },
  { title: "Projects", url: "/app/projects", icon: FolderKanban },
  { title: "Friends", url: "/app/friends", icon: Users },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { mode, setMode } = useTheme();

  async function handleLogout() {
    await auth.logout();
    await refresh();
    router.push("/login");
  }

  function handleNavigate() {
    if (isMobile) setOpenMobile(false);
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b">
        <p
          className="text-primary px-2 text-lg tracking-tight"
          style={{ fontFamily: "var(--font-wordmark)", fontWeight: 800 }}
        >
          {state === "collapsed" ? "S" : "Sentinel"}
        </p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    render={<Link href={item.url} />}
                    isActive={pathname === item.url}
                    tooltip={item.title}
                    onClick={handleNavigate}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    tooltip={user?.email ?? "Account"}
                    className="data-popup-open:bg-sidebar-accent"
                  />
                }
              >
                <Avatar
                  avatar={user?.avatar ?? null}
                  className="size-8 shrink-0 overflow-hidden rounded-full"
                />
                <div className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">{user?.name || "Account"}</span>
                  <span className="text-muted-foreground block truncate text-xs">{user?.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" sideOffset={8} className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/app/profile" />} onClick={handleNavigate}>
                  <User /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/app/settings" />} onClick={handleNavigate}>
                  <Settings /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Appearance</DropdownMenuLabel>
                  {([
                    ["system", "System", Monitor],
                    ["light", "Light", Sun],
                    ["dark", "Dark", Moon],
                    ["scheduled", "Scheduled", Clock3],
                  ] as const).map(([value, label, Icon]) => (
                    <DropdownMenuItem key={value} onClick={() => setMode(value)}>
                      <Icon />
                      <span className="flex-1">{label}</span>
                      {mode === value && <Check />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                  <LogOut /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
