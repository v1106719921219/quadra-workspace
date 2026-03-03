/**
 * TCGdex API クライアント
 * ポケモンカード情報をAPIから取得する
 */

const TCGDEX_BASE = "https://api.tcgdex.net/v2";

interface TcgdexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  rarity?: string;
  category?: string;
}

interface TcgdexCardDetail extends TcgdexCard {
  set?: {
    id: string;
    name: string;
  };
  dexId?: number[];
  hp?: number;
  types?: string[];
  stage?: string;
}

interface TcgdexSet {
  id: string;
  name: string;
  releaseDate?: string;
  cardCount?: {
    total: number;
    official: number;
  };
  cards?: TcgdexCard[];
}

interface TcgdexSetSummary {
  id: string;
  name: string;
  cardCount?: {
    total: number;
    official: number;
  };
}

/**
 * 型番からTCGdex用のセットIDとカード番号を解析する
 */
export function parseSetNumber(setNumber: string): {
  setId: string;
  cardNumber: string;
} {
  const trimmed = setNumber.trim();

  if (trimmed.includes("-")) {
    const parts = trimmed.split("-");
    const setId = parts[0];
    const numPart = parts.slice(1).join("-");
    const cardNumber = numPart.includes("/")
      ? numPart.split("/")[0]
      : numPart;
    return { setId, cardNumber: cardNumber.replace(/^0+/, "") || "0" };
  }

  if (trimmed.includes(" ")) {
    const parts = trimmed.split(/\s+/);
    return {
      setId: parts[0],
      cardNumber: (parts[1] || "").replace(/^0+/, "") || "0",
    };
  }

  return { setId: trimmed, cardNumber: "" };
}

/**
 * TCGdex APIからカード情報を取得する（日本語→英語の順でフォールバック）
 */
export async function fetchCardFromTcgdex(
  setNumber: string
): Promise<{ nameJa: string; nameEn: string; rarity?: string } | null> {
  const { setId, cardNumber } = parseSetNumber(setNumber);
  if (!setId || !cardNumber) return null;

  const cardId = `${setId}-${cardNumber}`;

  const jaCard = await fetchCard("ja", cardId);
  const enCardId = `${setId.toLowerCase()}-${cardNumber}`;
  const enCard = await fetchCard("en", enCardId);

  if (jaCard || enCard) {
    return {
      nameJa: jaCard?.name ?? "",
      nameEn: enCard?.name ?? "",
      rarity: jaCard?.rarity ?? enCard?.rarity,
    };
  }

  return null;
}

async function fetchCard(
  lang: "ja" | "en",
  cardId: string
): Promise<TcgdexCardDetail | null> {
  try {
    const res = await fetch(`${TCGDEX_BASE}/${lang}/cards/${cardId}`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * セット一覧を取得する
 */
export async function fetchSets(lang: "ja" | "en"): Promise<TcgdexSetSummary[]> {
  try {
    const res = await fetch(`${TCGDEX_BASE}/${lang}/sets`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * セット詳細（カード一覧付き）を取得する
 */
export async function fetchSetDetail(
  lang: "ja" | "en",
  setId: string
): Promise<TcgdexSet | null> {
  try {
    const res = await fetch(`${TCGDEX_BASE}/${lang}/sets/${setId}`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = await res.json();

    // /sets/{id} の cards が空の場合、/cards?set={id} エンドポイントで補完
    if (!data.cards || data.cards.length === 0) {
      const cardsRes = await fetch(`${TCGDEX_BASE}/${lang}/cards?set=${setId}`, {
        next: { revalidate: 86400 },
      });
      if (cardsRes.ok) {
        const cards = await cardsRes.json();
        if (Array.isArray(cards) && cards.length > 0) {
          data.cards = cards;
        }
      }
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * セットの全カード詳細を取得する（日本語＋英語）
 * 日本語セット → jaのセット詳細からカード一覧取得 → 各カードの詳細を英語でも取得
 */
export async function fetchSetCards(setId: string): Promise<{
  setNameJa: string;
  setNameEn: string;
  releaseDate: string;
  cards: {
    localId: string;
    nameJa: string;
    nameEn: string;
    rarity: string;
    image: string;
  }[];
}> {
  // 日本語と英語の両方でセット情報を取得
  const [jaSet, enSet] = await Promise.all([
    fetchSetDetail("ja", setId),
    fetchSetDetail("en", setId.toLowerCase()),
  ]);

  const setNameJa = jaSet?.name ?? "";
  const setNameEn = enSet?.name ?? "";
  const releaseDate = jaSet?.releaseDate ?? enSet?.releaseDate ?? "";

  // カード一覧（どちらかにあるもの）
  const jaCards = jaSet?.cards ?? [];
  const enCards = enSet?.cards ?? [];

  // 英語カードをlocalIdでマッピング
  const enCardMap = new Map<string, TcgdexCard>();
  for (const c of enCards) {
    enCardMap.set(c.localId, c);
  }

  // 日本語カードにcardsがある場合はそちらをベースに
  const baseCards = jaCards.length > 0 ? jaCards : enCards;

  const cards = baseCards.map((card) => {
    const enMatch = enCardMap.get(card.localId);
    return {
      localId: card.localId,
      nameJa: jaCards.length > 0 ? card.name : "",
      nameEn: enMatch?.name ?? (jaCards.length === 0 ? card.name : ""),
      rarity: card.rarity ?? "",
      image: card.image ?? "",
    };
  });

  // 日本語セットのcardsが空の場合、英語セットから補完
  // さらに個別カード詳細を取得して日本語名を埋める
  if (jaCards.length === 0 && enCards.length > 0) {
    // 英語カードの情報しかないので、個別に日本語カード取得を試みる（上限20件ずつ）
    const chunks: TcgdexCard[][] = [];
    for (let i = 0; i < cards.length; i += 20) {
      chunks.push(enCards.slice(i, i + 20));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (card) => {
        const jaDetail = await fetchCard("ja", `${setId}-${card.localId}`);
        if (jaDetail) {
          const idx = cards.findIndex((c) => c.localId === card.localId);
          if (idx >= 0) {
            cards[idx].nameJa = jaDetail.name;
          }
        }
      });
      await Promise.all(promises);
    }
  }

  return { setNameJa, setNameEn, releaseDate, cards };
}
