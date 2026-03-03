/**
 * グレーディング英語名生成ロジック（GASから移植）
 *
 * 入力: 型番 "SV6a-001/053" + カード名 "リザードンex" + 年 2024
 * 出力: "2024 POKEMON JAPANESE 001 CHARIZARD EX"
 */

// カード名に含まれるサフィックスパターン（長い順でマッチ）
const SUFFIX_PATTERNS: { pattern: RegExp; suffix: string }[] = [
  { pattern: /VSTAR$/i, suffix: "VSTAR" },
  { pattern: /VMAX$/i, suffix: "VMAX" },
  { pattern: /V-UNION$/i, suffix: "V-UNION" },
  { pattern: /VSTAR$/i, suffix: "VSTAR" },
  { pattern: /ex$/i, suffix: "EX" },
  { pattern: /EX$/i, suffix: "EX" },
  { pattern: /GX$/i, suffix: "GX" },
  { pattern: /V$/i, suffix: "V" },
  // 日本語サフィックス
  { pattern: /ブイスターユニオン$/, suffix: "V-UNION" },
  { pattern: /ブイユニオン$/, suffix: "V-UNION" },
  { pattern: /ブイスター$/, suffix: "VSTAR" },
  { pattern: /ブイマックス$/, suffix: "VMAX" },
  { pattern: /ブイ$/, suffix: "V" },
];

// メガ進化判定パターン
const MEGA_PATTERN = /^メガ/;
const MEGA_X_PATTERN = /^メガ(.+)X$/;
const MEGA_Y_PATTERN = /^メガ(.+)Y$/;

// プリズムスター判定
const PRISM_STAR_PATTERN = /◇$/;

// BREAK判定
const BREAK_PATTERN = /BREAK$/;

// δ(デルタ)種判定
const DELTA_PATTERN = /δ$/;

export interface PokemonNameEntry {
  name_ja: string;
  name_en: string;
}

export interface GradingNameInput {
  /** 型番（例: "SV6a-001/053"） */
  setNumber: string;
  /** カード名（例: "リザードンex"） */
  cardName: string;
  /** 年（例: 2024） */
  year: number;
  /** フォーマットテンプレート */
  template?: string;
}

export interface GradingNameResult {
  gradingName: string;
  cardNumber: string;
  pokemonNameEn: string;
  suffix: string;
  isMega: boolean;
  debug: {
    originalName: string;
    strippedName: string;
    matchedPokemon: string | null;
  };
}

/**
 * 型番からカード番号を抽出する
 * "SV6a-001/053" → "001"
 * "001/053" → "001"
 * "SV6a 001" → "001"
 */
export function extractCardNumber(setNumber: string): string {
  // ハイフンの後の数字を取得（SV6a-001/053 → 001/053）
  const afterHyphen = setNumber.includes("-")
    ? setNumber.split("-").pop()!
    : setNumber;

  // スペースの後の数字を取得
  const afterSpace = afterHyphen.includes(" ")
    ? afterHyphen.split(" ").pop()!
    : afterHyphen;

  // スラッシュの前の数字を取得（001/053 → 001）
  const beforeSlash = afterSpace.includes("/")
    ? afterSpace.split("/")[0]
    : afterSpace;

  // 数字のみ抽出して3桁ゼロパディング
  const numMatch = beforeSlash.match(/(\d+)/);
  if (!numMatch) return beforeSlash;

  const num = numMatch[1];
  // 元の形式を維持（001なら001、1なら001）
  return num.padStart(3, "0");
}

/**
 * カード名からサフィックスを検出・除去する
 */
export function extractSuffix(cardName: string): {
  baseName: string;
  suffix: string;
} {
  let baseName = cardName.trim();
  let suffix = "";

  // プリズムスター
  if (PRISM_STAR_PATTERN.test(baseName)) {
    baseName = baseName.replace(PRISM_STAR_PATTERN, "").trim();
    suffix = "PRISM STAR";
    return { baseName, suffix };
  }

  // BREAK
  if (BREAK_PATTERN.test(baseName)) {
    baseName = baseName.replace(BREAK_PATTERN, "").trim();
    suffix = "BREAK";
    return { baseName, suffix };
  }

  // δ種
  if (DELTA_PATTERN.test(baseName)) {
    baseName = baseName.replace(DELTA_PATTERN, "").trim();
    suffix = "DELTA SPECIES";
    return { baseName, suffix };
  }

  // 通常サフィックス
  for (const { pattern, suffix: s } of SUFFIX_PATTERNS) {
    if (pattern.test(baseName)) {
      baseName = baseName.replace(pattern, "").trim();
      suffix = s;
      break;
    }
  }

  return { baseName, suffix };
}

