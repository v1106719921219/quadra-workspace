"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getMonthlyReport, type EmployeeSummary } from "./actions";
import { toast } from "sonner";

export function ReportsClient() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [report, setReport] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadReport(y: number, m: number) {
    setYear(y);
    setMonth(m);
    setLoading(true);
    try {
      const data = await getMonthlyReport(y, m);
      setReport(data);
    } catch {
      toast.error("レポートの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport(year, month);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function prevMonth() {
    if (month === 1) loadReport(year - 1, 12);
    else loadReport(year, month - 1);
  }

  function nextMonth() {
    if (month === 12) loadReport(year + 1, 1);
    else loadReport(year, month + 1);
  }

  const totalBasePay = report.reduce((sum, r) => sum + r.base_pay, 0);
  const totalAllowance = report.reduce((sum, r) => sum + r.daily_allowance_total, 0);
  const totalPay = report.reduce((sum, r) => sum + r.total_pay, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">月次レポート</h1>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-medium min-w-[120px] text-center">{year}年{month}月</span>
        <Button variant="outline" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">基本給合計</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{totalBasePay.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">手当合計</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{totalAllowance.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">総支給額</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{totalPay.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>従業員</TableHead>
            <TableHead>雇用形態</TableHead>
            <TableHead>出勤日数</TableHead>
            <TableHead>実働時間</TableHead>
            <TableHead className="text-right">基本給</TableHead>
            <TableHead className="text-right">手当</TableHead>
            <TableHead className="text-right">合計</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                読み込み中...
              </TableCell>
            </TableRow>
          ) : report.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                この月のデータはありません
              </TableCell>
            </TableRow>
          ) : (
            report.map((r) => (
              <TableRow key={r.employee_id}>
                <TableCell className="font-medium">{r.employee_name}</TableCell>
                <TableCell>
                  <Badge variant={r.employee_type === "part_time" ? "secondary" : "default"}>
                    {r.employee_type === "part_time" ? "パート" : "社員"}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-2">
                    {r.employee_type === "part_time"
                      ? r.hourly_rate ? `¥${r.hourly_rate.toLocaleString()}/h` : ""
                      : r.monthly_salary ? `¥${r.monthly_salary.toLocaleString()}/月` : ""
                    }
                  </span>
                </TableCell>
                <TableCell>{r.work_days}日</TableCell>
                <TableCell>{r.total_hours.toFixed(1)}h</TableCell>
                <TableCell className="text-right">¥{r.base_pay.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  {r.daily_allowance_total > 0
                    ? `¥${r.daily_allowance_total.toLocaleString()}`
                    : "-"
                  }
                </TableCell>
                <TableCell className="text-right font-bold">¥{r.total_pay.toLocaleString()}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
