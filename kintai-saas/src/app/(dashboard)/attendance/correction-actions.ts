"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export type CorrectionType = "clock_out" | "clock_in" | "both";

export interface CorrectionWithDetails {
  id: string;
  employee_id: string;
  employee_name: string;
  time_record_id: string | null;
  work_date: string;
  correction_type: CorrectionType;
  corrected_clock_in: string | null;
  corrected_clock_out: string | null;
  work_type_name: string | null;
  break_minutes: number;
  reason: string;
  status: string;
  created_at: string;
  // 既存レコードの情報
  original_clock_in: string | null;
  original_clock_out: string | null;
}

export async function createAttendanceCorrectionAction(params: {
  employeeId: string;
  workDate: string;
  correctedClockIn?: string;
  correctedClockOut?: string;
  workTypeId?: string;
  breakMinutes?: number;
  reason: string;
}) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  // 既存のtime_recordを探す
  const { data: existingRecord } = await supabase
    .from("time_records")
    .select("id")
    .eq("employee_id", params.employeeId)
    .eq("work_date", params.workDate)
    .maybeSingle();

  // correction_typeを自動判定
  let correctionType: CorrectionType;
  if (params.correctedClockIn && params.correctedClockOut) {
    correctionType = "both";
  } else if (params.correctedClockIn) {
    correctionType = "clock_in";
  } else {
    correctionType = "clock_out";
  }

  const { error } = await supabase.from("attendance_corrections").insert({
    tenant_id: tenantId,
    employee_id: params.employeeId,
    time_record_id: existingRecord?.id || null,
    work_date: params.workDate,
    correction_type: correctionType,
    corrected_clock_in: params.correctedClockIn || null,
    corrected_clock_out: params.correctedClockOut || null,
    work_type_id: params.workTypeId || null,
    break_minutes: params.breakMinutes ?? 0,
    reason: params.reason,
  });

  if (error) throw new Error("修正申告の送信に失敗しました");
  revalidatePath("/attendance");
}

export async function getPendingCorrections(): Promise<CorrectionWithDetails[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("attendance_corrections")
    .select(`
      id,
      employee_id,
      employees(name),
      time_record_id,
      work_date,
      correction_type,
      corrected_clock_in,
      corrected_clock_out,
      work_type_id,
      work_types(name),
      break_minutes,
      reason,
      status,
      created_at
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data) return [];

  // 既存レコードの情報を取得
  const recordIds = data
    .map((c: Record<string, unknown>) => c.time_record_id as string | null)
    .filter((id): id is string => id !== null);

  let recordMap = new Map<string, { clock_in: string; clock_out: string | null }>();
  if (recordIds.length > 0) {
    const { data: records } = await supabase
      .from("time_records")
      .select("id, clock_in, clock_out")
      .in("id", recordIds);

    records?.forEach((r: { id: string; clock_in: string; clock_out: string | null }) => {
      recordMap.set(r.id, { clock_in: r.clock_in, clock_out: r.clock_out });
    });
  }

  return data.map((c: Record<string, unknown>) => {
    const emp = c.employees as { name: string } | null;
    const wt = c.work_types as { name: string } | null;
    const original = c.time_record_id ? recordMap.get(c.time_record_id as string) : null;

    return {
      id: c.id as string,
      employee_id: c.employee_id as string,
      employee_name: emp?.name || "",
      time_record_id: c.time_record_id as string | null,
      work_date: c.work_date as string,
      correction_type: c.correction_type as CorrectionType,
      corrected_clock_in: c.corrected_clock_in as string | null,
      corrected_clock_out: c.corrected_clock_out as string | null,
      work_type_name: wt?.name || null,
      break_minutes: c.break_minutes as number,
      reason: c.reason as string,
      status: c.status as string,
      created_at: c.created_at as string,
      original_clock_in: original?.clock_in || null,
      original_clock_out: original?.clock_out || null,
    };
  });
}

export async function approveCorrection(correctionId: string) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  // 修正申告を取得
  const { data: correction, error: fetchError } = await supabase
    .from("attendance_corrections")
    .select("*")
    .eq("id", correctionId)
    .single();

  if (fetchError || !correction) throw new Error("修正申告が見つかりません");
  if (correction.status !== "pending") throw new Error("この申告は既に処理済みです");

  const { data: { user } } = await supabase.auth.getUser();

  if (correction.time_record_id) {
    // 既存レコードの更新
    const updateData: Record<string, unknown> = {};
    if (correction.corrected_clock_in) {
      updateData.clock_in = correction.corrected_clock_in;
    }
    if (correction.corrected_clock_out) {
      updateData.clock_out = correction.corrected_clock_out;
    }
    if (correction.break_minutes !== undefined) {
      updateData.break_minutes = correction.break_minutes;
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from("time_records")
        .update(updateData)
        .eq("id", correction.time_record_id);

      if (updateError) throw new Error("勤怠記録の更新に失敗しました");
    }
  } else {
    // 新規レコードの作成（出勤忘れのケース）
    if (!correction.corrected_clock_in) {
      throw new Error("出勤時刻が指定されていません");
    }
    if (!correction.work_type_id) {
      throw new Error("業務タイプが指定されていません");
    }

    const { error: insertError } = await supabase.from("time_records").insert({
      tenant_id: tenantId,
      employee_id: correction.employee_id,
      work_type_id: correction.work_type_id,
      work_date: correction.work_date,
      clock_in: correction.corrected_clock_in,
      clock_out: correction.corrected_clock_out || null,
      break_minutes: correction.break_minutes || 0,
    });

    if (insertError) throw new Error("勤怠記録の作成に失敗しました");
  }

  // 承認ステータスに更新
  const { error: approveError } = await supabase
    .from("attendance_corrections")
    .update({
      status: "approved",
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", correctionId);

  if (approveError) throw new Error("承認処理に失敗しました");
  revalidatePath("/attendance");
}

export async function rejectCorrection(correctionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("attendance_corrections")
    .update({
      status: "rejected",
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", correctionId);

  if (error) throw new Error("却下処理に失敗しました");
  revalidatePath("/attendance");
}
