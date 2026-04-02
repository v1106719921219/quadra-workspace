import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, Briefcase } from "lucide-react";

function toJST(isoString: string): string {
  const date = new Date(isoString);
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  // 従業員数
  const { count: employeeCount } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  // 今日の出勤中（日本時間で日付を取得）
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jstNow.toISOString().split("T")[0];
  const { data: activeRecords } = await supabase
    .from("time_records")
    .select("id, employee_id, clock_in, employees(name), work_types(name)")
    .eq("work_date", today)
    .is("clock_out", null);

  // 今日の完了レコード
  const { data: completedRecords } = await supabase
    .from("time_records")
    .select("id, employee_id, clock_in, clock_out, break_minutes, employees(name), work_types(name)")
    .eq("work_date", today)
    .not("clock_out", "is", null);

  // 業務タイプ数
  const { count: workTypeCount } = await supabase
    .from("work_types")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">従業員数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employeeCount ?? 0}名</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">出勤中</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeRecords?.length ?? 0}名</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">業務タイプ</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workTypeCount ?? 0}種類</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>今日の出勤状況</CardTitle>
        </CardHeader>
        <CardContent>
          {(activeRecords?.length ?? 0) === 0 && (completedRecords?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">今日の出勤記録はありません</p>
          ) : (
            <div className="space-y-2">
              {activeRecords?.map((record) => {
                const emp = record.employees as unknown as { name: string };
                const wt = record.work_types as unknown as { name: string };
                const clockIn = toJST(record.clock_in);
                return (
                  <div key={record.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="default" className="bg-green-500">出勤中</Badge>
                      <span className="font-medium">{emp?.name}</span>
                      <span className="text-sm text-muted-foreground">{wt?.name}</span>
                    </div>
                    <span className="text-sm">{clockIn}~</span>
                  </div>
                );
              })}
              {completedRecords?.map((record) => {
                const emp = record.employees as unknown as { name: string };
                const wt = record.work_types as unknown as { name: string };
                const clockIn = toJST(record.clock_in);
                const clockOut = toJST(record.clock_out!);
                return (
                  <div key={record.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">退勤済</Badge>
                      <span className="font-medium">{emp?.name}</span>
                      <span className="text-sm text-muted-foreground">{wt?.name}</span>
                    </div>
                    <span className="text-sm">{clockIn}~{clockOut}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
