"use client";

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
import type { PayrollCalculation } from "@/lib/payroll/types";

interface PayrollDetailDialogProps {
  calculation: PayrollCalculation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString()}`;
}

function formatHours(hours: number): string {
  return `${hours.toFixed(2)}h`;
}

export function PayrollDetailDialog({ calculation, open, onOpenChange }: PayrollDetailDialogProps) {
  if (!calculation) return null;
  const { employee } = calculation;

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
                <TableRow>
                  <TableCell className="font-medium">業務手当</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.dailyAllowanceTotal)}</TableCell>
                </TableRow>
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
                <TableRow>
                  <TableCell className="font-medium">健康保険</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.healthInsurance)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">厚生年金</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.pension)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">雇用保険</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.employmentInsurance)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">所得税</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculation.incomeTax)}</TableCell>
                </TableRow>
                <TableRow className="font-bold border-t-2">
                  <TableCell>控除合計</TableCell>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calculation.dailyDetails.map((d) => (
                      <TableRow key={d.date + d.clockIn}>
                        <TableCell className="whitespace-nowrap">{d.date.slice(5)}</TableCell>
                        <TableCell className="whitespace-nowrap">{d.workTypeName}</TableCell>
                        <TableCell className="text-right">{(d.totalMinutes / 60).toFixed(1)}h</TableCell>
                        <TableCell className="text-right">{d.overtimeMinutes > 0 ? `${(d.overtimeMinutes / 60).toFixed(1)}h` : "-"}</TableCell>
                        <TableCell className="text-right">{d.lateNightMinutes > 0 ? `${(d.lateNightMinutes / 60).toFixed(1)}h` : "-"}</TableCell>
                        <TableCell>{d.isHoliday ? <Badge variant="secondary">休日</Badge> : "-"}</TableCell>
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
