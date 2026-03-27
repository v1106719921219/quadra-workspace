"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  type EmployeeWithStatus,
  clockIn,
  clockOut,
  getEmployeesWithStatus,
  getActiveWorkTypes,
} from "./actions";

interface WorkType {
  id: string;
  name: string;
  daily_allowance: number;
}

export function ClockClient({
  initialEmployees,
  initialWorkTypes,
  tenantName,
}: {
  initialEmployees: EmployeeWithStatus[];
  initialWorkTypes: WorkType[];
  tenantName: string;
}) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [workTypes] = useState(initialWorkTypes);
  const [now, setNow] = useState(new Date());
  const [clockInDialog, setClockInDialog] = useState<EmployeeWithStatus | null>(null);
  const [clockOutDialog, setClockOutDialog] = useState<EmployeeWithStatus | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [loading, setLoading] = useState(false);

  // リアルタイム時計
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 30秒ごとにステータスをリフレッシュ
  const refresh = useCallback(async () => {
    try {
      const data = await getEmployeesWithStatus();
      setEmployees(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  const timeStr = now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  async function handleClockIn(workTypeId: string) {
    if (!clockInDialog) return;
    setLoading(true);
    try {
      await clockIn(clockInDialog.id, workTypeId);
      toast.success(`${clockInDialog.name} が出勤しました`);
      setClockInDialog(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "出勤に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleClockOut() {
    if (!clockOutDialog?.active_record) return;
    setLoading(true);
    try {
      await clockOut(clockOutDialog.active_record.id, breakMinutes);
      toast.success(`${clockOutDialog.name} が退勤しました`);
      setClockOutDialog(null);
      setBreakMinutes(0);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "退勤に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* ヘッダー */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground mb-1">{tenantName}</p>
          <h1 className="text-lg font-semibold text-muted-foreground">勤怠タイムレコーダー</h1>
          <div className="text-5xl font-mono font-bold tracking-wider mt-2">{timeStr}</div>
          <p className="text-lg text-muted-foreground mt-1">{dateStr}</p>
        </div>
      </div>

      {/* 従業員グリッド */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {employees.map((emp) => {
            const isWorking = !!emp.active_record;
            const clockInTime = emp.active_record
              ? new Date(emp.active_record.clock_in).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : null;

            return (
              <div
                key={emp.id}
                className={`rounded-xl border-2 p-4 text-center transition-all ${
                  isWorking
                    ? "border-green-400 bg-green-50 shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <p className="font-bold text-lg truncate">{emp.name}</p>
                {isWorking ? (
                  <>
                    <p className="text-sm text-green-600 font-medium mt-1">出勤中</p>
                    <p className="text-xs text-muted-foreground">{emp.active_record!.work_type_name}</p>
                    <p className="text-xs text-muted-foreground">{clockInTime}~</p>
                    <Button
                      className="mt-3 w-full"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setBreakMinutes(0);
                        setClockOutDialog(emp);
                      }}
                    >
                      退勤
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground mt-1">--</p>
                    <Button
                      className="mt-3 w-full"
                      size="sm"
                      onClick={() => setClockInDialog(emp)}
                    >
                      出勤
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {employees.length === 0 && (
          <p className="text-center text-muted-foreground mt-12">
            従業員が登録されていません。管理画面から追加してください。
          </p>
        )}
      </div>

      {/* 出勤ダイアログ */}
      <Dialog open={!!clockInDialog} onOpenChange={(open) => !open && setClockInDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{clockInDialog?.name} の出勤</DialogTitle>
            <DialogDescription>業務タイプを選択してください</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {workTypes.map((wt) => (
              <Button
                key={wt.id}
                variant="outline"
                className="h-auto py-4 justify-between text-left"
                disabled={loading}
                onClick={() => handleClockIn(wt.id)}
              >
                <span className="font-medium text-base">{wt.name}</span>
                <span className="text-sm text-muted-foreground">
                  {wt.daily_allowance > 0
                    ? `+¥${wt.daily_allowance.toLocaleString()}/日`
                    : "手当なし"
                  }
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* 退勤ダイアログ */}
      <Dialog open={!!clockOutDialog} onOpenChange={(open) => !open && setClockOutDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{clockOutDialog?.name} の退勤</DialogTitle>
            <DialogDescription>
              {clockOutDialog?.active_record?.work_type_name} ・{" "}
              {clockOutDialog?.active_record
                ? new Date(clockOutDialog.active_record.clock_in).toLocaleTimeString("ja-JP", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
              ~{timeStr.slice(0, 5)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="break">休憩時間（分）</Label>
              <Input
                id="break"
                type="number"
                min={0}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClockOutDialog(null)}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleClockOut} disabled={loading}>
              {loading ? "処理中..." : "退勤する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
