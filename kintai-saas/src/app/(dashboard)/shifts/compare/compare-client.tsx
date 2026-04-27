"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getShiftComparison } from "../actions";
import { toast } from "sonner";

interface ShiftRecord {
  id: string;
  employee_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  employees: { name: string };
  work_types: { name: string };
}

interface TimeRecord {
  id: string;
  employee_id: string;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  employees: { name: string };
  work_types: { name: string };
}

type Status = "normal" | "late" | "early_leave" | "absent" | "unscheduled";

function formatTimeFromISO(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusBadge(status: Status) {
  switch (status) {
    case "normal":
      return <Badge className="bg-green-500">正常</Badge>;
    case "late":
      return <Badge className="bg-yellow-500">遅刻</Badge>;
    case "early_leave":
      return <Badge className="bg-orange-500">早退</Badge>;
    case "absent":
      return <Badge variant="destructive">欠勤</Badge>;
    case "unscheduled":
      return <Badge variant="secondary">シフト外出勤</Badge>;
  }
}

function determineStatus(
  shift: ShiftRecord | undefined,
  record: TimeRecord | undefined
): Status {
  if (!shift && record) return "unscheduled";
  if (shift && !record) return "absent";
  if (!shift || !record) return "normal";

  // 実績の出勤時間をHH:MM形式に変換
  const actualIn = formatTimeFromISO(record.clock_in);

  // シフトの開始時間（HH:MM）
  const scheduledIn = shift.start_time.slice(0, 5);

  // 遅刻判定: 実際の出勤がシフト開始より遅い
  if (actualIn > scheduledIn) return "late";

  // 早退判定: 退勤済みで、実際の退勤がシフト終了より早い
  if (record.clock_out) {
    const actualOut = formatTimeFromISO(record.clock_out);
    const scheduledOut = shift.end_time.slice(0, 5);
    if (actualOut < scheduledOut) return "early_leave";
  }

  return "normal";
}

interface ComparisonRow {
  employeeId: string;
  employeeName: string;
  shift?: ShiftRecord;
  record?: TimeRecord;
  status: Status;
}

export function CompareClient() {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function loadComparison(d: string) {
    setDate(d);
    try {
      const { shifts, records } = await getShiftComparison(d);
      const shiftList = shifts as unknown as ShiftRecord[];
      const recordList = records as unknown as TimeRecord[];

      // 全従業員を集めてマージ
      const employeeMap = new Map<
        string,
        { name: string; shift?: ShiftRecord; record?: TimeRecord }
      >();

      shiftList.forEach((s) => {
        const emp = s.employees as unknown as { name: string };
        employeeMap.set(s.employee_id, {
          name: emp.name,
          shift: s,
          record: employeeMap.get(s.employee_id)?.record,
        });
      });

      recordList.forEach((r) => {
        const emp = r.employees as unknown as { name: string };
        const existing = employeeMap.get(r.employee_id);
        employeeMap.set(r.employee_id, {
          name: emp.name,
          shift: existing?.shift,
          record: r,
        });
      });

      const result: ComparisonRow[] = Array.from(employeeMap.entries()).map(
        ([empId, data]) => ({
          employeeId: empId,
          employeeName: data.name,
          shift: data.shift,
          record: data.record,
          status: determineStatus(data.shift, data.record),
        })
      );

      setRows(result);
      setLoaded(true);
    } catch {
      toast.error("データの読み込みに失敗しました");
    }
  }

  function changeDate(delta: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    const newDate = d.toISOString().split("T")[0];
    loadComparison(newDate);
  }

  // 統計サマリー
  const stats = {
    total: rows.length,
    normal: rows.filter((r) => r.status === "normal").length,
    late: rows.filter((r) => r.status === "late").length,
    earlyLeave: rows.filter((r) => r.status === "early_leave").length,
    absent: rows.filter((r) => r.status === "absent").length,
    unscheduled: rows.filter((r) => r.status === "unscheduled").length,
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">シフト vs 実績比較</h1>

      {/* 日付ナビゲーション */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => changeDate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => loadComparison(e.target.value)}
          className="w-auto"
        />
        <Button variant="outline" size="icon" onClick={() => changeDate(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => loadComparison(today)}
        >
          今日
        </Button>
      </div>

      {/* サマリー */}
      {loaded && rows.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="text-sm">
            合計: <span className="font-medium">{stats.total}名</span>
          </div>
          {stats.normal > 0 && (
            <div className="text-sm text-green-600">
              正常: {stats.normal}名
            </div>
          )}
          {stats.late > 0 && (
            <div className="text-sm text-yellow-600">
              遅刻: {stats.late}名
            </div>
          )}
          {stats.earlyLeave > 0 && (
            <div className="text-sm text-orange-600">
              早退: {stats.earlyLeave}名
            </div>
          )}
          {stats.absent > 0 && (
            <div className="text-sm text-red-600">
              欠勤: {stats.absent}名
            </div>
          )}
          {stats.unscheduled > 0 && (
            <div className="text-sm text-gray-600">
              シフト外: {stats.unscheduled}名
            </div>
          )}
        </div>
      )}

      {/* 比較テーブル */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>従業員</TableHead>
            <TableHead>シフト予定</TableHead>
            <TableHead>業務タイプ</TableHead>
            <TableHead>実績（出勤）</TableHead>
            <TableHead>実績（退勤）</TableHead>
            <TableHead>ステータス</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!loaded ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-muted-foreground"
              >
                日付を選択してください
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-muted-foreground"
              >
                この日のシフト・実績データはありません
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.employeeId}>
                <TableCell className="font-medium">
                  {row.employeeName}
                </TableCell>
                <TableCell>
                  {row.shift
                    ? `${row.shift.start_time.slice(0, 5)} - ${row.shift.end_time.slice(0, 5)}`
                    : "-"}
                </TableCell>
                <TableCell>
                  {row.shift
                    ? (row.shift.work_types as unknown as { name: string }).name
                    : row.record
                      ? (row.record.work_types as unknown as { name: string }).name
                      : "-"}
                </TableCell>
                <TableCell>
                  {row.record ? formatTimeFromISO(row.record.clock_in) : "-"}
                </TableCell>
                <TableCell>
                  {row.record
                    ? row.record.clock_out
                      ? formatTimeFromISO(row.record.clock_out)
                      : "出勤中"
                    : "-"}
                </TableCell>
                <TableCell>{getStatusBadge(row.status)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
