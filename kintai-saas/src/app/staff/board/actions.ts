"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

export async function getActiveJobSites() {
  const admin = createAdminClient();
  const tenantId = await getTenantId();
  const { data, error } = await admin
    .from("job_sites")
    .select("id, name, short_name, client_name, color")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getActiveEmployees() {
  const admin = createAdminClient();
  const tenantId = await getTenantId();
  const { data, error } = await admin
    .from("employees")
    .select("id, name, can_be_driver, is_spot, board_char")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getAssignments(startDate: string, endDate: string) {
  const admin = createAdminClient();
  const tenantId = await getTenantId();
  const { data, error } = await admin
    .from("site_assignments")
    .select("id, employee_id, job_site_id, assignment_date, start_time, is_driver, car_number, note")
    .eq("tenant_id", tenantId)
    .gte("assignment_date", startDate)
    .lte("assignment_date", endDate);
  if (error) throw error;
  return data;
}

export async function getSiteDailyLabels(startDate: string, endDate: string) {
  const admin = createAdminClient();
  const tenantId = await getTenantId();
  const { data, error } = await admin
    .from("site_daily_labels")
    .select("job_site_id, label_date, site_name, car_number, departure_time")
    .eq("tenant_id", tenantId)
    .gte("label_date", startDate)
    .lte("label_date", endDate);
  if (error) throw error;
  return data || [];
}
