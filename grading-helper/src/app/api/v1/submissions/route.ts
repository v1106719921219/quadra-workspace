import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const authResult = await authenticateApiKey(request);
  if (authResult instanceof NextResponse) return authResult;

  const { supabase, userId } = authResult;

  const { data, error } = await supabase
    .from("submissions")
    .select(`
      id,
      title,
      status,
      grading_company_id,
      created_at,
      submission_items (count)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const submissions = (data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    grading_company_id: s.grading_company_id,
    created_at: s.created_at,
    item_count: (s.submission_items as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));

  return NextResponse.json({ submissions });
}
