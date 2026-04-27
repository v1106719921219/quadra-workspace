"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { calculateEmployeePayroll } from "@/lib/payroll/calculate";
import type { EmployeeForPayroll, TimeRecordForPayroll, PayrollCalculation } from "@/lib/payroll/types";

export async function calculateMonthlyPayroll(year: number, month: number): Promise<PayrollCalculation[]> {
  const supabase = await createClient();

  // 対象月の打刻データ取得
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const { data: records, error: recordsError } = await supabase
    .from("time_records")
    .select("id, employee_id, work_date, clock_in, clock_out, break_minutes, work_types(name, daily_allowance)")
    .gte("work_date", startDate)
    .lt("work_date", endDate)
    .not("clock_out", "is", null)
    .order("work_date", { ascending: true });

  if (recordsError) throw recordsError;

  // 有効な従業員取得
  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("id, name, employee_number, employee_type, hourly_rate, monthly_salary, transportation_allowance, dependents_count, tax_column, social_insurance_enrolled")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (empError) throw empError;

  // work_typesをオブジェクト形式に正規化（Supabaseが配列で返す場合の対応）
  const normalizedRecords: TimeRecordForPayroll[] = (records || []).map((r) => ({
    id: r.id,
    employee_id: r.employee_id,
    work_date: r.work_date,
    clock_in: r.clock_in,
    clock_out: r.clock_out,
    break_minutes: r.break_minutes,
    work_types: Array.isArray(r.work_types) ? r.work_types[0] : r.work_types,
  }));

  // 従業員ごとに打刻をグループ化して計算
  const calculations: PayrollCalculation[] = [];

  for (const emp of employees || []) {
    const empRecords = normalizedRecords.filter((r) => r.employee_id === emp.id);
    const calculation = calculateEmployeePayroll(emp as EmployeeForPayroll, empRecords);
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
          transportation_allowance: calc.transportationAllowance,
          gross_pay: calc.grossPay,
          health_insurance: calc.healthInsurance,
          pension: calc.pension,
          employment_insurance: calc.employmentInsurance,
          income_tax: calc.incomeTax,
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
