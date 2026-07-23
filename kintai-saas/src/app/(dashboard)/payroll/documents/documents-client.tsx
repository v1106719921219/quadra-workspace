"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { jstYearMonth } from "@/lib/time-utils";
import { getPayrollForMonth, getPayrollForYear, getRoster } from "./actions";

interface EmpInfo {
  name: string;
  employee_number: string | null;
  employee_type: string;
  bank_name: string | null;
  bank_branch: string | null;
  account_type: string | null;
  account_number: string | null;
  account_holder: string | null;
  dependents_count: number;
  tax_column: string;
  is_active: boolean;
  resident_tax_city: string | null;
  resident_tax_city_code: string | null;
  resident_tax_designation_number: string | null;
  resident_tax_addressee_number: string | null;
}

interface PayRecord {
  employee_id: string;
  year: number;
  month: number;
  work_days: number;
  total_hours: number;
  overtime_hours: number;
  late_night_hours: number;
  holiday_hours: number;
  base_pay: number;
  overtime_pay: number;
  late_night_pay: number;
  holiday_pay: number;
  absence_deduction: number;
  daily_allowance_total: number;
  driver_days: number;
  driver_allowance: number;
  transportation_allowance: number;
  gross_pay: number;
  health_insurance: number;
  care_insurance: number;
  child_support_contribution: number;
  pension: number;
  employment_insurance: number;
  income_tax: number;
  resident_tax: number;
  savings_deduction: number;
  total_deductions: number;
  net_pay: number;
  employees: EmpInfo;
}

interface RosterEmployee {
  id: string;
  name: string;
  employee_number: string | null;
  employee_type: string;
  is_active: boolean;
  address: string | null;
  birth_date: string | null;
  gender: string | null;
  hire_date: string | null;
  retire_date: string | null;
  job_description: string | null;
}

type ReportType =
  | "payment_deduction"
  | "bank_transfer"
  | "resident_tax"
  | "wage_ledger"
  | "withholding_book"
  | "roster";

const REPORTS: { key: ReportType; label: string; period: "month" | "year" | "none" }[] = [
  { key: "payment_deduction", label: "支給控除一覧表", period: "month" },
  { key: "bank_transfer", label: "給与振込一覧表", period: "month" },
  { key: "resident_tax", label: "住民税徴収額一覧表", period: "month" },
  { key: "wage_ledger", label: "賃金台帳", period: "year" },
  { key: "withholding_book", label: "源泉徴収簿", period: "year" },
  { key: "roster", label: "労働者名簿", period: "none" },
];

function yen(n: number): string {
  return `¥${(n || 0).toLocaleString()}`;
}

function num(n: number): string {
  return (n || 0).toLocaleString();
}

