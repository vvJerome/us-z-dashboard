import { Database, ListChecks, Server } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useJobs } from "../hooks/useJobs";
import { useVps } from "../hooks/useVps";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const NAV_ITEMS = [
  { title: "Jobs", href: "/", icon: ListChecks },
  { title: "Inspect", href: "/inspect", icon: Database },
  { title: "Workers", href: "/vps", icon: Server },
];

export function AppSidebar() {
  const location = useLocation();
  const { collapsed } = useSidebar();
  const { data: vpsList } = useVps();
  const { data: jobData } = useJobs();
  const busyVpsIds = new Set(
    (jobData?.jobs ?? [])
      .filter((j) => j.status === "RUNNING" && j.vps_id)
      .map((j) => j.vps_id),
  );
  const vpsStatus = vpsList
    ? `${busyVpsIds.size}/${vpsList.length} busy`
    : null;

  return (
    <Sidebar>
      <SidebarHeader>
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1.5",
            collapsed && "justify-center px-0",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-xs font-bold text-background">
            EE
          </span>
          {!collapsed && (
            <span className="truncate font-semibold">Enrichment Engine</span>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {NAV_ITEMS.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={location.pathname === item.href}
                className={collapsed ? "justify-center px-0" : undefined}
              >
                <Link to={item.href} title={collapsed ? item.title : undefined}>
                  <item.icon />
                  {!collapsed && <span className="flex-1">{item.title}</span>}
                  {!collapsed && item.href === "/vps" && vpsStatus && (
                    <span className="text-xs text-sidebar-foreground/60">
                      {vpsStatus}
                    </span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <div
          className={cn(
            "flex items-center px-2 py-1.5",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          {!collapsed && (
            <span className="text-xs text-sidebar-foreground/70">Theme</span>
          )}
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
