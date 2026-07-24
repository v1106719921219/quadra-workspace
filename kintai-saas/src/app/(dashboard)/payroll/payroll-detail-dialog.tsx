"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";
import type { PayrollCalculation } from "@/lib/payroll/types";

type DeductionField = "healthInsurance" | "careInsurance" | "childSupportContribution" | "pension" | "employmentInsurance" | "incomeTax" | "residentTax" | "savingsDeduction";

interface PayrollDetailDialogProps {
  calculation: PayrollCalculation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editable?: boolean;
  onDeductionUpdate?: (employeeId: string, field: DeductionField, value: number) => void;
}

function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString()}`;
}

function formatHours(hours: number): string {
  return `${hours.toFixed(2)}h`;
}

// 控除明細の表示順（画像準拠）
const DEDUCTION_ROWS: { field: DeductionField; label: string }[] = [
  { field: "healthInsurance", label: "健康保険料" },
  { field: "careInsurance", label: "介護保険料" },
  { field: "childSupportContribution", label: "子ども・子育て支援金" },
  { field: "pension", label: "厚生年金保険料" },
  { field: "employmentInsurance", label: "雇用保険" },
  { field: "incomeTax", label: "所得税" },
  { field: "residentTax", label: "住民税" },
  { field: "savingsDeduction", label: "積立金" },
];

export function PayrollDetailDialog({ calculation, open, onOpenChange, editable = false, onDeductionUpdate }: PayrollDetailDialogProps) {
  const [editingField, setEditingField] = useState<DeductionField | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingField && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingField]);

  if (!calculation) return null;
  const { employee } = calculation;

  // 単価（現場ごとの時給）別の集計（確認用）
  const rateGroups = new Map<number, { minutes: number; days: number }>();
  for (const d of calculation.dailyDetails || []) {
    const g = rateGroups.get(d.hourlyRate) || { minutes: 0, days: 0 };
    g.minutes += d.totalMinutes;
    g.days += 1;
    rateGroups.set(d.hourlyRate, g);
  }
  const rateSummary = Array.from(rateGroups.entries())
    .map(([rate, g]) => {
      const hours = Math.round(g.minutes / 60 * 4) / 4;
      return { rate, days: g.days, hours, amount: Math.round(hours * rate) };
    })
    .sort((a, b) => b.rate - a.rate);

  function startEdit(field: DeductionField, currentValue: number) {
    setEditingField(field);
    setEditValue(String(currentValue));
  }

  function saveEdit(field: DeductionField) {
    if (calculation && onDeductionUpdate) {
      onDeductionUpdate(calculation.employee.id, field, parseInt(editValue) || 0);
    }
    setEditingField(null);
  }

  function renderDeductionAmount(field: DeductionField) {
    if (!calculation) return null;
    const value = calculation[field];
    if (editable && editingField === field) {
      return (
        <div className="flex items-center justify-end gap-1">
          <span>¥</span>
          <Input
            ref={editInputRef}
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit(field);
              if (e.key === "Escape") setEditingField(null);
            }}
            onBlur={() => saveEdit(field)}
            className="w-28 h-7 text-right text-sm"
          />
        </div>
      );
    }
    if (editable) {
      return (
        <button
          className="inline-flex items-center gap-1 hover:text-primary transition-colors"
          onClick={() => startEdit(field, value)}
        >
          {formatCurrency(value)}
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
      );
    }
    return formatCurrency(value);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>給与明細 - {employee.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 従業員情報 */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{employee.employee_number || "番号なし"}</span>
            <Badge variant={employee.employee_type === "part_time" ? "secondary" : "default"}>
              {employee.employee_type === "part_time" ? "パート" : "社員"}
            </Badge>
            {employee.social_insurance_enrolled && <Badge variant="outline">社保加入</Badge>}
          </div>

          {/* 勤怠サマリ */}
          <div>
            <h3 className="font-semibold mb-2">勤怠サマリ</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground">出勤日数</p>
                <p className="text-lg font-semibold">{calculation.workDays}日</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground">総労働時間</p>
                <p className="text-lg font-semibold">{formatHours(calculation.totalHours)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground">残業時間</p>
                <p className="text-lg font-semibold">{formatHours(calculation.overtimeHours)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground">深夜時間</p>
                <p className="text-lg font-semibold">{formatHours(calculation.lateNightHours)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground">休日時間</p>
                <p className="text-lg font-semibold">{formatHours(calculation.holidayHours)}</p>
              </div>
            </div>
          </div>

          {/* 単価ごとの合計（確認用） */}
          {employee.employee_type === "part_time" && rateSummary.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">単価ごとの合計（確認用）</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>時給単価</TableHead>
                    <TableHead className="text-right">日数</TableHead>
                    <TableHead className="text-right">時間</TableHead>
                    <TableHead className="text-right">金額（割増除く）</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateSummary.map((r) => (
                    <TableRow key={r.rate}>
                      <TableCell>{formatCurrency(r.rate)}</TableCell>
                      <TableCell className="text-right">{r.days}日</TableCell>
                      <TableCell className="text-right">{formatHours(r.hours)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* 支給明細 */}
          <div>
            <h3 className="font-semibold mb-2">支給明細</h3>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">基本給</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.basePay)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">残業手当</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.overtimePay)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">深夜手当</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.lateNightPay)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">休日手当</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.holidayPay)}</TableCell>
                </TableRow>
                {calculation.absenceDeduction > 0 && (
                  <TableRow>
                    <TableCell className="font-medium text-red-600">不就労控除</TableCell>
                    <TableCell className="text-right text-red-600">-{formatCurrency(calculation.absenceDeduction)}</TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell className="font-medium">業務手当</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.dailyAllowanceTotal)}</TableCell>
                </TableRow>
                {calculation.driverDays > 0 && (
                  <TableRow>
                    <TableCell className="font-medium">ドライバー手当({calculation.driverDays}日)</TableCell>
                    <TableCell className="text-right">{formatCurrency(calculation.driverAllowance)}</TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell className="font-medium">通勤手当</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.transportationAllowance)}</TableCell>
                </TableRow>
                <TableRow className="font-bold border-t-2">
                  <TableCell>総支給額</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.grossPay)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* 控除明細 */}
          <div>
            <h3 className="font-semibold mb-2">控除明細</h3>
            <Table>
              <TableBody>
                {DEDUCTION_ROWS.map(({ field, label }) => {
                  // 非編集時は0円の任意項目（介護保険・子育て・住民税・積立金）を非表示
                  const optional = field === "careInsurance" || field === "childSupportContribution" || field === "residentTax" || field === "savingsDeduction";
                  if (!editable && optional && calculation[field] === 0) return null;
                  return (
                    <TableRow key={field}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell className="text-right">{renderDeductionAmount(field)}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-bold border-t-2">
                  <TableCell>合計</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.totalDeductions)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* 差引支給額 */}
          <div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">差引支給額</span>
              <span className="text-2xl font-bold text-primary">{formatCurrency(calculation.netPay)}</span>
            </div>
          </div>

          {/* 日次明細 */}
          {calculation.dailyDetails.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">日次明細</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日付</TableHead>
                      <TableHead>業務</TableHead>
                      <TableHead className="text-right">実働</TableHead>
                      <TableHead className="text-right">残業</TableHead>
                      <TableHead className="text-right">深夜</TableHead>
                      <TableHead>休日</TableHead>
                      <TableHead>ドライバー</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calculation.dailyDetails.map((d) => (
                      <TableRow key={d.date + d.clockIn}>
                        <TableCell className="whitespace-nowrap">{d.date.slice(5)}</TableCell>
                        <TableCell className="whitespace-nowrap">{d.workTypeName}</TableCell>
                        <TableCell className="text-right">{(Math.round(d.totalMinutes / 60 * 4) / 4).toFixed(2)}h</TableCell>
                        <TableCell className="text-right">{d.overtimeMinutes > 0 ? `${(Math.round(d.overtimeMinutes / 60 * 4) / 4).toFixed(2)}h` : "-"}</TableCell>
                        <TableCell className="text-right">{d.lateNightMinutes > 0 ? `${(Math.round(d.lateNightMinutes / 60 * 4) / 4).toFixed(2)}h` : "-"}</TableCell>
                        <TableCell>{d.isHoliday ? <Badge variant="secondary">休日</Badge> : "-"}</TableCell>
                        <TableCell>{d.isDriver ? <Badge variant="default">ドライバー</Badge> : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
