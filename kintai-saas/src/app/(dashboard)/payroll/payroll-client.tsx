"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Download, Printer, Play, Check, Undo2, Pencil, FileText } from "lucide-react";
import Link from "next/link";
import { calculateMonthlyPayroll, getPayrollRecords, confirmPayroll, unconfirmPayroll } from "./actions";
import { PayrollDetailDialog } from "./payroll-detail-dialog";
import type { PayrollCalculation } from "@/lib/payroll/types";
import { toast } from "sonner";
import { jstYearMonth } from "@/lib/time-utils";

function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString()}`;
}

// 確定レコードからPayrollCalculation形式に変換
function recordToCalculation(record: {
  employee_id: string;
  work_days: number;
  total_hours: number;
  overtime_hours: number;
  late_night_hours: number;
  holiday_hours: number;
  base_pay: number;
  overtime_pay: number;
  late_night_pay: number;
  holiday_pay: number;
  daily_allowance_total: number;
  driver_days: number;
  driver_allowance: number;
  transportation_allowance: number;
  gross_pay: number;
  absence_deduction: number;
  health_insurance: number;
  pension: number;
  child_support_contribution: number;
  care_insurance: number;
  employment_insurance: number;
  income_tax: number;
  resident_tax: number;
  savings_deduction: number;
  total_deductions: number;
  net_pay: number;
  calculation_details: { employee?: PayrollCalculation["employee"]; dailyDetails?: PayrollCalculation["dailyDetails"] } | null;
  employees: { name: string; employee_number: string | null; employee_type: string };
}): PayrollCalculation {
  const emp = record.calculation_details?.employee || {
    id: record.employee_id,
    name: record.employees.name,
    employee_number: record.employees.employee_number,
    employee_type: record.employees.employee_type as "part_time" | "full_time",
    hourly_rate: null,
    monthly_salary: null,
    transportation_allowance: 0,
    dependents_count: 0,
    tax_column: "kou" as const,
    social_insurance_enrolled: false,
    employment_insurance_enrolled: false,
    care_insurance_enrolled: false,
    standard_monthly_remuneration: 0,
    resident_tax: 0,
    savings_deduction: 0,
  };

  return {
    employee: emp,
    workDays: record.work_days,
    totalHours: Number(record.total_hours),
    overtimeHours: Number(record.overtime_hours),
    lateNightHours: Number(record.late_night_hours),
    holidayHours: Number(record.holiday_hours),
    basePay: record.base_pay,
    overtimePay: record.overtime_pay,
    lateNightPay: record.late_night_pay,
    holidayPay: record.holiday_pay,
    absenceDeduction: record.absence_deduction ?? 0,
    dailyAllowanceTotal: record.daily_allowance_total,
    driverDays: record.driver_days ?? 0,
    driverAllowance: record.driver_allowance ?? 0,
    transportationAllowance: record.transportation_allowance,
    grossPay: record.gross_pay,
    healthInsurance: record.health_insurance,
    pension: record.pension,
    childSupportContribution: record.child_support_contribution ?? 0,
    careInsurance: record.care_insurance ?? 0,
    employmentInsurance: record.employment_insurance,
    incomeTax: record.income_tax,
    residentTax: record.resident_tax ?? 0,
    savingsDeduction: record.savings_deduction ?? 0,
    totalDeductions: record.total_deductions,
    netPay: record.net_pay,
    dailyDetails: record.calculation_details?.dailyDetails || [],
  };
}

export function PayrollClient() {
  const [year, setYear] = useState(() => jstYearMonth().year);
  const [month, setMonth] = useState(() => jstYearMonth().month);
  const [calculations, setCalculations] = useState<PayrollCalculation[]>([]);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // 編集中のセル: "employeeId__fieldName"
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<"list" | "slips">("slips");
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  function prevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
    setCalculations([]);
    setHasData(false);
    setIsConfirmed(false);
  }

  function nextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
    setCalculations([]);
    setHasData(false);
    setIsConfirmed(false);
  }

  async function handleCalculate() {
    setLoading(true);
    try {
      // まず確定済みレコードを確認（テーブル未作成時はスキップ）
      try {
        const records = await getPayrollRecords(year, month);
        if (records.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setCalculations(records.map((r: any) => recordToCalculation(r)));
          setIsConfirmed(true);
          setHasData(true);
          return;
        }
      } catch {
        // payroll_recordsテーブルが未作成の場合は無視して計算実行へ
      }

      // 未確定なら計算実行
      const result = await calculateMonthlyPayroll(year, month);
      setCalculations(result);
      setIsConfirmed(false);
      setHasData(true);
    } catch (err) {
      console.error("給与計算エラー:", err);
      toast.error("計算中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!confirm("給与を確定しますか？")) return;
    setLoading(true);
    try {
      await confirmPayroll(year, month, calculations);
      setIsConfirmed(true);
      toast.success("給与を確定しました");
    } catch {
      toast.error("確定に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnconfirm() {
    if (!confirm("給与の確定を取り消しますか？")) return;
    setLoading(true);
    try {
      await unconfirmPayroll(year, month);
      setIsConfirmed(false);
      setHasData(false);
      setCalculations([]);
      toast.success("確定を取り消しました");
    } catch {
      toast.error("取り消しに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  type EditableField = "basePay" | "overtimePay" | "lateNightPay" | "holidayPay" | "dailyAllowanceTotal" | "driverAllowance" | "transportationAllowance";
  type DeductionField = "healthInsurance" | "careInsurance" | "childSupportContribution" | "pension" | "employmentInsurance" | "incomeTax" | "residentTax" | "savingsDeduction";

  const DEDUCTION_FIELDS: DeductionField[] = ["healthInsurance", "careInsurance", "childSupportContribution", "pension", "employmentInsurance", "incomeTax", "residentTax", "savingsDeduction"];

  function handleCellEdit(employeeId: string, field: EditableField | DeductionField, currentValue: number) {
    setEditingCell(`${employeeId}__${field}`);
    setEditValue(String(currentValue));
  }

  function handleCellSave(employeeId: string, field: EditableField | DeductionField) {
    const newValue = parseInt(editValue) || 0;
    setCalculations((prev) =>
      prev.map((calc) => {
        if (calc.employee.id !== employeeId) return calc;
        const updated = { ...calc, [field]: newValue };
        if (DEDUCTION_FIELDS.includes(field as DeductionField)) {
          // 控除項目の編集: 控除合計を再計算
          updated.totalDeductions =
            updated.healthInsurance + updated.careInsurance + updated.childSupportContribution
            + updated.pension + updated.employmentInsurance
            + updated.incomeTax + updated.residentTax + updated.savingsDeduction;
        } else {
          // 支給項目の編集: 総支給額を再計算
          updated.grossPay = updated.basePay + updated.overtimePay + updated.lateNightPay
            + updated.holidayPay - updated.absenceDeduction
            + updated.dailyAllowanceTotal + updated.driverAllowance
            + updated.transportationAllowance;
        }
        updated.netPay = updated.grossPay - updated.totalDeductions;
        return updated;
      })
    );
    setEditingCell(null);
  }

  // 控除項目の手動編集（明細ダイアログから）
  function handleDeductionUpdate(employeeId: string, field: DeductionField, value: number) {
    setCalculations((prev) =>
      prev.map((calc) => {
        if (calc.employee.id !== employeeId) return calc;
        const updated = { ...calc, [field]: value };
        updated.totalDeductions =
          updated.healthInsurance + updated.careInsurance + updated.childSupportContribution
          + updated.pension + updated.employmentInsurance
          + updated.incomeTax + updated.residentTax + updated.savingsDeduction;
        updated.netPay = updated.grossPay - updated.totalDeductions;
        return updated;
      })
    );
  }

  function renderEditableCell(calc: PayrollCalculation, field: EditableField | DeductionField) {
    const cellKey = `${calc.employee.id}__${field}`;
    const value = calc[field] as number;
    if (editingCell === cellKey) {
      return (
        <div className="flex items-center justify-end gap-1">
          <span>¥</span>
          <Input
            ref={editInputRef}
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCellSave(calc.employee.id, field);
              if (e.key === "Escape") setEditingCell(null);
            }}
            onBlur={() => handleCellSave(calc.employee.id, field)}
            className="w-24 h-7 text-right text-sm"
          />
        </div>
      );
    }
    return (
      <button
        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
        onClick={() => !isConfirmed && handleCellEdit(calc.employee.id, field, value)}
        disabled={isConfirmed}
      >
        {formatCurrency(value)}
        {!isConfirmed && <Pencil className="h-3 w-3 text-muted-foreground print:hidden" />}
      </button>
    );
  }

  function handleRowClick(calc: PayrollCalculation) {
    setSelectedEmployeeId(calc.employee.id);
    setDetailOpen(true);
  }

  // 編集が即時反映されるよう、選択中の明細はcalculationsから導出
  const selectedCalc = selectedEmployeeId
    ? calculations.find((c) => c.employee.id === selectedEmployeeId) ?? null
    : null;

  function exportMFPayrollCSV() {
    if (calculations.length === 0) return;

    // マネーフォワードクラウド給与「他社ソフトCSVインポート」形式
    // Version, 従業員番号, 勤怠項目名（MFの項目名と完全一致が必要）
    const headers = [
      "Version",
      "従業員番号",
      "出勤日数",
      "所定内出勤時間",
      "残業時間",
      "深夜残業時間",
      "法定休日出勤日数",
    ];

    const rows = calculations
      .filter((c) => c.workDays > 0)
      .map((c) => {
        // 所定内出勤時間 = 総労働時間 - 残業時間 - 休日時間
        const regularHours = Math.max(0, c.totalHours - c.overtimeHours - c.holidayHours);
        // 休日出勤日数（休日時間を8hで割って概算）
        const holidayDays = c.holidayHours > 0 ? Math.ceil(c.holidayHours / 8) : 0;

        return [
          "2", // Version固定値
          c.employee.employee_number || "",
          c.workDays,
          regularHours.toFixed(2),
          c.overtimeHours.toFixed(2),
          c.lateNightHours.toFixed(2),
          holidayDays,
        ];
      });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    // BOM付きUTF-8
    const bom = "\uFEFF";
    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MFクラウド給与_勤怠_${year}年${month}月.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    if (calculations.length === 0) return;

    const headers = [
      "従業員名", "社員番号", "雇用形態", "出勤日数",
      "総労働時間", "残業時間", "深夜時間", "休日時間",
      "基本給", "残業手当", "深夜手当", "休日手当", "不就労控除",
      "業務手当", "ドライバー日数", "ドライバー手当", "通勤手当", "総支給額",
      "健康保険料", "介護保険料", "子ども・子育て支援金", "厚生年金保険料", "雇用保険", "所得税", "住民税", "積立金", "控除合計",
      "差引支給額",
    ];

    const rows = calculations.map((c) => [
      c.employee.name,
      c.employee.employee_number || "",
      c.employee.employee_type === "part_time" ? "パート" : "社員",
      c.workDays,
      c.totalHours,
      c.overtimeHours,
      c.lateNightHours,
      c.holidayHours,
      c.basePay,
      c.overtimePay,
      c.lateNightPay,
      c.holidayPay,
      c.absenceDeduction,
      c.dailyAllowanceTotal,
      c.driverDays,
      c.driverAllowance,
      c.transportationAllowance,
      c.grossPay,
      c.healthInsurance,
      c.careInsurance,
      c.childSupportContribution,
      c.pension,
      c.employmentInsurance,
      c.incomeTax,
      c.residentTax,
      c.savingsDeduction,
      c.totalDeductions,
      c.netPay,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    // BOM付きUTF-8
    const bom = "\uFEFF";
    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `給与明細_${year}年${month}月.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePrint(mode: "list" | "slips") {
    setPrintMode(mode);
    setTimeout(() => window.print(), 100);
  }

  // サマリ計算
  const totalGross = calculations.reduce((sum, c) => sum + c.grossPay, 0);
  const totalDeductions = calculations.reduce((sum, c) => sum + c.totalDeductions, 0);
  const totalNet = calculations.reduce((sum, c) => sum + c.netPay, 0);
  const employeeCount = calculations.filter((c) => c.workDays > 0).length;

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold">給与計算</h1>
        <div className="flex items-center gap-2">
          <Link href="/payroll/documents">
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-1" />
              帳票
            </Button>
          </Link>
          {hasData && (
            <>
              <Button variant="outline" size="sm" onClick={exportMFPayrollCSV}>
                <Download className="h-4 w-4 mr-1" />
                MFクラウド給与用
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-1" />
                CSV出力
              </Button>
              <Button variant="outline" size="sm" onClick={() => handlePrint("list")}>
                <Printer className="h-4 w-4 mr-1" />
                一覧印刷
              </Button>
              <Button variant="outline" size="sm" onClick={() => handlePrint("slips")}>
                <Printer className="h-4 w-4 mr-1" />
                明細印刷
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 月選択 */}
      <div className="flex items-center gap-4 print:hidden">
        <Button variant="outline" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-semibold min-w-[140px] text-center">
          {year}年{month}月
        </span>
        <Button variant="outline" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {isConfirmed && <Badge variant="default">確定済み</Badge>}
        {hasData && !isConfirmed && <Badge variant="secondary">未確定</Badge>}
      </div>

      {/* サマリカード */}
      {hasData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">総支給額</p>
              <p className="text-xl font-bold">{formatCurrency(totalGross)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">控除合計</p>
              <p className="text-xl font-bold">{formatCurrency(totalDeductions)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">差引支給額</p>
              <p className="text-xl font-bold text-primary">{formatCurrency(totalNet)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">対象人数</p>
              <p className="text-xl font-bold">{employeeCount}人</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 印刷用ヘッダー（一覧印刷時） */}
      {printMode === "list" && (
        <div className="hidden print:block text-center mb-2">
          <h1 className="text-xl font-bold">給与一覧 {year}年{month}月分</h1>
        </div>
      )}

      {/* 給与テーブル */}
      {hasData && (
        <div className={`overflow-x-auto ${printMode === "list" ? "" : "print:hidden"}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>従業員</TableHead>
                <TableHead className="text-right">出勤</TableHead>
                <TableHead className="text-right">基本給</TableHead>
                <TableHead className="text-right">残業</TableHead>
                <TableHead className="text-right">深夜</TableHead>
                <TableHead className="text-right">休日</TableHead>
                <TableHead className="text-right">手当</TableHead>
                <TableHead className="text-right">通勤</TableHead>
                <TableHead className="text-right">総支給</TableHead>
                <TableHead className="text-right">社保</TableHead>
                <TableHead className="text-right">所得税</TableHead>
                <TableHead className="text-right">住民税</TableHead>
                <TableHead className="text-right">手取</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calculations.map((calc) => (
                <TableRow
                  key={calc.employee.id}
                  className="cursor-pointer hover:bg-muted/50 print:cursor-default"
                  onClick={() => handleRowClick(calc)}
                >
                  <TableCell className="font-medium whitespace-nowrap">
                    {calc.employee.name}
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {calc.employee.employee_type === "part_time" ? "P" : "F"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{calc.workDays}日</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>{renderEditableCell(calc, "basePay")}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>{renderEditableCell(calc, "overtimePay")}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>{renderEditableCell(calc, "lateNightPay")}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>{renderEditableCell(calc, "holidayPay")}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>{renderEditableCell(calc, "dailyAllowanceTotal")}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>{renderEditableCell(calc, "transportationAllowance")}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(calc.grossPay)}</TableCell>
                  <TableCell className="text-right">
                    <button
                      className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                      title="明細を開いて健保・介護・厚年・雇用保険を個別編集"
                      onClick={() => handleRowClick(calc)}
                    >
                      {formatCurrency(calc.healthInsurance + calc.careInsurance + calc.pension + calc.childSupportContribution + calc.employmentInsurance)}
                      {!isConfirmed && <Pencil className="h-3 w-3 text-muted-foreground print:hidden" />}
                    </button>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>{renderEditableCell(calc, "incomeTax")}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>{renderEditableCell(calc, "residentTax")}</TableCell>
                  <TableCell className="text-right font-bold text-primary">{formatCurrency(calc.netPay)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* アクションボタン */}
      <div className="flex items-center gap-3 print:hidden">
        {!hasData && (
          <Button onClick={handleCalculate} disabled={loading}>
            <Play className="h-4 w-4 mr-1" />
            {loading ? "計算中..." : "計算実行"}
          </Button>
        )}
        {hasData && !isConfirmed && (
          <>
            <Button onClick={handleCalculate} variant="outline" disabled={loading}>
              <Play className="h-4 w-4 mr-1" />
              再計算
            </Button>
            <Button onClick={handleConfirm} disabled={loading}>
              <Check className="h-4 w-4 mr-1" />
              給与確定
            </Button>
          </>
        )}
        {isConfirmed && (
          <Button variant="destructive" onClick={handleUnconfirm} disabled={loading}>
            <Undo2 className="h-4 w-4 mr-1" />
            確定取消
          </Button>
        )}
      </div>

      {/* 未計算メッセージ */}
      {!hasData && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          「計算実行」ボタンを押して、{year}年{month}月の給与を計算してください
        </div>
      )}

      {/* 明細ダイアログ */}
      <PayrollDetailDialog
        calculation={selectedCalc}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        editable={!isConfirmed}
        onDeductionUpdate={handleDeductionUpdate}
      />

      {/* 印刷用個別明細 */}
      <div className={printMode === "slips" ? "hidden print:block" : "hidden"}>
        {calculations.map((calc, i) => (
          <div key={calc.employee.id} className={i > 0 ? "break-before-page" : ""}>
            <div className="border rounded-lg p-6 mb-4">
              <h2 className="text-xl font-bold mb-1">{calc.employee.name} - 給与明細</h2>
              <p className="text-sm mb-4">{year}年{month}月分</p>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div><span className="text-sm text-muted-foreground">出勤日数:</span> {calc.workDays}日</div>
                <div><span className="text-sm text-muted-foreground">総労働:</span> {calc.totalHours.toFixed(1)}h</div>
                <div><span className="text-sm text-muted-foreground">残業:</span> {calc.overtimeHours.toFixed(1)}h</div>
              </div>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h3 className="font-semibold border-b mb-2">支給</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>基本給</span><span>{formatCurrency(calc.basePay)}</span></div>
                    <div className="flex justify-between"><span>残業手当</span><span>{formatCurrency(calc.overtimePay)}</span></div>
                    <div className="flex justify-between"><span>深夜手当</span><span>{formatCurrency(calc.lateNightPay)}</span></div>
                    <div className="flex justify-between"><span>休日手当</span><span>{formatCurrency(calc.holidayPay)}</span></div>
                    {calc.absenceDeduction > 0 && (
                      <div className="flex justify-between text-red-600"><span>不就労控除</span><span>-{formatCurrency(calc.absenceDeduction)}</span></div>
                    )}
                    <div className="flex justify-between"><span>業務手当</span><span>{formatCurrency(calc.dailyAllowanceTotal)}</span></div>
                    {calc.driverDays > 0 && (
                      <div className="flex justify-between"><span>ドライバー手当({calc.driverDays}日)</span><span>{formatCurrency(calc.driverAllowance)}</span></div>
                    )}
                    <div className="flex justify-between"><span>通勤手当</span><span>{formatCurrency(calc.transportationAllowance)}</span></div>
                    <div className="flex justify-between font-bold border-t pt-1"><span>総支給額</span><span>{formatCurrency(calc.grossPay)}</span></div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold border-b mb-2">控除</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>健康保険料</span><span>{formatCurrency(calc.healthInsurance)}</span></div>
                    {calc.careInsurance > 0 && (
                      <div className="flex justify-between"><span>介護保険料</span><span>{formatCurrency(calc.careInsurance)}</span></div>
                    )}
                    {calc.childSupportContribution > 0 && (
                      <div className="flex justify-between"><span>子ども・子育て支援金</span><span>{formatCurrency(calc.childSupportContribution)}</span></div>
                    )}
                    <div className="flex justify-between"><span>厚生年金保険料</span><span>{formatCurrency(calc.pension)}</span></div>
                    <div className="flex justify-between"><span>雇用保険</span><span>{formatCurrency(calc.employmentInsurance)}</span></div>
                    <div className="flex justify-between"><span>所得税</span><span>{formatCurrency(calc.incomeTax)}</span></div>
                    {calc.residentTax > 0 && (
                      <div className="flex justify-between"><span>住民税</span><span>{formatCurrency(calc.residentTax)}</span></div>
                    )}
                    {calc.savingsDeduction > 0 && (
                      <div className="flex justify-between"><span>積立金</span><span>{formatCurrency(calc.savingsDeduction)}</span></div>
                    )}
                    <div className="flex justify-between font-bold border-t pt-1"><span>合計</span><span>{formatCurrency(calc.totalDeductions)}</span></div>
                  </div>
                </div>
              </div>
              <div className="mt-4 text-right text-xl font-bold border-t pt-2">
                差引支給額: {formatCurrency(calc.netPay)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 印刷用CSS（一覧印刷時は横向き・縮小して1ページ幅に収める） */}
      {printMode === "list" && (
        <style>{`
          @media print {
            @page { size: A4 landscape; margin: 10mm; }
            body { font-size: 9pt; }
            .overflow-x-auto { overflow: visible !important; }
            table { width: 100%; }
            th, td { padding: 3px 6px !important; white-space: nowrap; }
          }
        `}</style>
      )}
    </div>
  );
}
