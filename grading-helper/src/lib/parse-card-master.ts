/**
 * カードマスタCSVのパーサー
 *
 * フォーマット:
 * "カード名 レアリティ [セットコード 番号/総数](パック名)"
 *
 * 例:
 * "メガリザードンXex MA [M2a 223/193](ハイクラスパック「MEGAドリームex」)"
 * "ピカチュウ AR[SV2a 173/165](強化拡張パック「ポケモンカード151」)"
 * "ピカチュウ:プロモ [S-P 208](「YU NAGABA×ポケモンカードゲーム」)"
 * "ピカチュウ: プロモ [001/SV-P](プロモーションカード「SV-P」)"
 */

export interface CardMasterRow {
  cardName: string;     // カード名（サフィックス含む）
  baseName: string;     // ポケモン名部分
  rarity: string;       // レアリティ
  setCode: string;      // セットコード
  cardNumber: string;   // カード番号
  totalCards: string;    // セット総数
  packName: string;     // パック名
}

// レアリティ一覧（長い順にマッチ）
const RARITIES = [
  "VSTAR", "VMAX", "V-UNION",
  "SAR", "SR", "AR", "MA", "CHR", "CSR", "HR", "UR",
  "SSR", "TR", "RRR", "RR", "ACE",
  "P", "R", "C", "U", "N",
  "K", "A", "S",
];

export function parseCardMasterLine(line: string): CardMasterRow | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "カード名") return null;

  // パターン1: カード名 レアリティ [セットコード 番号/総数](パック名)
  // パターン2: カード名 レアリティ[セットコード 番号/総数](パック名)  ※スペースなし
  // パターン3: カード名 [番号/セットコード](パック名)  ※レアリティなし・番号が先

  let cardNamePart = "";
  let rarity = "";
  let setCode = "";
  let cardNumber = "";
  let totalCards = "";
  let packName = "";

  // [] の中身を抽出
  const bracketMatch = trimmed.match(/\[([^\]]+)\]/);
  if (!bracketMatch) return null;

  const bracketContent = bracketMatch[1].trim();

  // () の中身を抽出
  const parenMatch = trimmed.match(/\]\s*\((.+)\)\s*$/);
  packName = parenMatch ? parenMatch[1].trim() : "";

  // [] の前の部分 = カード名 + レアリティ
  const beforeBracket = trimmed.substring(0, trimmed.indexOf("[")).trim();

  // bracketContent: "M2a 223/193" or "SV-P 242" or "001/SV-P"
  // パターン: "セットコード 番号/総数" or "番号/セットコード"
  const bracketParts = bracketContent.split(/\s+/);

  if (bracketParts.length >= 2) {
    // "M2a 223/193" or "SV-P 242"
    setCode = bracketParts[0];
    const numPart = bracketParts.slice(1).join(" ");
    if (numPart.includes("/")) {
      const [num, total] = numPart.split("/");
      cardNumber = num;
      totalCards = total;
    } else {
      cardNumber = numPart;
    }
  } else if (bracketContent.includes("/")) {
    // "001/SV-P" パターン
    const [num, code] = bracketContent.split("/");
    if (/^\d+$/.test(num)) {
      cardNumber = num;
      setCode = code;
    } else {
      setCode = num;
      cardNumber = code;
    }
  } else {
    setCode = bracketContent;
  }

  // beforeBracket からレアリティを分離
  // "メガリザードンXex MA" → name="メガリザードンXex", rarity="MA"
  // "ピカチュウ AR" → name="ピカチュウ", rarity="AR"
  // "ゲンガー CHR" → name="ゲンガー", rarity="CHR"
  // "ピカチュウ:プロモ" → name="ピカチュウ", rarity="プロモ"（コロンの後がレアリティ）

  // コロン区切りのプロモパターン
  if (beforeBracket.includes(":")) {
    const colonIdx = beforeBracket.lastIndexOf(":");
    cardNamePart = beforeBracket.substring(0, colonIdx).trim();
    const afterColon = beforeBracket.substring(colonIdx + 1).trim();
    // コロン後がレアリティ的なもの
    if (afterColon === "プロモ" || afterColon === "SA/プロモ") {
      rarity = "P";
    } else {
      rarity = afterColon;
    }
  } else {
    // 末尾からレアリティを検出
    let foundRarity = false;
    for (const r of RARITIES) {
      // スペース+レアリティで終わるか
      if (beforeBracket.endsWith(" " + r)) {
        cardNamePart = beforeBracket.slice(0, -(r.length + 1)).trim();
        rarity = r;
        foundRarity = true;
        break;
      }
      // スペースなしでレアリティで終わるか（日本語文字の直後）
      const pattern = new RegExp(`([\\u3000-\\u9FFF\\uFF00-\\uFFEF])${r}$`);
      const match = beforeBracket.match(pattern);
      if (match) {
        cardNamePart = beforeBracket.slice(0, -r.length).trim();
        rarity = r;
        foundRarity = true;
        break;
      }
    }
    if (!foundRarity) {
      cardNamePart = beforeBracket;
    }
  }

  // SA/プロモ パターン
  if (cardNamePart.includes(": SA/プロモ")) {
    cardNamePart = cardNamePart.replace(": SA/プロモ", "").trim();
    rarity = "P";
  }

  if (!cardNamePart && !setCode) return null;

  return {
    cardName: cardNamePart || beforeBracket,
    baseName: cardNamePart || beforeBracket,
    rarity,
    setCode,
    cardNumber,
    totalCards,
    packName,
  };
}

/**
 * カードマスタCSV全体をパース
 */
export function parseCardMasterCsv(csvText: string): CardMasterRow[] {
  const lines = csvText.split("\n");
  const results: CardMasterRow[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const parsed = parseCardMasterLine(line);
    if (!parsed) continue;

    // 重複除外（セットコード+番号）
    const key = `${parsed.setCode}-${parsed.cardNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push(parsed);
  }

  return results;
}
