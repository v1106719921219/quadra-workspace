"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

// 従業員一覧取得（名前のみ）
export async function getActiveEmployees() {
  const tenantId = await getTenantId();
  const admin = createAdminClient();
  const { data } = await admin
    .from("employees")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at");
  return data || [];
}

// PIN認証
export async function verifyPin(employeeId: string, pin: string): Promise<boolean> {
  const tenantId = await getTenantId();
  const admin = createAdminClient();
  const { data } = await admin
    .from("employees")
    .select("pin")
    .eq("id", employeeId)
    .eq("tenant_id", tenantId)
    .single();
  if (!data) return false;
  // PINが未設定の場合は拒否
  if (!data.pin) return false;
  return data.pin === pin;
}

// 他の従業員の休日希望を取得（名前付き）
export async function getOthersDayOffRequests(employeeId: string, year: number, month: number) {
  const tenantId = await getTenantId();
  const admin = createAdminClient();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toLocaleDateString("sv-SE");
  const { data } = await admin
    .from("day_off_requests")
    .select("request_date, employee_id, employees(name)")
    .eq("tenant_id", tenantId)
    .neq("employee_id", employeeId)
    .gte("request_date", startDate)
    .lte("request_date", endDate);
  return data || [];
}

// 休日希望の取得
export async function getDayOffRequests(employeeId: string, year: number, month: number) {
  const tenantId = await getTenantId();
  const admin = createAdminClient();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toLocaleDateString("sv-SE");
  const { data } = await admin
    .from("day_off_requests")
    .select("request_date, status")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employeeId)
    .gte("request_date", startDate)
    .lte("request_date", endDate);
  return data || [];
}

// 休日希望の保存（月まるごと上書き）
export async function saveDayOffRequests(employeeId: string, dates: string[]) {
  const tenantId = await getTenantId();
  const admin = createAdminClient();

  if (dates.length === 0) return;

  // 対象月を判定して既存削除
  const year = dates[0].split("-")[0];
  const month = dates[0].split("-")[1];
  const startDate = `${year}-${month}-01`;
  const endDate = new Date(parseInt(year), parseInt(month), 0).toLocaleDateString("sv-SE");

  await admin
    .from("day_off_requests")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("employee_id", employeeId)
    .gte("request_date", startDate)
    .lte("request_date", endDate);

  if (dates.length > 0) {
    await admin.from("day_off_requests").insert(
      dates.map((d) => ({
        tenant_id: tenantId,
        employee_id: employeeId,
        request_date: d,
      }))
    );
  }
}
