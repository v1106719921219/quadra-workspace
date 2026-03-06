"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export interface EmployeeWithStatus {
  id: string;
  name: string;
  employee_number: string | null;
  is_active: boolean;
  active_record: {
    id: string;
    clock_in: string;
    work_type_name: string;
  } | null;
}

export async function getEmployeesWithStatus(): Promise<EmployeeWithStatus[]> {
  const supabase = await createClient();

  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, name, employee_number, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!employees) return [];

  // 出勤中のレコードを取得
  const { data: activeRecords } = await supabase
    .from("time_records")
    .select("id, employee_id, clock_in, work_types(name)")
    .is("clock_out", null);

  const activeMap = new Map<string, { id: string; clock_in: string; work_type_name: string }>();
  activeRecords?.forEach((record) => {
    const wt = record.work_types as unknown as { name: string };
    activeMap.set(record.employee_id, {
      id: record.id,
      clock_in: record.clock_in,
      work_type_name: wt?.name || "",
    });
  });

  return employees.map((emp) => ({
    ...emp,
    active_record: activeMap.get(emp.id) || null,
  }));
}

export async function getActiveWorkTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_types")
    .select("id, name, daily_allowance")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function clockIn(employeeId: string, workTypeId: string) {
  const supabase = await createClient();
  const tenantId = await getTenantId();
  const now = new Date();
  const workDate = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const { error } = await supabase.from("time_records").insert({
    tenant_id: tenantId,
    employee_id: employeeId,
    work_type_id: workTypeId,
    work_date: workDate,
    clock_in: now.toISOString(),
  });

  if (error) {
    if (error.message.includes("unique") || error.code === "23505") {
      throw new Error("既に出勤中です");
    }
    throw error;
  }
  revalidatePath("/clock");
}

export async function clockOut(recordId: string, breakMinutes: number = 0) {
  const supabase = await createClient();
  const now = new Date();

  const { error } = await supabase
    .from("time_records")
    .update({
      clock_out: now.toISOString(),
      break_minutes: breakMinutes,
    })
    .eq("id", recordId);

  if (error) throw error;
  revalidatePath("/clock");
}
