"use server";

import { createClient } from "@/lib/supabase/server";

export interface EmployeeSummary {
  employee_id: string;
  employee_name: string;
  employee_type: string;
  hourly_rate: number | null;
  monthly_salary: number | null;
  work_days: number;
  total_hours: number;
  total_break_minutes: number;
  daily_allowance_total: number;
  base_pay: number;
  total_pay: number;
}

export async function getMonthlyReport(year: number, month: number): Promise<EmployeeSummary[]> {
  const supabase = await createClient();

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // 勤怠記録取得
  const { data: records, error } = await supabase
    .from("time_records")
    .select("*, employees(id, name, employee_type, hourly_rate, monthly_salary), work_types(name, daily_allowance)")
    .gte("work_date", startDate)
    .lt("work_date", endDate)
    .not("clock_out", "is", null)
    .order("work_date");

  if (error) throw error;
  if (!records || records.length === 0) return [];

  // 従業員ごとに集計
  const summaryMap = new Map<string, {
    employee_name: string;
    employee_type: string;
    hourly_rate: number | null;
    monthly_salary: number | null;
    dates: Set<string>;
    total_minutes: number;
    total_break_minutes: number;
    // 日ごとの最高手当を追跡
    daily_max_allowance: Map<string, number>;
  }>();

  records.forEach((r) => {
    const emp = r.employees as unknown as {
      id: string; name: string; employee_type: string;
      hourly_rate: number | null; monthly_salary: number | null;
    };
    const wt = r.work_types as unknown as { name: string; daily_allowance: number };

    if (!summaryMap.has(r.employee_id)) {
      summaryMap.set(r.employee_id, {
        employee_name: emp.name,
        employee_type: emp.employee_type,
        hourly_rate: emp.hourly_rate,
        monthly_salary: emp.monthly_salary,
        dates: new Set(),
        total_minutes: 0,
        total_break_minutes: 0,
        daily_max_allowance: new Map(),
      });
    }

    const s = summaryMap.get(r.employee_id)!;
    s.dates.add(r.work_date);

    if (r.clock_out) {
      const workMinutes = (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 1000 / 60;
      s.total_minutes += workMinutes;
      s.total_break_minutes += r.break_minutes;
    }

    // 同日の最高手当を適用
    const currentMax = s.daily_max_allowance.get(r.work_date) || 0;
    if (wt.daily_allowance > currentMax) {
      s.daily_max_allowance.set(r.work_date, wt.daily_allowance);
    }
  });

  const result: EmployeeSummary[] = [];
  summaryMap.forEach((s, empId) => {
    const totalHours = Math.max(0, (s.total_minutes - s.total_break_minutes) / 60);
    let dailyAllowanceTotal = 0;
    s.daily_max_allowance.forEach((allowance) => {
      dailyAllowanceTotal += allowance;
    });

    let basePay = 0;
    if (s.employee_type === "part_time" && s.hourly_rate) {
      basePay = Math.round(s.hourly_rate * totalHours);
    } else if (s.employee_type === "full_time" && s.monthly_salary) {
      basePay = s.monthly_salary;
    }

    result.push({
      employee_id: empId,
      employee_name: s.employee_name,
      employee_type: s.employee_type,
      hourly_rate: s.hourly_rate,
      monthly_salary: s.monthly_salary,
      work_days: s.dates.size,
      total_hours: totalHours,
      total_break_minutes: s.total_break_minutes,
      daily_allowance_total: dailyAllowanceTotal,
      base_pay: basePay,
      total_pay: basePay + dailyAllowanceTotal,
    });
  });

  return result.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}
