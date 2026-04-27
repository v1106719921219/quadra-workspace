"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

export async function getDayOffRequestsByMonth(year: number, month: number) {
  const tenantId = await getTenantId();
  const admin = createAdminClient();

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toLocaleDateString("sv-SE");

  const { data } = await admin
    .from("day_off_requests")
    .select("id, employee_id, request_date, status, employees(name)")
    .eq("tenant_id", tenantId)
    .gte("request_date", startDate)
    .lte("request_date", endDate)
    .order("request_date");

  return data || [];
}
