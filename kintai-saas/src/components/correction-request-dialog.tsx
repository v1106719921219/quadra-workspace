"use client";

import { useState } from "react";
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
import { createAttendanceCorrectionAction } from "@/app/(dashboard)/attendance/correction-actions";

interface Employee {
  id: string;
  name: string;
}

interface WorkType {
  id: string;
  name: string;
}

type CorrectionMode = "clock_out" | "both";

interface CorrectionRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CorrectionMode;
  employees: Employee[];
  workTypes: WorkType[];
  /** clock_outモード時の固定値 */
  fixedEmployeeId?: string;
  fixedDate?: string;
  fixedTimeRecordId?: string;
}

export function CorrectionRequestDialog({
  open,
  onOpenChange,
  mode,
  employees,
  workTypes,
  fixedEmployeeId,
  fixedDate,
}: CorrectionRequestDialogProps) {
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState(fixedEmployeeId || "");
  const [workDate, setWorkDate] = useState(fixedDate || "");
  const [clockInTime, setClockInTime] = useState("");
  const [clockOutTime, setClockOutTime] = useState("");
  const [workTypeId, setWorkTypeId] = useState("");
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [reason, setReason] = useState("");

  function resetForm() {
    if (!fixedEmployeeId) setEmployeeId("");
    if (!fixedDate) setWorkDate("");
    setClockInTime("");
    setClockOutTime("");
    setWorkTypeId("");
    setBreakMinutes(0);
    setReason("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!employeeId) {
      toast.error("従業員を選択してください");
      return;
    }
    if (!workDate) {
      toast.error("日付を入力してください");
      return;
    }
    if (!reason.trim()) {
      toast.error("理由を入力してください");
      return;
    }

    if (mode === "both") {
      if (!clockInTime) {
        toast.error("出勤時刻を入力してください");
        return;
      }
      if (!workTypeId) {
        toast.error("業務タイプを選択してください");
        return;
      }
    } else {
      if (!clockOutTime) {
        toast.error("退勤時刻を入力してください");
        return;
      }
    }

    setLoading(true);
    try {
      const correctedClockIn = clockInTime
        ? new Date(`${workDate}T${clockInTime}:00+09:00`).toISOString()
        : undefined;
      const correctedClockOut = clockOutTime
        ? new Date(`${workDate}T${clockOutTime}:00+09:00`).toISOString()
        : undefined;

      await createAttendanceCorrectionAction({
        employeeId,
        workDate,
        correctedClockIn,
        correctedClockOut,
        workTypeId: workTypeId || undefined,
        breakMinutes,
        reason: reason.trim(),
      });

      toast.success("修正申告を送信しました");
      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "both" ? "出退勤の修正申告" : "退勤時刻の修正申告";
  const description =
    mode === "both"
      ? "出勤・退勤の打刻を忘れた日の時刻を申告してください。管理者の承認後に反映されます。"
      : "退勤打刻を忘れた日の退勤時刻を申告してください。管理者の承認後に反映されます。";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 従業員選択 */}
          {!fixedEmployeeId && (
            <div className="space-y-2">
              <Label>従業員</Label>
              <div className="flex flex-wrap gap-2">
                {employees.map((e) => (
                  <Button
                    key={e.id}
                    type="button"
                    variant={employeeId === e.id ? "default" : "outline"}
                    className="h-11 px-4 text-base"
                    onClick={() => setEmployeeId(e.id)}
                  >
                    {e.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* 日付 */}
          {!fixedDate && (
            <div className="space-y-2">
              <Label>対象日</Label>
              <Input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                required
              />
            </div>
          )}

          {/* 業務タイプ（bothモード時） */}
          {mode === "both" && (
            <div className="space-y-2">
              <Label>業務タイプ</Label>
              <div className="flex flex-wrap gap-2">
                {workTypes.map((wt) => (
                  <Button
                    key={wt.id}
                    type="button"
                    variant={workTypeId === wt.id ? "default" : "outline"}
                    className="h-11 px-4 text-base"
                    onClick={() => setWorkTypeId(wt.id)}
                  >
                    {wt.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* 出勤時刻（bothモード時） */}
          {mode === "both" && (
            <div className="space-y-2">
              <Label>出勤時刻</Label>
              <Input
                type="time"
                value={clockInTime}
                onChange={(e) => setClockInTime(e.target.value)}
                required
              />
            </div>
          )}

          {/* 退勤時刻 */}
          <div className="space-y-2">
            <Label>退勤時刻{mode === "both" ? "（任意）" : ""}</Label>
            <Input
              type="time"
              value={clockOutTime}
              onChange={(e) => setClockOutTime(e.target.value)}
              required={mode === "clock_out"}
            />
          </div>

          {/* 休憩時間 */}
          {mode === "both" && (
            <div className="space-y-2">
              <Label>休憩時間（分）</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={breakMinutes === 0 ? "" : String(breakMinutes)}
                placeholder="例：60"
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  setBreakMinutes(val === "" ? 0 : parseInt(val));
                }}
                onFocus={(e) => e.target.select()}
              />
            </div>
          )}

          {/* 理由 */}
          <div className="space-y-2">
            <Label>理由</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="打刻忘れなど"
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "送信中..." : "申告する"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
