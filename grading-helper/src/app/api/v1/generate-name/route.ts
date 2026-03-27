import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateGradingName } from "@/lib/grading-name";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { setNumber, cardName, year, gradingCompanyId } = body;

    if (!setNumber || !cardName || !year) {
      return NextResponse.json(
        { error: "setNumber, cardName, year は必須です" },
        { status: 400 }
      );
    }

    // TODO: Phase 4でAPIキー認証に切り替え
    const supabase = await createClient();

    // ポケモン名辞書を取得
    const { data: pokemonNames } = await supabase
      .from("pokemon_names")
      .select("name_ja, name_en");

    // テンプレート取得
    let template: string | undefined;
    if (gradingCompanyId) {
      const { data: company } = await supabase
        .from("grading_companies")
        .select("format_template")
        .eq("id", gradingCompanyId)
        .single();
      template = company?.format_template;
    }

    const result = generateGradingName(
      { setNumber, cardName, year, template },
      pokemonNames ?? []
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "不明なエラー" },
      { status: 500 }
    );
  }
}
