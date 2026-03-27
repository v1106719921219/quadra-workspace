import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

// POST: Pop Reportからスクレイピングしたデータを一括保存
export async function POST(request: NextRequest) {
  const authResult = await authenticateApiKey(request);
  if (authResult instanceof NextResponse) return authResult;

  const { supabase, userId } = authResult;
  const body = await request.json();

  const specs: Array<{
    set_name: string;
    card_number?: string;
    description: string;
    year?: string;
  }> = body.specs;

  if (!Array.isArray(specs) || specs.length === 0) {
    return NextResponse.json({ error: "specs array required" }, { status: 400 });
  }

  const rows = specs.map((s) => ({
    user_id: userId,
    set_name: s.set_name,
    card_number: s.card_number || null,
    description: s.description,
    year: s.year || null,
  }));

  const { data, error } = await supabase
    .from("psa_card_specs")
    .upsert(rows, { onConflict: "user_id,description", ignoreDuplicates: true })
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: data?.length || 0 });
}

// GET: 保存済みスペックを検索
export async function GET(request: NextRequest) {
  const authResult = await authenticateApiKey(request);
  if (authResult instanceof NextResponse) return authResult;

  const { supabase, userId } = authResult;
  const url = new URL(request.url);
  const setName = url.searchParams.get("set_name");
  const term = url.searchParams.get("term");

  let query = supabase
    .from("psa_card_specs")
    .select("id, set_name, card_number, description, year")
    .eq("user_id", userId)
    .order("set_name")
    .order("description");

  if (setName) {
    query = query.eq("set_name", setName);
  }
  if (term) {
    query = query.ilike("description", `%${term}%`);
  }

  const { data, error } = await query.limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ specs: data });
}
