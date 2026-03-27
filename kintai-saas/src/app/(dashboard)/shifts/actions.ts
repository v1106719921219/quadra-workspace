"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export async function getWeeklyShifts(startDate: string) {
  const supabase = await createClient();

  // startDate から7日間
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);
  const endStr = endDate.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("shifts")
    .select("*, employees(name), work_types(name)")
    .gte("shift_date", startDate)
    .lt("shift_date", endStr)
    .order("shift_date", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function upsertShift(data: {
  id?: string;
  employee_id: string;
  work_type_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  note?: string;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  if (data.id) {
    // 更新
    const { error } = await supabase
      .from("shifts")
      .update({
        work_type_id: data.work_type_id,
        start_time: data.start_time,
        end_time: data.end_time,
        note: data.note || null,
      })
      .eq("id", data.id);

    if (error) throw error;
  } else {
    // 新規作成（UPSERT: 同一従業員・同日の場合は上書き）
    const { error } = await supabase
      .from("shifts")
      .upsert(
        {
          tenant_id: tenantId,
          employee_id: data.employee_id,
          work_type_id: data.work_type_id,
          shift_date: data.shift_date,
          start_time: data.start_time,
          end_time: data.end_time,
          note: data.note || null,
        },
        { onConflict: "tenant_id,employee_id,shift_date" }
      );

    if (error) throw error;
  }

  revalidatePath("/shifts");
}

export async function deleteShift(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/shifts");
}

export async function copyPreviousWeek(targetStartDate: string) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  // 前週の開始日を計算
  const prevStart = new Date(targetStartDate);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevStartStr = prevStart.toISOString().split("T")[0];

  const prevEnd = new Date(targetStartDate);
  const prevEndStr = prevEnd.toISOString().split("T")[0];

  // 前週のシフトを取得
  const { data: prevShifts, error: fetchError } = await supabase
    .from("shifts")
    .select("employee_id, work_type_id, shift_date, start_time, end_time, note")
    .gte("shift_date", prevStartStr)
    .lt("shift_date", prevEndStr);

  if (fetchError) throw fetchError;
  if (!prevShifts || prevShifts.length === 0) {
    throw new Error("前週のシフトがありません");
  }

  // 曜日のオフセットを計算してコピー
  const newShifts = prevShifts.map((s) => {
    const oldDate = new Date(s.shift_date);
    const dayOffset = Math.floor(
      (oldDate.getTime() - prevStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const newDate = new Date(targetStartDate);
    newDate.setDate(newDate.getDate() + dayOffset);

    return {
      tenant_id: tenantId,
      employee_id: s.employee_id,
      work_type_id: s.work_type_id,
      shift_date: newDate.toISOString().split("T")[0],
      start_time: s.start_time,
      end_time: s.end_time,
      note: s.note,
    };
  });

  // UPSERT で既存シフトがあれば上書き
  const { error: insertError } = await supabase
    .from("shifts")
    .upsert(newShifts, { onConflict: "tenant_id,employee_id,shift_date" });

  if (insertError) throw insertError;
  revalidatePath("/shifts");
}

// ── シフトテンプレート CRUD ──

export async function getShiftTemplates() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shift_templates")
    .select("*, work_types(name)")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createShiftTemplate(data: {
  name: string;
  work_type_id: string;
  start_time: string;
  end_time: string;
  color: string;
  sort_order?: number;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const { error } = await supabase.from("shift_templates").insert({
    tenant_id: tenantId,
    name: data.name,
    work_type_id: data.work_type_id,
    start_time: data.start_time,
    end_time: data.end_time,
    color: data.color,
    sort_order: data.sort_order ?? 0,
  });

  if (error) throw error;
  revalidatePath("/shifts");
}

export async function updateShiftTemplate(
  id: string,
  data: {
    name: string;
    work_type_id: string;
    start_time: string;
    end_time: string;
    color: string;
    sort_order?: number;
  }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("shift_templates")
    .update({
      name: data.name,
      work_type_id: data.work_type_id,
      start_time: data.start_time,
      end_time: data.end_time,
      color: data.color,
      sort_order: data.sort_order ?? 0,
    })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/shifts");
}

export async function deleteShiftTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_templates")
    .delete()
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/shifts");
}

export async function getShiftComparison(date: string) {
  const supabase = await createClient();

  // シフト予定を取得
  const { data: shifts, error: shiftError } = await supabase
    .from("shifts")
    .select("*, employees(name), work_types(name)")
    .eq("shift_date", date);

  if (shiftError) throw shiftError;

  // 実績（打刻記録）を取得
  const { data: records, error: recordError } = await supabase
    .from("time_records")
    .select("*, employees(name), work_types(name)")
    .eq("work_date", date);

  if (recordError) throw recordError;

  return { shifts: shifts || [], records: records || [] };
}
