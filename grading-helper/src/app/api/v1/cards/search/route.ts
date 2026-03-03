import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

  // TODO: Phase 4でAPIキー認証に切り替え
  const supabase = await createClient();

  let query = supabase
    .from("cards")
    .select("id, tcg_game_id, set_code, card_number, name_ja, name_en, grading_name, year")
    .limit(limit);

  if (q) {
    query = query.or(
      `name_ja.ilike.%${q}%,name_en.ilike.%${q}%,grading_name.ilike.%${q}%,card_number.ilike.%${q}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ cards: data });
}
