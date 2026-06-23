"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { calculateEmployeePayroll } from "@/lib/payroll/calculate";
import type { EmployeeForPayroll, TimeRecordForPayroll, PayrollCalculation } from "@/lib/payroll/types";
import { getClosingPeriod } from "@/lib/closing-period";

export async function calculateMonthlyPayroll(year: number, month: number): Promise<PayrollCalculation[]> {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  // 締め日設定を取得
  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("closing_day")
    .eq("tenant_id", tenantId)
    .single();

  const closingDay = settings?.closing_day ?? 0;
  const period = getClosingPeriod(year, month, closingDay);

  // 締め日に基づく対象期間
  const startDate = period.startDate;
  // endDateはlte条件で使うのでそのまま、lt条件用には翌日を計算
  const endDateForLt = addOneDay(period.endDate);

  const { data: records, error: recordsError } = await supabase
    .from("time_records")
    .select("id, employee_id, work_date, clock_in, clock_out, break_minutes, is_driver, actual_hours_override, work_types(name, daily_allowance, hourly_rate)")
    .gte("work_date", startDate)
    .lt("work_date", endDateForLt)
    .not("clock_out", "is", null)
    .order("work_date", { ascending: true });

  if (recordsError) throw recordsError;

  // 有効な従業員取得
  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (empError) throw empError;

  // ★ 配置ボード（ホワイトボード）のデータ取得
  const { data: assignments } = await supabase
    .from("site_assignments")
    .select("employee_id, assignment_date, job_sites(name, daily_allowance, hourly_rate)")
    .gte("assignment_date", startDate)
    .lt("assignment_date", endDateForLt);

  // employee_id + date → 現場情報のマップを作成
  // 同じ日に複数現場がある場合、daily_allowanceは合算
  const siteMap = new Map<string, { daily_allowance: number; hourly_rate: number | null; name: string | null }>();
  for (const a of assignments || []) {
    const key = `${a.employee_id}__${a.assignment_date}`;
    const js = Array.isArray(a.job_sites) ? a.job_sites[0] : a.job_sites;
    if (!js) continue;
    if (siteMap.has(key)) {
      const existing = siteMap.get(key)!;
      existing.daily_allowance += js.daily_allowance || 0;
    } else {
      siteMap.set(key, {
        daily_allowance: js.daily_allowance || 0,
        hourly_rate: js.hourly_rate ?? null,
        name: js.name ?? null,
      });
    }
  }

  // work_typesをオブジェクト形式に正規化し、配置ボードの現場情報を付加
  const normalizedRecords: TimeRecordForPayroll[] = (records || []).map((r) => {
    const key = `${r.employee_id}__${r.work_date}`;
    const siteInfo = siteMap.get(key);
    return {
      id: r.id,
      employee_id: r.employee_id,
      work_date: r.work_date,
      clock_in: r.clock_in,
      clock_out: r.clock_out,
      break_minutes: r.break_minutes,
      is_driver: r.is_driver,
      actual_hours_override: r.actual_hours_override ?? null,
      work_types: Array.isArray(r.work_types) ? r.work_types[0] : r.work_types,
      site_daily_allowance: siteInfo?.daily_allowance ?? 0,
      site_hourly_rate: siteInfo?.hourly_rate ?? null,
      site_name: siteInfo?.name ?? null,
    };
  });

  // 従業員ごとに打刻をグループ化して計算
  const calculations: PayrollCalculation[] = [];

  for (const emp of employees || []) {
    const empForPayroll: EmployeeForPayroll = {
      id: emp.id,
      name: emp.name,
      employee_number: emp.employee_number,
      employee_type: emp.employee_type as "part_time" | "full_time",
      hourly_rate: emp.hourly_rate,
      monthly_salary: emp.monthly_salary,
      transportation_allowance: emp.transportation_allowance ?? 0,
      dependents_count: emp.dependents_count ?? 0,
      tax_column: (emp.tax_column as "kou" | "otsu") ?? "kou",
      social_insurance_enrolled: emp.social_insurance_enrolled ?? false,
      employment_insurance_enrolled: emp.employment_insurance_enrolled ?? false,
      standard_monthly_remuneration: emp.standard_monthly_remuneration ?? 0,
      resident_tax: emp.resident_tax ?? 0,
      savings_deduction: emp.savings_deduction ?? 0,
    };
    const empRecords = normalizedRecords.filter((r) => r.employee_id === emp.id);
    const calculation = calculateEmployeePayroll(empForPayroll, empRecords);
    calculations.push(calculation);
  }

  return calculations;
}

export async function getPayrollRecords(year: number, month: number) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("payroll_records")
    .select("*, employees(name, employee_number, employee_type)")
    .eq("year", year)
    .eq("month", month)
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function confirmPayroll(year: number, month: number, calculations: PayrollCalculation[]) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  // 各従業員のレコードをUPSERT
  for (const calc of calculations) {
    const { error } = await supabase
      .from("payroll_records")
      .upsert(
        {
          tenant_id: tenantId,
          employee_id: calc.employee.id,
          year,
          month,
          work_days: calc.workDays,
          total_hours: calc.totalHours,
          overtime_hours: calc.overtimeHours,
          late_night_hours: calc.lateNightHours,
          holiday_hours: calc.holidayHours,
          base_pay: calc.basePay,
          overtime_pay: calc.overtimePay,
          late_night_pay: calc.lateNightPay,
          holiday_pay: calc.holidayPay,
          daily_allowance_total: calc.dailyAllowanceTotal,
          driver_days: calc.driverDays,
          driver_allowance: calc.driverAllowance,
          transportation_allowance: calc.transportationAllowance,
          gross_pay: calc.grossPay,
          absence_deduction: calc.absenceDeduction,
          health_insurance: calc.healthInsurance,
          pension: calc.pension,
          child_support_contribution: calc.childSupportContribution,
          employment_insurance: calc.employmentInsurance,
          income_tax: calc.incomeTax,
          resident_tax: calc.residentTax,
          savings_deduction: calc.savingsDeduction,
          total_deductions: calc.totalDeductions,
          net_pay: calc.netPay,
          status: "confirmed",
          calculation_details: {
            dailyDetails: calc.dailyDetails,
            employee: calc.employee,
          },
        },
        { onConflict: "tenant_id,employee_id,year,month" }
      );

    if (error) throw error;
  }

  revalidatePath("/payroll");
}

export async function unconfirmPayroll(year: number, month: number) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("payroll_records")
    .delete()
    .eq("year", year)
    .eq("month", month);

  if (error) throw error;
  revalidatePath("/payroll");
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
