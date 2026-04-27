"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  CalendarClock,
  Users,
  FileBarChart,
  Calculator,
  Settings,
  LogOut,
  Tablet,
  HardHat,
  LayoutGrid,
  CreditCard,
  CalendarX,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type MenuItem = { title: string; href: string; icon: React.ComponentType<{ className?: string }>; badge?: string };

// 全テナント共通メニュー
const baseMenuItems: MenuItem[] = [
  { title: "ダッシュボード", href: "/dashboard", icon: LayoutDashboard },
  { title: "勤怠一覧", href: "/attendance", icon: CalendarDays },
  { title: "シフト管理", href: "/shifts", icon: CalendarClock },
  { title: "休日希望", href: "/day-off-requests", icon: CalendarX },
  { title: "従業員管理", href: "/employees", icon: Users },
  { title: "レポート", href: "/reports", icon: FileBarChart },
  { title: "給与計算", href: "/payroll", icon: Calculator },
  { title: "設定", href: "/settings", icon: Settings },
];

// 現場管理機能ON時のみ表示するメニュー
const jobSiteMenuItems: MenuItem[] = [
  { title: "配置表", href: "/board", icon: LayoutGrid },
  { title: "現場管理", href: "/job-sites", icon: HardHat },
  { title: "タイムカード", href: "/timecard", icon: CreditCard },
];

export function AppSidebar({
  tenantName,
  enableJobSites = false,
}: {
  tenantName: string;
  enableJobSites?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  // enableJobSites がONのテナントだけ追加メニューを表示
  const menuItems = enableJobSites
    ? [baseMenuItems[0], ...jobSiteMenuItems, ...baseMenuItems.slice(1)]
    : baseMenuItems;

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          <div>
            <p className="font-semibold text-sm">勤怠管理</p>
            <p className="text-xs text-muted-foreground">{tenantName}</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>メニュー</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href || pathname.startsWith(item.href + "/")}>
                    <Link href={item.href} className="flex items-center justify-between w-full">
                      <span className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </span>
                      {item.badge && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium leading-none">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>打刻</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/clock" target="_blank">
                    <Tablet className="h-4 w-4" />
                    <span>タイムレコーダー</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          ログアウト
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
