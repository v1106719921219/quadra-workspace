"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export async function getActiveJobSites() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_sites")
    .select("id, name, short_name, client_name, color")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getActiveEmployees() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, can_be_driver, is_spot, board_char")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getAssignments(startDate: string, endDate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_assignments")
    .select("id, employee_id, job_site_id, assignment_date, start_time, is_driver, car_number, note")
    .gte("assignment_date", startDate)
    .lte("assignment_date", endDate);
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

export async function createAssignment(params: {
  employee_id: string;
  job_site_id: string;
  assignment_date: string;
  is_driver: boolean;
  car_number?: string | null;
  start_time?: string | null;
  note?: string;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const { data: inserted, error } = await supabase.from("site_assignments").insert({
    tenant_id: tenantId,
    employee_id: params.employee_id,
    job_site_id: params.job_site_id,
    assignment_date: params.assignment_date,
    is_driver: params.is_driver,
    car_number: params.car_number || null,
    start_time: params.start_time || null,
    note: params.note || null,
  }).select("id").single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("同じ日に同じ現場への配置が既に存在します");
    }
    throw error;
  }
  revalidatePath("/board");
  return { id: inserted.id as string };
}

export async function updateAssignment(
  id: string,
  params: {
    is_driver?: boolean;
    car_number?: string | null;
    start_time?: string | null;
    note?: string;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_assignments")
    .update(params)
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/board");
}

export async function deleteAssignment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("site_assignments").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/board");
}

export async function copyPreviousDay(targetDate: string) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const target = new Date(targetDate + "T00:00:00+09:00");
  target.setDate(target.getDate() - 1);
  const prevDate = target.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const { data: prevAssignments, error: fetchError } = await supabase
    .from("site_assignments")
    .select("employee_id, job_site_id, is_driver, car_number, start_time, note")
    .eq("assignment_date", prevDate);

  if (fetchError) throw fetchError;
  if (!prevAssignments || prevAssignments.length === 0) {
    throw new Error("前日の配置データがありません");
  }

  const inserts = prevAssignments.map((a) => ({
    tenant_id: tenantId,
    employee_id: a.employee_id,
    job_site_id: a.job_site_id,
    assignment_date: targetDate,
    is_driver: a.is_driver,
    car_number: a.car_number,
    start_time: a.start_time,
    note: a.note,
  }));

  const { error } = await supabase
    .from("site_assignments")
    .upsert(inserts, { onConflict: "tenant_id,employee_id,job_site_id,assignment_date" });

  if (error) throw error;
  revalidatePath("/board");
  return inserts.length;
}

// ============================================================
// 現場日別ラベル（現場名のその日の入力）
// ============================================================
export async function getSiteDailyLabels(startDate: string, endDate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_daily_labels")
    .select("job_site_id, label_date, site_name, car_number, departure_time")
    .gte("label_date", startDate)
    .lte("label_date", endDate);
  if (error) throw error;
  return data || [];
}

export async function upsertSiteDailyLabel(
  job_site_id: string,
  label_date: string,
  fields: {
    site_name?: string;
    car_number?: string | null;
    departure_time?: string | null;
  }
) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  // 既存レコードを取得
  const { data: existing } = await supabase
    .from("site_daily_labels")
    .select("site_name, car_number, departure_time")
    .eq("job_site_id", job_site_id)
    .eq("label_date", label_date)
    .maybeSingle();

  const newSiteName = fields.site_name !== undefined ? fields.site_name : (existing?.site_name ?? "");
  const newCarNumber = fields.car_number !== undefined ? fields.car_number : (existing?.car_number ?? null);
  const newDepartureTime = fields.departure_time !== undefined ? fields.departure_time : (existing?.departure_time ?? null);

  // すべて空なら削除
  if (!newSiteName?.trim() && !newCarNumber && !newDepartureTime) {
    await supabase
      .from("site_daily_labels")
      .delete()
      .eq("job_site_id", job_site_id)
      .eq("label_date", label_date);
  } else {
    const { error } = await supabase.from("site_daily_labels").upsert(
      {
        tenant_id: tenantId,
        job_site_id,
        label_date,
        site_name: newSiteName?.trim() || "",
        car_number: newCarNumber || null,
        departure_time: newDepartureTime || null,
      },
      { onConflict: "tenant_id,job_site_id,label_date" }
    );
    if (error) throw error;
  }
  revalidatePath("/board");
}

export async function bulkCreateAssignments(params: {
  employee_id: string;
  job_site_id: string;
  start_date: string;
  end_date: string;
  is_driver: boolean;
  car_number?: string | null;
  start_time?: string | null;
  skip_weekends: boolean;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const start = new Date(params.start_date + "T00:00:00+09:00");
  const end = new Date(params.end_date + "T00:00:00+09:00");
  const inserts = [];

  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (params.skip_weekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
      current.setDate(current.getDate() + 1);
      continue;
    }
    inserts.push({
      tenant_id: tenantId,
      employee_id: params.employee_id,
      job_site_id: params.job_site_id,
      assignment_date: current.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }),
      is_driver: params.is_driver,
      car_number: params.car_number || null,
      start_time: params.start_time || null,
    });
    current.setDate(current.getDate() + 1);
  }

  if (inserts.length === 0) {
    throw new Error("配置する日がありません");
  }

  const { error } = await supabase
    .from("site_assignments")
    .upsert(inserts, { onConflict: "tenant_id,employee_id,job_site_id,assignment_date" });

  if (error) throw error;
  revalidatePath("/board");
  return inserts.length;
}
