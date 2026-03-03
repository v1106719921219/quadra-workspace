"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getSubmissions() {
  const user = await getUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select(`
      *,
      grading_companies (name),
      submission_items (count)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSubmission(id: string) {
  const user = await getUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select(`
      *,
      grading_companies (*)
    `)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getSubmissionItems(submissionId: string) {
  await getUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("submission_items")
    .select("*")
    .eq("submission_id", submissionId)
    .order("sort_order");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createSubmission(input: {
  gradingCompanyId: string;
  title: string;
  notes?: string;
}) {
  const user = await getUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("submissions")
    .insert({
      user_id: user.id,
      grading_company_id: input.gradingCompanyId,
      title: input.title,
      notes: input.notes || null,
      status: "draft",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/submissions");
  return data;
}

export async function updateSubmissionStatus(
  id: string,
  status: "draft" | "submitted" | "returned"
) {
  await getUser();
  const supabase = await createClient();

  const updates: Record<string, unknown> = { status };
  if (status === "submitted") updates.submitted_at = new Date().toISOString();
  if (status === "returned") updates.returned_at = new Date().toISOString();

  const { error } = await supabase
    .from("submissions")
    .update(updates)
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/submissions");
  revalidatePath(`/submissions/${id}`);
}

export async function addSubmissionItem(input: {
  submissionId: string;
  setCode: string;
  cardNumber: string;
  nameJa?: string;
  gradingName: string;
  cardId?: string;
  declaredValue?: number;
  notes?: string;
  rarity?: string;
}) {
  await getUser();
  const supabase = await createClient();

  // 現在の最大sort_orderを取得
  const { data: existing } = await supabase
    .from("submission_items")
    .select("sort_order")
    .eq("submission_id", input.submissionId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await supabase
    .from("submission_items")
    .insert({
      submission_id: input.submissionId,
      card_id: input.cardId || null,
      sort_order: nextOrder,
      set_code: input.setCode,
      card_number: input.cardNumber,
      name_ja: input.nameJa || null,
      grading_name: input.gradingName,
      declared_value: input.declaredValue || null,
      notes: input.notes || null,
      rarity: input.rarity || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(`/submissions/${input.submissionId}`);
  return data;
}

export async function updateSubmissionItem(
  itemId: string,
  fields: {
    rarity?: string | null;
    purchase_cost?: number | null;
    sold_price?: number | null;
    sold?: boolean;
    grading_fee?: number | null;
    other_fees?: number | null;
    grading_result?: string | null;
    cert_number?: string | null;
    plan?: string | null;
    completed_at?: string | null;
    notes?: string | null;
    declared_value?: number | null;
    grading_name?: string;
    name_ja?: string | null;
  }
) {
  await getUser();
  const supabase = await createClient();

  // itemのsubmission_idを取得（revalidate用）
  const { data: item } = await supabase
    .from("submission_items")
    .select("submission_id")
    .eq("id", itemId)
    .single();

  if (!item) throw new Error("アイテムが見つかりません");

  const { error } = await supabase
    .from("submission_items")
    .update(fields)
    .eq("id", itemId);

  if (error) throw new Error(error.message);

  revalidatePath(`/submissions/${item.submission_id}`);
}

export async function removeSubmissionItem(itemId: string, submissionId: string) {
  await getUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("submission_items")
    .delete()
    .eq("id", itemId);

  if (error) throw new Error(error.message);

  revalidatePath(`/submissions/${submissionId}`);
}

export async function deleteSubmission(id: string) {
  await getUser();
  const supabase = await createClient();

  const { error } = await supabase.from("submissions").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/submissions");
}
