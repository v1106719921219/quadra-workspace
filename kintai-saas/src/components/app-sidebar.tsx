"use client";

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
  Briefcase,
  FileBarChart,
  Calculator,
  Settings,
  LogOut,
  Tablet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const menuItems = [
  { title: "ダッシュボード", href: "/dashboard", icon: LayoutDashboard },
  { title: "勤怠一覧", href: "/attendance", icon: CalendarDays },
  { title: "シフト管理", href: "/shifts", icon: CalendarClock },
  { title: "従業員管理", href: "/employees", icon: Users },
  { title: "業務タイプ", href: "/work-types", icon: Briefcase },
  { title: "レポート", href: "/reports", icon: FileBarChart },
  { title: "給与計算", href: "/payroll", icon: Calculator },
  { title: "設定", href: "/settings", icon: Settings },
];

export function AppSidebar({ tenantName }: { tenantName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

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
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
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
