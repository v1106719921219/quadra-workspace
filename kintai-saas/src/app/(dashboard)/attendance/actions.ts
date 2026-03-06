"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export async function getTimeRecords(date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_records")
    .select("*, employees(name, employee_type), work_types(name, daily_allowance)")
    .eq("work_date", date)
    .order("clock_in", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getMonthlyRecords(year: number, month: number) {
  const supabase = await createClient();

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const { data, error } = await supabase
    .from("time_records")
    .select("*, employees(id, name, employee_type, hourly_rate, monthly_salary), work_types(name, daily_allowance)")
    .gte("work_date", startDate)
    .lt("work_date", endDate)
    .order("work_date", { ascending: true })
    .order("clock_in", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function updateTimeRecord(
  id: string,
  data: {
    clock_in?: string;
    clock_out?: string | null;
    break_minutes?: number;
    work_type_id?: string;
    note?: string;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("time_records")
    .update(data)
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/attendance");
}

export async function createManualRecord(formData: FormData) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const employeeId = formData.get("employee_id") as string;
  const workTypeId = formData.get("work_type_id") as string;
  const workDate = formData.get("work_date") as string;
  const clockInTime = formData.get("clock_in_time") as string;
  const clockOutTime = formData.get("clock_out_time") as string;
  const breakMinutes = parseInt(formData.get("break_minutes") as string) || 0;

  const clockIn = new Date(`${workDate}T${clockInTime}:00+09:00`).toISOString();
  const clockOut = clockOutTime
    ? new Date(`${workDate}T${clockOutTime}:00+09:00`).toISOString()
    : null;

  const { error } = await supabase.from("time_records").insert({
    tenant_id: tenantId,
    employee_id: employeeId,
    work_type_id: workTypeId,
    work_date: workDate,
    clock_in: clockIn,
    clock_out: clockOut,
    break_minutes: breakMinutes,
  });

  if (error) throw error;
  revalidatePath("/attendance");
}

export async function deleteTimeRecord(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("time_records").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/attendance");
}
