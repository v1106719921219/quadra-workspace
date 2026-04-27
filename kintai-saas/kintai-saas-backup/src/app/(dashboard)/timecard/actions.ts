"use server";

import { createClient } from "@/lib/supabase/server";

export async function getActiveEmployees() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, employee_number")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getTimeRecordsForPeriod(employeeId: string, startDate: string, endDate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_records")
    .select("id, work_date, clock_in, clock_out, break_minutes, is_driver, work_types(name), job_site_id, job_sites(name, short_name)")
    .eq("employee_id", employeeId)
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .order("work_date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getTenantSettings() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("closing_day, time_rounding_minutes")
    .single();
  if (error) throw error;
  return data;
}
