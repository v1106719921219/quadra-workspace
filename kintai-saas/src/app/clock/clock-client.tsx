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
} from "./actions";
import { CorrectionRequestDialog } from "@/components/correction-request-dialog";

/** デプロイ後のServer Action ID不一致を検知して自動リロード */
function isStaleActionError(e: unknown): boolean {
  if (e instanceof Error && e.message.includes("was not found on the server")) return true;
  if (typeof e === "object" && e !== null && "digest" in e) {
    const digest = String((e as Record<string, unknown>).digest);
    if (digest.includes("NOT_FOUND")) return true;
  }
  return false;
}

async function safeAction<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isStaleActionError(e)) {
      window.location.reload();
      throw e;
    }
    throw e;
  }
}

export function ClockClient({
  initialEmployees,
  tenantName,
}: {
  initialEmployees: EmployeeWithStatus[];
  tenantName: string;
}) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [now, setNow] = useState(new Date());
  const [clockInDialog, setClockInDialog] = useState<EmployeeWithStatus | null>(null);
  const [clockOutDialog, setClockOutDialog] = useState<EmployeeWithStatus | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [isDriver, setIsDriver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);

  // リアルタイム時計
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 30秒ごとにステータスをリフレッシュ
  const refresh = useCallback(async () => {
    try {
      const data = await safeAction(() => getEmployeesWithStatus());
      setEmployees(data);
    } catch {
      // ignore (stale action時は自動リロード済み)
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

  async function handleClockIn() {
    if (!clockInDialog) return;
    setLoading(true);
    try {
      await safeAction(() => clockIn(clockInDialog.id, isDriver));
      toast.success(`${clockInDialog.name} が出勤しました${isDriver ? "（ドライバー）" : ""}`);
      setClockInDialog(null);
      setIsDriver(false);
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
      await safeAction(() => clockOut(clockOutDialog.active_record!.id, breakMinutes));
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
          <div className="text-5xl md:text-6xl font-mono font-bold tracking-wider mt-2">{timeStr}</div>
          <p className="text-lg text-muted-foreground mt-1">{dateStr}</p>
        </div>
      </div>

      {/* 従業員グリッド */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-5">
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
                className={`rounded-xl border-2 p-4 md:p-5 text-center transition-all ${
                  isWorking
                    ? "border-green-400 bg-green-50 shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <p className="font-bold text-lg md:text-xl truncate">{emp.name}</p>
                {isWorking ? (
                  <>
                    <p className="text-sm md:text-base text-green-600 font-medium mt-1">出勤中</p>
                    <p className="text-xs md:text-sm text-muted-foreground">{emp.active_record!.work_type_name}</p>
                    <p className="text-xs md:text-sm text-muted-foreground">{clockInTime}~</p>
                    <Button
                      className="mt-3 w-full h-11 md:h-12 text-base"
                      variant="destructive"
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
                    <p className="text-sm md:text-base text-muted-foreground mt-1">--</p>
                    <Button
                      className="mt-3 w-full h-11 md:h-12 text-base"
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

        {/* 修正申告ボタン */}
        {employees.length > 0 && (
          <div className="mt-8 text-center">
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setCorrectionOpen(true)}
            >
              出退勤の修正申告
            </Button>
          </div>
        )}
      </div>

      {/* 出勤ダイアログ */}
      <Dialog open={!!clockInDialog} onOpenChange={(open) => { if (!open) { setClockInDialog(null); setIsDriver(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{clockInDialog?.name} の出勤</DialogTitle>
          </DialogHeader>
          {clockInDialog?.can_be_driver && (
            <Button
              variant={isDriver ? "default" : "outline"}
              className={`w-full ${isDriver ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}
              onClick={() => setIsDriver(!isDriver)}
            >
              {isDriver ? "ドライバー ON" : "ドライバー"}
            </Button>
          )}
          <Button
            className="h-auto py-4 text-lg font-bold"
            disabled={loading}
            onClick={() => handleClockIn()}
          >
            {loading ? "処理中..." : "出勤"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* 退勤ダイアログ */}
      <Dialog open={!!clockOutDialog} onOpenChange={(open) => !open && setClockOutDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{clockOutDialog?.name} の退勤</DialogTitle>
            <DialogDescription>
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
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="h-14 text-xl text-center"
                value={breakMinutes === 0 ? "" : String(breakMinutes)}
                placeholder="例：60"
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  setBreakMinutes(val === "" ? 0 : parseInt(val));
                }}
                onFocus={(e) => e.target.select()}
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

      {/* 修正申告ダイアログ */}
      <CorrectionRequestDialog
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
        mode="both"
        employees={employees.map((e) => ({ id: e.id, name: e.name }))}
        workTypes={[]}
      />
    </div>
  );
}
