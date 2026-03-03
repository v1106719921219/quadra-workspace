import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;

  const authResult = await authenticateApiKey(request);
  if (authResult instanceof NextResponse) return authResult;

  const { supabase, userId } = authResult;

  // 提出が認証ユーザーのものか確認
  const { data: submission } = await supabase
    .from("submissions")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", userId)
    .single();

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("submission_items")
    .select("id, sort_order, set_code, card_number, name_ja, grading_name, declared_value, notes")
    .eq("submission_id", params.id)
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data });
}