export function DocumentsClient({ orgName }: { orgName: string }) {
  const [reportType, setReportType] = useState<ReportType>("payment_deduction");
  const [year, setYear] = useState(() => jstYearMonth().year);
  const [month, setMonth] = useState(() => jstYearMonth().month);
  const [monthRecords, setMonthRecords] = useState<PayRecord[]>([]);
  const [yearRecords, setYearRecords] = useState<PayRecord[]>([]);
  const [roster, setRoster] = useState<RosterEmployee[]>([]);
  const [loading, setLoading] = useState(false);

  const report = REPORTS.find((r) => r.key === reportType)!;
  const period = report.period;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (period === "month") {
        const data = await getPayrollForMonth(year, month);
        setMonthRecords((data as unknown as PayRecord[]) || []);
      } else if (period === "year") {
        const data = await getPayrollForYear(year);
        setYearRecords((data as unknown as PayRecord[]) || []);
      } else {
        const data = await getRoster();
        setRoster((data as unknown as RosterEmployee[]) || []);
      }
    } catch {
      toast.error("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [period, year, month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function prevPeriod() {
    if (period === "year") {
      setYear(year - 1);
    } else if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  }

  function nextPeriod() {
    if (period === "year") {
      setYear(year + 1);
    } else if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  }

  const periodLabel =
    period === "year" ? `${year}年` : period === "month" ? `${year}年${month}月` : "";

  const noData =
    !loading &&
    ((period === "month" && monthRecords.length === 0) ||
      (period === "year" && yearRecords.length === 0) ||
      (period === "none" && roster.length === 0));

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/payroll">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">帳票</h1>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          印刷
        </Button>
      </div>

      {/* 帳票選択 */}
      <div className="flex flex-wrap gap-2 print:hidden">
        {REPORTS.map((r) => (
          <Button
            key={r.key}
            variant={reportType === r.key ? "default" : "outline"}
            size="sm"
            onClick={() => setReportType(r.key)}
          >
            {r.label}
          </Button>
        ))}
      </div>

      {/* 期間選択 */}
      {period !== "none" && (
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="icon" onClick={prevPeriod}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold min-w-[120px] text-center">{periodLabel}</span>
          <Button variant="outline" size="icon" onClick={nextPeriod}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {period === "month" && (
            <span className="text-xs text-muted-foreground ml-2">
              ※確定済みの給与データから作成されます
            </span>
          )}
        </div>
      )}

      {/* 帳票タイトル */}
      <div className="text-center pt-2">
        <h2 className="text-xl font-bold">{report.label}</h2>
        <p className="text-sm text-muted-foreground print:text-black">
          {orgName}
          {periodLabel && ` ・ ${periodLabel}${period === "month" ? "分" : ""}`}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : noData ? (
        <div className="text-center py-12 text-muted-foreground">
          {period === "none"
            ? "従業員が登録されていません"
            : `${periodLabel}の確定済み給与データがありません。給与計算ページで「給与確定」を行ってください。`}
        </div>
      ) : (
        <>
          {reportType === "payment_deduction" && <PaymentDeductionTable records={monthRecords} />}
          {reportType === "bank_transfer" && <BankTransferTable records={monthRecords} />}
          {reportType === "resident_tax" && (
            <ResidentTaxTable records={monthRecords} year={year} month={month} orgName={orgName} />
          )}
          {reportType === "wage_ledger" && <WageLedger records={yearRecords} year={year} orgName={orgName} />}
          {reportType === "withholding_book" && (
            <WithholdingBook records={yearRecords} year={year} orgName={orgName} />
          )}
          {reportType === "roster" && <Roster employees={roster} orgName={orgName} />}
        </>
      )}

      {/* 印刷用CSS */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          nav, header, [data-sidebar], button, .no-print { display: none !important; }
          body { font-size: 8pt; }
          .overflow-x-auto { overflow: visible !important; }
          table { page-break-inside: auto; width: 100%; }
          tr { page-break-inside: avoid; }
          th, td { padding: 2px 4px !important; }
        }
      `}</style>
    </div>
  );
}

// ===== 支給控除一覧表 =====
function PaymentDeductionTable({ records }: { records: PayRecord[] }) {
  const rows: { label: string; get: (r: PayRecord) => number; section?: string; bold?: boolean }[] = [
    { label: "出勤日数", get: (r) => r.work_days, section: "勤怠" },
    { label: "総労働時間", get: (r) => Number(r.total_hours) },
    { label: "残業時間", get: (r) => Number(r.overtime_hours) },
    { label: "基本給", get: (r) => r.base_pay, section: "支給" },
    { label: "残業手当", get: (r) => r.overtime_pay },
    { label: "深夜手当", get: (r) => r.late_night_pay },
    { label: "休日手当", get: (r) => r.holiday_pay },
    { label: "不就労控除", get: (r) => -(r.absence_deduction || 0) },
    { label: "業務手当", get: (r) => r.daily_allowance_total },
    { label: "ドライバー手当", get: (r) => r.driver_allowance || 0 },
    { label: "通勤手当", get: (r) => r.transportation_allowance },
    { label: "総支給額", get: (r) => r.gross_pay, bold: true },
    { label: "健康保険料", get: (r) => r.health_insurance, section: "控除" },
    { label: "介護保険料", get: (r) => r.care_insurance || 0 },
    { label: "厚生年金保険料", get: (r) => r.pension },
    { label: "子ども・子育て支援金", get: (r) => r.child_support_contribution || 0 },
    { label: "雇用保険料", get: (r) => r.employment_insurance },
    { label: "所得税", get: (r) => r.income_tax },
    { label: "住民税", get: (r) => r.resident_tax || 0 },
    { label: "積立金", get: (r) => r.savings_deduction || 0 },
    { label: "控除合計", get: (r) => r.total_deductions, bold: true },
    { label: "差引支給額", get: (r) => r.net_pay, section: "合計", bold: true },
  ];

  const isHours = (label: string) => label.includes("時間");
  const isDays = (label: string) => label.includes("日数");

  return (
    <div className="border rounded-lg overflow-x-auto print:border-black">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b print:bg-gray-100">
            <th className="text-left p-1.5 w-[40px]"></th>
            <th className="text-left p-1.5 min-w-[110px]">項目</th>
            {records.map((r) => (
              <th key={r.employee_id} className="text-right p-1.5 whitespace-nowrap">
                {r.employees.name}
              </th>
            ))}
            <th className="text-right p-1.5 bg-muted/70 print:bg-gray-200">合計</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const total = records.reduce((s, r) => s + row.get(r), 0);
            const fmt = (v: number) =>
              isHours(row.label) ? v.toFixed(2) : isDays(row.label) ? `${v}` : yen(v);
            return (
              <tr key={row.label} className={`border-b ${row.bold ? "font-bold bg-muted/20" : ""}`}>
                <td className="p-1.5 text-muted-foreground print:text-black">{row.section || ""}</td>
                <td className="p-1.5">{row.label}</td>
                {records.map((r) => (
                  <td key={r.employee_id} className="p-1.5 text-right font-mono">
                    {fmt(row.get(r))}
                  </td>
                ))}
                <td className="p-1.5 text-right font-mono bg-muted/30 print:bg-gray-100">{fmt(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ===== 給与振込一覧表 =====
function BankTransferTable({ records }: { records: PayRecord[] }) {
  const total = records.reduce((s, r) => s + r.net_pay, 0);
  const missingBank = records.some((r) => !r.employees.bank_name);
  return (
    <div className="space-y-2">
      {missingBank && (
        <p className="text-xs text-amber-600 print:hidden">
          ※口座情報が未登録の従業員がいます。従業員管理から登録してください。
        </p>
      )}
      <div className="border rounded-lg overflow-x-auto print:border-black">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b print:bg-gray-100">
              <th className="text-left p-2">従業員</th>
              <th className="text-left p-2">銀行名</th>
              <th className="text-left p-2">支店名</th>
              <th className="text-left p-2 w-[60px]">種別</th>
              <th className="text-left p-2">口座番号</th>
              <th className="text-left p-2">口座名義</th>
              <th className="text-right p-2">振込金額</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.employee_id} className="border-b">
                <td className="p-2 font-medium">{r.employees.name}</td>
                <td className="p-2">{r.employees.bank_name || "-"}</td>
                <td className="p-2">{r.employees.bank_branch || "-"}</td>
                <td className="p-2">
                  {r.employees.bank_name
                    ? r.employees.account_type === "checking"
                      ? "当座"
                      : "普通"
                    : "-"}
                </td>
                <td className="p-2 font-mono">{r.employees.account_number || "-"}</td>
                <td className="p-2">{r.employees.account_holder || "-"}</td>
                <td className="p-2 text-right font-mono font-medium">{yen(r.net_pay)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-bold border-t print:bg-gray-100">
              <td colSpan={6} className="p-2 text-right">
                合計（{records.length}件）
              </td>
              <td className="p-2 text-right font-mono">{yen(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ===== 住民税徴収額一覧表（自治体別） =====
function ResidentTaxTable({
  records,
  year,
  month,
  orgName,
}: {
  records: PayRecord[];
  year: number;
  month: number;
  orgName: string;
}) {
  const rows = records.filter((r) => (r.resident_tax || 0) > 0);
  const total = rows.reduce((s, r) => s + (r.resident_tax || 0), 0);

  // 納付期限: 翌月10日
  const dueYear = month === 12 ? year + 1 : year;
  const dueMonth = month === 12 ? 1 : month + 1;
  const dueReiwa = dueYear - 2018;

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        この月の住民税控除はありません
      </div>
    );
  }

  // 納付先（市区町村）ごとにグループ化
  const byCity = new Map<string, PayRecord[]>();
  rows.forEach((r) => {
    const city = r.employees.resident_tax_city || "（納付先未設定）";
    const list = byCity.get(city) || [];
    list.push(r);
    byCity.set(city, list);
  });

  const hasUnsetCity = byCity.has("（納付先未設定）");

  return (
    <div className="max-w-4xl mx-auto space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <p>
          対象月: {year}年{month}月分 ／ 納付期限: 令和{dueReiwa}年{dueMonth}月10日
        </p>
        <p>{orgName}</p>
      </div>
      {hasUnsetCity && (
        <p className="text-xs text-amber-600 print:hidden">
          ※納付先が未設定の従業員がいます。従業員管理の「住民税納付先」から登録してください。
        </p>
      )}
      <div className="border rounded-lg overflow-x-auto print:border-black">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b print:bg-gray-100">
              <th className="text-left p-2">住民税納付先</th>
              <th className="text-left p-2">自治体コード</th>
              <th className="text-left p-2">指定番号</th>
              <th className="text-right p-2 w-[60px]">人数</th>
              <th className="text-left p-2">宛名番号</th>
              <th className="text-left p-2">従業員名</th>
              <th className="text-right p-2">徴収税額</th>
              <th className="text-center p-2 w-[50px]">退職</th>
            </tr>
          </thead>
          <tbody>
            {[...byCity.entries()].map(([city, cityRows]) => {
              const emp0 = cityRows[0].employees;
              const cityTotal = cityRows.reduce((s, r) => s + (r.resident_tax || 0), 0);
              return (
                <React.Fragment key={city}>
                  <tr className="border-b bg-muted/30 print:bg-gray-50 font-medium">
                    <td className="p-2">{city}</td>
                    <td className="p-2 font-mono">{emp0.resident_tax_city_code || ""}</td>
                    <td className="p-2 font-mono">{emp0.resident_tax_designation_number || ""}</td>
                    <td className="p-2 text-right font-mono">{cityRows.length}</td>
                    <td className="p-2"></td>
                    <td className="p-2"></td>
                    <td className="p-2 text-right font-mono">{num(cityTotal)}</td>
                    <td className="p-2"></td>
                  </tr>
                  {cityRows.map((r) => (
                    <tr key={r.employee_id} className="border-b">
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                      <td className="p-2 font-mono">
                        {r.employees.resident_tax_addressee_number || ""}
                      </td>
                      <td className="p-2">{r.employees.name}</td>
                      <td className="p-2 text-right font-mono">{num(r.resident_tax)}</td>
                      <td className="p-2 text-center">{!r.employees.is_active ? "退職" : ""}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-bold border-t print:bg-gray-100">
              <td className="p-2">合計</td>
              <td className="p-2"></td>
              <td className="p-2"></td>
              <td className="p-2 text-right font-mono">{rows.length}</td>
              <td className="p-2"></td>
              <td className="p-2"></td>
              <td className="p-2 text-right font-mono">{num(total)}</td>
              <td className="p-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ===== 賃金台帳（年・従業員別） =====
function WageLedger({ records, year, orgName }: { records: PayRecord[]; year: number; orgName: string }) {
  // 従業員ごとにグループ化
  const byEmployee = new Map<string, PayRecord[]>();
  records.forEach((r) => {
    const list = byEmployee.get(r.employee_id) || [];
    list.push(r);
    byEmployee.set(r.employee_id, list);
  });

  const rows: { label: string; get: (r: PayRecord) => number; fmt?: "days" | "hours"; bold?: boolean }[] = [
    { label: "出勤日数", get: (r) => r.work_days, fmt: "days" },
    { label: "労働時間", get: (r) => Number(r.total_hours), fmt: "hours" },
    { label: "残業時間", get: (r) => Number(r.overtime_hours), fmt: "hours" },
    { label: "基本給", get: (r) => r.base_pay },
    { label: "残業手当", get: (r) => r.overtime_pay },
    { label: "深夜手当", get: (r) => r.late_night_pay },
    { label: "休日手当", get: (r) => r.holiday_pay },
    { label: "業務手当", get: (r) => r.daily_allowance_total },
    { label: "ドライバー手当", get: (r) => r.driver_allowance || 0 },
    { label: "通勤手当", get: (r) => r.transportation_allowance },
    { label: "総支給額", get: (r) => r.gross_pay, bold: true },
    { label: "社会保険料", get: (r) => r.health_insurance + (r.care_insurance || 0) + r.pension + (r.child_support_contribution || 0) },
    { label: "雇用保険料", get: (r) => r.employment_insurance },
    { label: "所得税", get: (r) => r.income_tax },
    { label: "住民税", get: (r) => r.resident_tax || 0 },
    { label: "控除合計", get: (r) => r.total_deductions, bold: true },
    { label: "差引支給額", get: (r) => r.net_pay, bold: true },
  ];

  return (
    <div className="space-y-8">
      {[...byEmployee.entries()].map(([empId, empRecords], idx) => {
        const emp = empRecords[0].employees;
        const monthMap = new Map(empRecords.map((r) => [r.month, r]));
        return (
          <div key={empId} className={idx > 0 ? "break-before-page" : ""}>
            <div className="flex items-baseline justify-between mb-2">
              <p className="font-bold">
                {emp.name}
                <span className="text-sm font-normal text-muted-foreground ml-2 print:text-black">
                  {emp.employee_number || ""} ・ {emp.employee_type === "part_time" ? "パート" : "社員"}
                </span>
              </p>
              <p className="text-sm text-muted-foreground print:text-black">
                {orgName} ・ {year}年 賃金台帳
              </p>
            </div>
            <div className="border rounded-lg overflow-x-auto print:border-black">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b print:bg-gray-100">
                    <th className="text-left p-1.5 min-w-[100px]">項目</th>
                    {Array.from({ length: 12 }, (_, i) => (
                      <th key={i} className="text-right p-1.5">
                        {i + 1}月
                      </th>
                    ))}
                    <th className="text-right p-1.5 bg-muted/70 print:bg-gray-200">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const fmt = (v: number) =>
                      row.fmt === "hours" ? v.toFixed(1) : row.fmt === "days" ? `${v}` : num(v);
                    const total = empRecords.reduce((s, r) => s + row.get(r), 0);
                    return (
                      <tr key={row.label} className={`border-b ${row.bold ? "font-bold bg-muted/20" : ""}`}>
                        <td className="p-1.5">{row.label}</td>
                        {Array.from({ length: 12 }, (_, i) => {
                          const rec = monthMap.get(i + 1);
                          return (
                            <td key={i} className="p-1.5 text-right font-mono">
                              {rec ? fmt(row.get(rec)) : ""}
                            </td>
                          );
                        })}
                        <td className="p-1.5 text-right font-mono bg-muted/30 print:bg-gray-100">
                          {fmt(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===== 源泉徴収簿（年・従業員別） =====
function WithholdingBook({ records, year, orgName }: { records: PayRecord[]; year: number; orgName: string }) {
  const byEmployee = new Map<string, PayRecord[]>();
  records.forEach((r) => {
    const list = byEmployee.get(r.employee_id) || [];
    list.push(r);
    byEmployee.set(r.employee_id, list);
  });

  return (
    <div className="space-y-8">
      {[...byEmployee.entries()].map(([empId, empRecords], idx) => {
        const emp = empRecords[0].employees;
        const monthMap = new Map(empRecords.map((r) => [r.month, r]));
        const socialIns = (r: PayRecord) =>
          r.health_insurance + (r.care_insurance || 0) + r.pension + (r.child_support_contribution || 0) + r.employment_insurance;
        const totGross = empRecords.reduce((s, r) => s + r.gross_pay, 0);
        const totSocial = empRecords.reduce((s, r) => s + socialIns(r), 0);
        const totTax = empRecords.reduce((s, r) => s + r.income_tax, 0);
        return (
          <div key={empId} className={idx > 0 ? "break-before-page" : ""}>
            <div className="flex items-baseline justify-between mb-2">
              <p className="font-bold">
                {emp.name}
                <span className="text-sm font-normal text-muted-foreground ml-2 print:text-black">
                  {emp.employee_number || ""} ・ {emp.tax_column === "otsu" ? "乙欄" : "甲欄"} ・ 扶養
                  {emp.dependents_count}人
                </span>
              </p>
              <p className="text-sm text-muted-foreground print:text-black">
                {orgName} ・ {year}年分 源泉徴収簿
              </p>
            </div>
            <div className="border rounded-lg overflow-x-auto print:border-black">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b print:bg-gray-100">
                    <th className="text-left p-1.5 w-[50px]">月</th>
                    <th className="text-right p-1.5">総支給金額</th>
                    <th className="text-right p-1.5">社会保険料等</th>
                    <th className="text-right p-1.5">社保控除後の給与等</th>
                    <th className="text-right p-1.5">算出税額</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, i) => {
                    const rec = monthMap.get(i + 1);
                    return (
                      <tr key={i} className="border-b">
                        <td className="p-1.5">{i + 1}月</td>
                        <td className="p-1.5 text-right font-mono">{rec ? num(rec.gross_pay) : ""}</td>
                        <td className="p-1.5 text-right font-mono">{rec ? num(socialIns(rec)) : ""}</td>
                        <td className="p-1.5 text-right font-mono">
                          {rec ? num(rec.gross_pay - socialIns(rec)) : ""}
                        </td>
                        <td className="p-1.5 text-right font-mono">{rec ? num(rec.income_tax) : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 font-bold border-t print:bg-gray-100">
                    <td className="p-1.5">合計</td>
                    <td className="p-1.5 text-right font-mono">{num(totGross)}</td>
                    <td className="p-1.5 text-right font-mono">{num(totSocial)}</td>
                    <td className="p-1.5 text-right font-mono">{num(totGross - totSocial)}</td>
                    <td className="p-1.5 text-right font-mono">{num(totTax)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===== 労働者名簿 =====
function Roster({ employees, orgName }: { employees: RosterEmployee[]; orgName: string }) {
  const genderLabel = (g: string | null) => (g === "male" ? "男" : g === "female" ? "女" : "-");
  const fmtDate = (d: string | null) => {
    if (!d) return "-";
    const [y, m, day] = d.split("-");
    return `${y}年${Number(m)}月${Number(day)}日`;
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
      {employees.map((e) => (
        <div key={e.id} className="border rounded-lg p-4 print:border-black break-inside-avoid">
          <div className="flex items-baseline justify-between border-b pb-2 mb-2">
            <p className="font-bold text-base">{e.name}</p>
            <p className="text-xs text-muted-foreground print:text-black">
              {e.employee_number || ""} {!e.is_active && "（退職済）"}
            </p>
          </div>
          <dl className="text-sm grid grid-cols-[110px_1fr] gap-y-1.5">
            <dt className="text-muted-foreground print:text-black">性別</dt>
            <dd>{genderLabel(e.gender)}</dd>
            <dt className="text-muted-foreground print:text-black">生年月日</dt>
            <dd>{fmtDate(e.birth_date)}</dd>
            <dt className="text-muted-foreground print:text-black">住所</dt>
            <dd>{e.address || "-"}</dd>
            <dt className="text-muted-foreground print:text-black">業務の種類</dt>
            <dd>{e.job_description || "-"}</dd>
            <dt className="text-muted-foreground print:text-black">雇用形態</dt>
            <dd>{e.employee_type === "part_time" ? "パート" : "社員"}</dd>
            <dt className="text-muted-foreground print:text-black">雇入年月日</dt>
            <dd>{fmtDate(e.hire_date)}</dd>
            <dt className="text-muted-foreground print:text-black">退職年月日</dt>
            <dd>{fmtDate(e.retire_date)}</dd>
            <dt className="text-muted-foreground print:text-black">事業所</dt>
            <dd>{orgName}</dd>
          </dl>
        </div>
      ))}
    </div>
  );
}