/**
 * メガ進化を判定し、ベース名を返す
 */
export function extractMega(baseName: string): {
  name: string;
  megaPrefix: string;
} {
  if (MEGA_X_PATTERN.test(baseName)) {
    const match = baseName.match(MEGA_X_PATTERN);
    return { name: match![1], megaPrefix: "MEGA" };
  }
  if (MEGA_Y_PATTERN.test(baseName)) {
    const match = baseName.match(MEGA_Y_PATTERN);
    return { name: match![1], megaPrefix: "MEGA" };
  }
  if (MEGA_PATTERN.test(baseName)) {
    return { name: baseName.replace(MEGA_PATTERN, ""), megaPrefix: "MEGA" };
  }
  return { name: baseName, megaPrefix: "" };
}

/**
 * ポケモン名辞書からカード名にマッチするポケモン名を検索する
 * 長い名前から優先的にマッチ（例: "リザードン" > "リザード"）
 */
export function findPokemonName(
  cardName: string,
  pokemonNames: PokemonNameEntry[]
): PokemonNameEntry | null {
  // 名前の長さ降順でソート（長い名前を優先マッチ）
  const sorted = [...pokemonNames].sort(
    (a, b) => b.name_ja.length - a.name_ja.length
  );

  for (const entry of sorted) {
    if (cardName.includes(entry.name_ja)) {
      return entry;
    }
  }

  return null;
}

/**
 * グレーディング用英語名を生成する
 */
export function generateGradingName(
  input: GradingNameInput,
  pokemonNames: PokemonNameEntry[]
): GradingNameResult {
  const template =
    input.template || "{YEAR} POKEMON JAPANESE {NUMBER} {NAME} {SUFFIX}";

  // 1. カード番号抽出
  const cardNumber = extractCardNumber(input.setNumber);

  // 2. サフィックス抽出
  const { baseName, suffix } = extractSuffix(input.cardName);

  // 3. メガ進化判定
  const { name: strippedName, megaPrefix } = extractMega(baseName);

  // 4. ポケモン名検索
  const matchedPokemon = findPokemonName(strippedName, pokemonNames);

  // 5. 英語名組み立て
  let nameEn = "";
  if (matchedPokemon) {
    nameEn = megaPrefix
      ? `${megaPrefix} ${matchedPokemon.name_en}`
      : matchedPokemon.name_en;
  } else {
    // ポケモン名が見つからない場合はカタカナをそのまま使用
    nameEn = megaPrefix ? `${megaPrefix} ${strippedName}` : strippedName;
  }

  // メガXY判定
  if (MEGA_X_PATTERN.test(baseName)) {
    nameEn += " X";
  } else if (MEGA_Y_PATTERN.test(baseName)) {
    nameEn += " Y";
  }

  // 6. テンプレート適用
  let gradingName = template
    .replace("{YEAR}", String(input.year))
    .replace("{NUMBER}", cardNumber)
    .replace("{NAME}", nameEn)
    .replace("{SUFFIX}", suffix);

  // 末尾の余分なスペースを除去
  gradingName = gradingName.replace(/\s+/g, " ").trim();

  return {
    gradingName,
    cardNumber,
    pokemonNameEn: nameEn,
    suffix,
    isMega: megaPrefix !== "",
    debug: {
      originalName: input.cardName,
      strippedName,
      matchedPokemon: matchedPokemon?.name_ja ?? null,
    },
  };
}

/**
 * 複数のカードを一括で英語名生成
 */
export function generateBatchGradingNames(
  items: GradingNameInput[],
  pokemonNames: PokemonNameEntry[]
): GradingNameResult[] {
  return items.map((item) => generateGradingName(item, pokemonNames));
}
