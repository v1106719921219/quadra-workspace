import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ itemId: string }> }
) {
  const params = await props.params;

  const authResult = await authenticateApiKey(request);
  if (authResult instanceof NextResponse) return authResult;

  const { supabase, userId } = authResult;
  const body = await request.json();

  // itemが認証ユーザーの提出に属するか確認
  const { data: item } = await supabase
    .from("submission_items")
    .select("id, submission_id, submissions!inner(user_id)")
    .eq("id", params.itemId)
    .single();

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const submissionUserId = (item.submissions as unknown as { user_id: string })?.user_id;
  if (submissionUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 更新可能なフィールドのみ抽出
  const allowedFields = ["grading_name", "notes", "declared_value"];
  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("submission_items")
    .update(updates)
    .eq("id", params.itemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
