"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { extractCardNumber, generateGradingName, extractSuffix, extractMega, findPokemonName } from "@/lib/grading-name";
import { fetchCardFromTcgdex, fetchSets, fetchSetCards } from "@/lib/tcgdex";
import { parseCardMasterCsv } from "@/lib/parse-card-master";

export async function searchCards(params: {
  query?: string;
  tcgGameId?: string;
  setCode?: string;
  page?: number;
  perPage?: number;
}) {
  await getUser();
  const supabase = await createClient();

  const page = params.page ?? 1;
  const perPage = params.perPage ?? 50;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from("cards")
    .select("*", { count: "exact" })
    .order("set_code")
    .order("card_number")
    .range(from, to);

  if (params.tcgGameId) {
    query = query.eq("tcg_game_id", params.tcgGameId);
  }
  if (params.setCode) {
    query = query.eq("set_code", params.setCode);
  }
  if (params.query) {
    query = query.or(
      `name_ja.ilike.%${params.query}%,name_en.ilike.%${params.query}%,grading_name.ilike.%${params.query}%,card_number.ilike.%${params.query}%`
    );
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return { cards: data ?? [], total: count ?? 0, page, perPage };
}

/**
 * カード検索（番号 or カード名で検索、提出リスト追加用）
 */
export async function quickSearchCards(query: string) {
  await getUser();
  const supabase = await createClient();

  if (!query || query.length < 1) return [];

  const padded = query.replace(/^0+/, "").padStart(3, "0");

  // 番号完全一致 or 名前部分一致で検索
  const { data, error } = await supabase
    .from("cards")
    .select("id, set_code, card_number, name_ja, name_en, rarity")
    .or(
      `card_number.eq.${padded},card_number.eq.${query},name_ja.ilike.%${query}%`
    )
    .order("set_code")
    .limit(30);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function importCards(
  tcgGameId: string,
  rows: {
    setCode: string;
    cardNumber: string;
    nameJa?: string;
    nameEn?: string;
    gradingName?: string;
    rarity?: string;
    year?: number;
  }[]
) {
  await getUser();
  const supabase = await createClient();

  const records = rows.map((row) => ({
    tcg_game_id: tcgGameId,
    set_code: row.setCode,
    card_number: row.cardNumber,
    name_ja: row.nameJa || null,
    name_en: row.nameEn || null,
    grading_name: row.gradingName || null,
    rarity: row.rarity || null,
    year: row.year || null,
  }));

  const { data, error } = await supabase
    .from("cards")
    .upsert(records, {
      onConflict: "tcg_game_id,set_code,card_number",
    })
    .select();

  if (error) throw new Error(error.message);

  revalidatePath("/cards");
  return { imported: data?.length ?? 0 };
}

export async function getPokemonNames() {
  await getUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pokemon_names")
    .select("name_ja, name_en")
    .order("name_ja");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getTcgGames() {
  await getUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tcg_games")
    .select("*")
    .order("sort_order");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getGradingCompanies() {
  await getUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grading_companies")
    .select("*")
    .order("id");

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * 型番からカード情報を検索する
 * 1. ローカルDB → 2. TCGdex API の順でフォールバック
 */
export async function lookupCardBySetNumber(setNumber: string): Promise<{
  nameJa: string;
  nameEn: string;
  gradingName?: string;
  rarity?: string;
  source: "db" | "tcgdex" | "not_found";
} | null> {
  await getUser();
  const supabase = await createClient();

  // 型番を分解: "SV6a-001/053" → setCode="SV6a", cardNumber="001"
  const setCode = setNumber.includes("-")
    ? setNumber.split("-")[0]
    : setNumber.split(/\s+/)[0] || setNumber;
  const cardNumber = extractCardNumber(setNumber);

  // 1. ローカルDB検索（完全一致）
  const { data: dbCard } = await supabase
    .from("cards")
    .select("name_ja, name_en, rarity, grading_name")
    .eq("set_code", setCode)
    .eq("card_number", cardNumber)
    .maybeSingle();

  if (dbCard?.name_ja) {
    return {
      nameJa: dbCard.name_ja,
      nameEn: dbCard.name_en ?? "",
      gradingName: dbCard.grading_name ?? undefined,
      rarity: dbCard.rarity ?? undefined,
      source: "db",
    };
  }

  // ゼロパディングなしでも検索
  const rawNumber = cardNumber.replace(/^0+/, "") || "0";
  if (rawNumber !== cardNumber) {
    const { data: dbCard2 } = await supabase
      .from("cards")
      .select("name_ja, name_en, rarity, grading_name")
      .eq("set_code", setCode)
      .eq("card_number", rawNumber)
      .maybeSingle();

    if (dbCard2?.name_ja) {
      return {
        nameJa: dbCard2.name_ja,
        nameEn: dbCard2.name_en ?? "",
        gradingName: dbCard2.grading_name ?? undefined,
        rarity: dbCard2.rarity ?? undefined,
        source: "db",
      };
    }
  }

  // 2. TCGdex APIフォールバック
  const tcgdexResult = await fetchCardFromTcgdex(setNumber);
  if (tcgdexResult?.nameJa || tcgdexResult?.nameEn) {
    return {
      nameJa: tcgdexResult.nameJa,
      nameEn: tcgdexResult.nameEn,
      rarity: tcgdexResult.rarity,
      source: "tcgdex",
    };
  }

  return { nameJa: "", nameEn: "", source: "not_found" };
}

/**
 * 複数の型番を一括で検索
 */
export async function lookupCardsBySetNumbers(
  setNumbers: string[]
): Promise<
  Map<string, { nameJa: string; nameEn: string; source: "db" | "tcgdex" | "not_found" }>
> {
  const results = new Map<
    string,
    { nameJa: string; nameEn: string; source: "db" | "tcgdex" | "not_found" }
  >();

  // 並列でlookup（最大10件ずつ）
  const chunks: string[][] = [];
  for (let i = 0; i < setNumbers.length; i += 10) {
    chunks.push(setNumbers.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (sn) => {
      const result = await lookupCardBySetNumber(sn);
      results.set(sn, result ?? { nameJa: "", nameEn: "", source: "not_found" });
    });
    await Promise.all(promises);
  }

  return results;
}

/**
 * 全カードデータを削除
 */
export async function deleteAllCards(): Promise<{ deleted: number }> {
  await getUser();
  const supabase = await createClient();

  // submission_itemsの参照を先に削除
  const { error: e1 } = await supabase.from("submission_items").delete().gte("created_at", "1970-01-01");
  if (e1) throw new Error(`submission_items削除エラー: ${e1.message}`);

  const { error: e2 } = await supabase.from("submissions").delete().gte("created_at", "1970-01-01");
  if (e2) throw new Error(`submissions削除エラー: ${e2.message}`);

  const { error: e3 } = await supabase
    .from("cards")
    .delete()
    .gte("created_at", "1970-01-01");

  if (e3) throw new Error(`cards削除エラー: ${e3.message}`);

  // card_setsも削除
  await supabase.from("card_sets").delete().gte("created_at", "1970-01-01");

  revalidatePath("/cards");
  revalidatePath("/submissions");
  return { deleted: 0 };
}

export async function deleteCard(cardId: string) {
  await getUser();
  const supabase = await createClient();

  const { error } = await supabase.from("cards").delete().eq("id", cardId);
  if (error) throw new Error(error.message);

  revalidatePath("/cards");
}

/**
 * TCGdex APIからセット一覧を取得
 */
export async function getTcgdexSets() {
  await getUser();

  const [jaSets, enSets] = await Promise.all([
    fetchSets("ja"),
    fetchSets("en"),
  ]);

  // 英語セットをIDでマッピング
  const enSetMap = new Map(enSets.map((s) => [s.id.toLowerCase(), s]));

  // 日本語セットをベースに、英語名を補完
  const merged = jaSets.map((ja) => {
    const en = enSetMap.get(ja.id.toLowerCase());
    return {
      id: ja.id,
      nameJa: ja.name,
      nameEn: en?.name ?? "",
      totalCards: ja.cardCount?.total ?? en?.cardCount?.total ?? 0,
    };
  });

  // 英語にしかないセットも追加
  for (const en of enSets) {
    if (!merged.find((m) => m.id.toLowerCase() === en.id.toLowerCase())) {
      merged.push({
        id: en.id,
        nameJa: "",
        nameEn: en.name,
        totalCards: en.cardCount?.total ?? 0,
      });
    }
  }

  return merged;
}

/**
 * TCGdexからセットのカードを一括取得してDBに保存
 */
export async function syncSetFromTcgdex(setId: string): Promise<{
  imported: number;
  setName: string;
}> {
  await getUser();
  const supabase = await createClient();

  const setData = await fetchSetCards(setId);

  if (setData.cards.length === 0) {
    return { imported: 0, setName: setData.setNameJa || setData.setNameEn || setId };
  }

  // 発売日から年を抽出
  const yearMatch = setData.releaseDate.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1]) : null;

  // card_setsにセット情報を保存
  await supabase
    .from("card_sets")
    .upsert({
      tcg_game_id: "pokemon",
      code: setId,
      name_ja: setData.setNameJa || null,
      name_en: setData.setNameEn || null,
      release_year: year,
      total_cards: setData.cards.length,
    }, { onConflict: "tcg_game_id,code" });

  // カードをDBに保存
  const records = setData.cards.map((card) => ({
    tcg_game_id: "pokemon",
    set_code: setId,
    card_number: card.localId.padStart(3, "0"),
    name_ja: card.nameJa || null,
    name_en: card.nameEn || null,
    rarity: card.rarity || null,
    year,
    image_url: card.image || null,
    tcgdex_id: `${setId}-${card.localId}`,
  }));

  const { data, error } = await supabase
    .from("cards")
    .upsert(records, { onConflict: "tcg_game_id,set_code,card_number" })
    .select();

  if (error) throw new Error(error.message);

  revalidatePath("/cards");
  return {
    imported: data?.length ?? 0,
    setName: setData.setNameJa || setData.setNameEn || setId,
  };
}

/**
 * カードマスタCSVをインポート
 * フォーマット: "カード名 レアリティ [セットコード 番号/総数](パック名)"
 */
export async function importCardMasterCsv(csvText: string): Promise<{
  imported: number;
  total: number;
}> {
  await getUser();
  const supabase = await createClient();

  const parsed = parseCardMasterCsv(csvText);

  if (parsed.length === 0) {
    return { imported: 0, total: 0 };
  }

  // 100件ずつバッチupsert
  let totalImported = 0;
  const batchSize = 100;

  for (let i = 0; i < parsed.length; i += batchSize) {
    const batch = parsed.slice(i, i + batchSize);

    const records = batch.map((row) => ({
      tcg_game_id: "pokemon",
      set_code: row.setCode,
      card_number: row.cardNumber.padStart(3, "0"),
      name_ja: row.cardName || null,
      rarity: row.rarity || null,
    }));

    const { data, error } = await supabase
      .from("cards")
      .upsert(records, { onConflict: "tcg_game_id,set_code,card_number" })
      .select();

    if (error) throw new Error(error.message);
    totalImported += data?.length ?? 0;
  }

  revalidatePath("/cards");
  return { imported: totalImported, total: parsed.length };
}

/**
 * パース済みカードマスタデータを一括インポート（チャンク受信用）
 * カード名 → 英語名（grading_name）も自動生成してDBに保存
 */
export async function importCardMasterBatch(
  rows: {
    setCode: string;
    cardNumber: string;
    cardName: string;
    rarity: string;
  }[]
): Promise<{ imported: number }> {
  await getUser();
  const supabase = await createClient();

  if (rows.length === 0) {
    return { imported: 0 };
  }

  // ポケモン名辞書を取得（英語名生成に必要）
  const { data: pokemonNames } = await supabase
    .from("pokemon_names")
    .select("name_ja, name_en")
    .order("name_ja");

  const nameDict = pokemonNames ?? [];

  let totalImported = 0;
  const batchSize = 100;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const records = batch.map((row) => {
      // ポケモン英語名を検索して name_en に保存
      let nameEn: string | null = null;
      let suffix = "";
      if (row.cardName) {
        const extracted = extractSuffix(row.cardName);
        suffix = extracted.suffix;
        const { name: strippedName, megaPrefix } = extractMega(extracted.baseName);
        const matched = findPokemonName(strippedName, nameDict);

        if (matched) {
          nameEn = megaPrefix
            ? `${megaPrefix} ${matched.name_en}`
            : matched.name_en;
          if (suffix) nameEn += ` ${suffix}`;
        }
      }

      return {
        tcg_game_id: "pokemon",
        set_code: row.setCode,
        card_number: row.cardNumber.padStart(3, "0"),
        name_ja: row.cardName || null,
        name_en: nameEn,
        rarity: row.rarity || null,
        grading_name: null,
      };
    });

    const { data, error } = await supabase
      .from("cards")
      .upsert(records, { onConflict: "tcg_game_id,set_code,card_number" })
      .select();

    if (error) throw new Error(error.message);
    totalImported += data?.length ?? 0;
  }

  return { imported: totalImported };
}
