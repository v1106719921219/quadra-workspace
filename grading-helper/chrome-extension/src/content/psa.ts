// PSAフォーム自動入力 Content Script
// PSAサイト (psacard.com) の Item Entry ページで動作

interface SubmissionItem {
  id: string;
  sort_order: number;
  set_code: string;
  card_number: string;
  name_ja: string | null;
  grading_name: string;
  declared_value: number | null;
  notes: string | null;
}

interface PsaSpec {
  specId: number;
  description: string;
}

// === fetch interceptor ===
// PSAのReactアプリがtRPC APIを呼ぶとき、そのレスポンスを横取りする
let pendingSearchResolve: ((specs: PsaSpec[]) => void) | null = null;

function injectApiInterceptor() {
  const script = document.createElement("script");
  script.textContent = `
    (function() {
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        const res = await origFetch.apply(this, args);
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        if (url.includes('searchBySpecTerm') || url.includes('SearchBySpecTerm') || url.includes('specTerm')) {
          try {
            const clone = res.clone();
            const json = await clone.json();
            window.postMessage({ type: '__GH_PSA_API__', payload: json }, '*');
          } catch(e) {
            console.warn('[GH] fetch intercept parse error', e);
          }
        }
        return res;
      };

      // XHRも念のためフック
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__gh_url = typeof url === 'string' ? url : url?.toString() || '';
        return origOpen.apply(this, [method, url, ...rest]);
      };
      XMLHttpRequest.prototype.send = function(...args) {
        if (this.__gh_url && (this.__gh_url.includes('searchBySpecTerm') || this.__gh_url.includes('specTerm'))) {
          this.addEventListener('load', function() {
            try {
              const json = JSON.parse(this.responseText);
              window.postMessage({ type: '__GH_PSA_API__', payload: json }, '*');
            } catch(e) {}
          });
        }
        return origSend.apply(this, args);
      };
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
  console.log("[Grading Helper] API interceptor injected");
}

// postMessageリスナー: ページコンテキストからAPI結果を受信
window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.type !== "__GH_PSA_API__") return;

  const payload = event.data.payload;
  console.log("[Grading Helper] API response intercepted:", payload);

  let specs: PsaSpec[] = [];
  try {
    // tRPC batch format: [{ result: { data: { json: { specs: [...] } } } }]
    if (Array.isArray(payload)) {
      const d = payload[0]?.result?.data;
      specs = d?.json?.specs || d?.specs || [];
    } else {
      // tRPC single format: { result: { data: { json: { specs: [...] } } } }
      const d = payload?.result?.data;
      specs = d?.json?.specs || d?.specs || [];
    }
    // もしspecsが空でもpayload全体にspecsがあれば
    if (specs.length === 0 && payload?.specs) {
      specs = payload.specs;
    }
  } catch (e) {
    console.warn("[Grading Helper] API response parse error:", e);
  }

  console.log(`[Grading Helper] Parsed ${specs.length} specs:`, specs.slice(0, 5));

  if (pendingSearchResolve) {
    pendingSearchResolve(specs);
    pendingSearchResolve = null;
  }
});

// interceptor初期化
injectApiInterceptor();

// === ユーティリティ ===

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// grading_nameからPSA検索用クエリ生成
function buildSearchTerm(gradingName: string): string {
  let term = gradingName;
  term = term.replace(/^\d{4}\s*/, ""); // 年除去
  term = term.replace(/\b\d{3}\b\s*/g, ""); // カード番号除去
  term = term
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return term.replace(/\s+/g, " ").trim();
}

// === API経由検索 ===

// API応答を待つ（タイムアウト付き、フォールバック: DOM読み取り）
function waitForApiResponse(timeoutMs: number = 6000): Promise<PsaSpec[]> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn("[Grading Helper] API応答タイムアウト → DOM fallback");
      pendingSearchResolve = null;
      // フォールバック: DOMからドロップダウン候補を読む
      const options = document.querySelectorAll<HTMLElement>('[role="option"]');
      const fallbackSpecs: PsaSpec[] = [];
      options.forEach((opt, i) => {
        const text = opt.textContent?.trim();
        if (text) fallbackSpecs.push({ specId: i, description: text });
      });
      resolve(fallbackSpecs);
    }, timeoutMs);

    pendingSearchResolve = (specs) => {
      clearTimeout(timer);
      resolve(specs);
    };
  });
}

// 検索入力 → API結果取得
async function searchPsa(searchTerm: string): Promise<PsaSpec[]> {
  const searchInput = document.querySelector<HTMLInputElement>("#itemEntryInput");
  if (!searchInput) return [];

  // API応答待ちを先にセットアップ
  const resultPromise = waitForApiResponse(6000);

  // 入力欄をクリア＆入力
  searchInput.focus();
  setNativeValue(searchInput, "");
  await sleep(200);
  setNativeValue(searchInput, searchTerm);
  searchInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
  searchInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));

  // API応答を待つ
  const specs = await resultPromise;
  return specs;
}

// 入力欄をクリア
function clearSearchInput() {
  const searchInput = document.querySelector<HTMLInputElement>("#itemEntryInput");
  if (searchInput) {
    setNativeValue(searchInput, "");
    searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    searchInput.blur();
  }
}

// WebアプリAPIにPSA公式名を保存
async function savePsaName(itemId: string, psaDescription: string) {
  try {
    const settings = await new Promise<{ serverUrl: string; apiKey: string }>((resolve) => {
      chrome.storage.sync.get(["serverUrl", "apiKey"], (result: Record<string, string>) => {
        resolve({ serverUrl: result.serverUrl || "", apiKey: result.apiKey || "" });
      });
    });
    if (!settings.serverUrl || !settings.apiKey) {
      console.warn("[Grading Helper] サーバーURL/APIキー未設定");
      return;
    }

    const res = await fetch(`${settings.serverUrl}/api/v1/submissions/items/${itemId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ grading_name: psaDescription }),
    });
    if (!res.ok) {
      console.warn(`[Grading Helper] 保存失敗: ${res.status} ${res.statusText}`);
    } else {
      console.log(`[Grading Helper] PSA名を保存: ${psaDescription}`);
    }
  } catch (err) {
    console.warn("[Grading Helper] PSA名の保存に失敗:", err);
  }
}

// === モード1: PSA名取得（API経由で全データ取得→DBに保存） ===
async function fetchPsaNames(items: SubmissionItem[]) {
  const progressDiv = createProgress();
  let found = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const searchTerm = buildSearchTerm(item.grading_name);

    progressDiv.innerHTML = progressHtml(
      `PSA名取得: ${i + 1}/${items.length}`,
      `検索中: ${searchTerm}`
    );

    console.log(`[Grading Helper] PSA検索: "${searchTerm}"`);
    const specs = await searchPsa(searchTerm);

    if (specs.length > 0) {
      const bestMatch = specs[0].description;
      console.log(`[Grading Helper] PSAマッチ (${specs.length}件中1位): ${bestMatch}`);
      if (specs.length > 1) {
        console.log("[Grading Helper] 全候補:", specs.map((s) => s.description));
      }
      await savePsaName(item.id, bestMatch);
      found++;

      progressDiv.innerHTML = progressHtml(
        `PSA名取得: ${i + 1}/${items.length}`,
        `<span style="color:#4ade80">${escapeHtml(bestMatch)}</span>` +
          (specs.length > 1 ? `<br><span style="color:#888;font-size:11px;">(他${specs.length - 1}件)</span>` : "")
      );
    } else {
      console.warn(`[Grading Helper] PSA検索結果なし: ${searchTerm}`);
      progressDiv.innerHTML = progressHtml(
        `PSA名取得: ${i + 1}/${items.length}`,
        `<span style="color:#f87171">見つからず: ${searchTerm}</span>`
      );
    }

    clearSearchInput();
    await sleep(1000);
  }

  progressDiv.style.background = found > 0 ? "#16a34a" : "#dc2626";
  progressDiv.innerHTML = progressHtml(
    "PSA名取得 完了",
    `${found}件取得 / ${items.length - found}件失敗`
  );
  setTimeout(() => progressDiv.remove(), 8000);
}

// === モード2: 自動入力（PSA名で完全一致入力＆Save） ===
async function autoFillItems(items: SubmissionItem[]) {
  const progressDiv = createProgress();
  let success = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    progressDiv.innerHTML = progressHtml(
      `自動入力: ${i + 1}/${items.length}`,
      item.grading_name
    );

    console.log(`[Grading Helper] 入力: ${item.grading_name}`);
    const ok = await fillExactMatch(item.grading_name);
    if (ok) {
      success++;
    } else {
      failed++;
      console.warn(`[Grading Helper] 入力失敗: ${item.grading_name}`);
    }
    await sleep(500);
  }

  progressDiv.style.background = success > 0 ? "#16a34a" : "#dc2626";
  progressDiv.innerHTML = progressHtml(
    "自動入力 完了",
    `${success}件完了` + (failed > 0 ? ` / ${failed}件失敗` : "")
  );
  setTimeout(() => progressDiv.remove(), 8000);
}

// PSA名でフォームを入力（完全一致選択→Save）
async function fillExactMatch(psaDescription: string): Promise<boolean> {
  const searchInput = document.querySelector<HTMLInputElement>("#itemEntryInput");
  if (!searchInput) return false;

  searchInput.focus();
  setNativeValue(searchInput, "");
  await sleep(200);
  setNativeValue(searchInput, psaDescription);
  searchInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
  searchInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));

  await sleep(2500);

  // 候補から完全一致 or 最初の候補を選択
  const options = document.querySelectorAll<HTMLElement>('[role="option"]');
  let selected = false;
  for (const opt of options) {
    const text = opt.textContent?.trim() || "";
    if (text === psaDescription || text.includes(psaDescription)) {
      opt.click();
      console.log(`[Grading Helper] 完全一致で選択: ${text}`);
      selected = true;
      await sleep(500);
      break;
    }
  }

  if (!selected && options.length > 0) {
    options[0].click();
    console.log(`[Grading Helper] 最初の候補を選択: ${options[0].textContent?.trim()}`);
    await sleep(500);
  }

  // Save
  await sleep(300);
  const saveButton = Array.from(document.querySelectorAll("button")).find(
    (btn) => btn.textContent?.trim() === "Save"
  );
  if (saveButton && !saveButton.disabled) {
    saveButton.click();
    console.log("[Grading Helper] Save クリック");
    await sleep(1500);
    return true;
  }
  return false;
}

// === UI ヘルパー ===

function createProgress(): HTMLDivElement {
  const div = document.createElement("div");
  div.id = "grading-helper-progress";
  div.style.cssText =
    "position:fixed;top:16px;right:16px;background:#1a1a1a;color:#fff;padding:16px 24px;" +
    "border-radius:8px;z-index:99999;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);" +
    "min-width:300px;max-width:500px;line-height:1.5;";
  document.getElementById("grading-helper-progress")?.remove();
  document.body.appendChild(div);
  return div;
}

function progressHtml(title: string, detail: string): string {
  return `<div style="font-weight:600;">${title}</div>` +
    `<div style="font-size:12px;color:#aaa;margin-top:4px;">${detail}</div>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// === モード3: Pop Reportスクレイピング ===

interface ScrapedCard {
  set_name: string;
  card_number: string;
  description: string;
  year: string;
}

function getSettings(): Promise<{ serverUrl: string; apiKey: string }> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["serverUrl", "apiKey"], (result: Record<string, string>) => {
      resolve({ serverUrl: result.serverUrl || "", apiKey: result.apiKey || "" });
    });
  });
}

async function scrapePopReport(): Promise<{ cards: ScrapedCard[]; setName: string }> {
  const cards: ScrapedCard[] = [];

  // ページタイトルからセット名を取得
  const heading = document.querySelector("h1, .page-title, [class*='heading']");
  let setName = heading?.textContent?.trim() || "";
  // URLからも推測
  const urlParts = location.pathname.split("/").filter(Boolean);
  if (!setName && urlParts.length > 1) {
    setName = urlParts[urlParts.length - 1].replace(/-/g, " ");
  }

  console.log(`[Grading Helper] Pop Report セット名: "${setName}"`);
  console.log("[Grading Helper] ページ構造を解析中...");

  // テーブルを探す
  const tables = document.querySelectorAll("table");
  console.log(`[Grading Helper] テーブル数: ${tables.length}`);

  for (const table of tables) {
    const rows = table.querySelectorAll("tbody tr, tr");
    console.log(`[Grading Helper] テーブル行数: ${rows.length}`);

    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 2) continue;

      // 一般的なPop Report構造: カード番号 | 説明 | 年 | ... (grade counts)
      // またはリンクを含む場合もある
      const firstCell = cells[0]?.textContent?.trim() || "";
      const secondCell = cells[1]?.textContent?.trim() || "";

      // リンクがある場合はリンクテキストを使う
      const link = row.querySelector("a");
      const linkText = link?.textContent?.trim() || "";

      let cardNumber = "";
      let description = "";

      // パターン1: 最初のセルがカード番号（数字）
      if (/^\d+/.test(firstCell) && secondCell) {
        cardNumber = firstCell;
        description = linkText || secondCell;
      }
      // パターン2: リンクに情報がある
      else if (linkText) {
        description = linkText;
        // 番号を推測
        const numMatch = linkText.match(/^#?(\d+)\s/);
        if (numMatch) {
          cardNumber = numMatch[1];
          description = linkText.replace(/^#?\d+\s*/, "");
        }
      }
      // パターン3: 最初のセルが説明
      else if (firstCell && firstCell.length > 3) {
        description = firstCell;
      }

      if (description && description.length > 2) {
        cards.push({
          set_name: setName,
          card_number: cardNumber,
          description,
          year: "",
        });
      }
    }
  }

  // テーブルが見つからない場合、リスト/divベースのレイアウトを試す
  if (cards.length === 0) {
    console.log("[Grading Helper] テーブルなし、他のレイアウトを検索...");

    // リンクベースの検索
    const allLinks = document.querySelectorAll("a[href*='/pop/'], a[href*='cert']");
    console.log(`[Grading Helper] Pop関連リンク数: ${allLinks.length}`);

    allLinks.forEach((link) => {
      const text = link.textContent?.trim() || "";
      if (text && text.length > 3 && !text.includes("Back") && !text.includes("Home")) {
        cards.push({
          set_name: setName,
          card_number: "",
          description: text,
          year: "",
        });
      }
    });

    // グリッドやカードレイアウト
    if (cards.length === 0) {
      const dataElements = document.querySelectorAll("[class*='card'], [class*='item'], [class*='row'], [data-spec]");
      console.log(`[Grading Helper] データ要素数: ${dataElements.length}`);

      dataElements.forEach((el) => {
        const text = el.textContent?.trim() || "";
        const specId = el.getAttribute("data-spec") || "";
        if (text && text.length > 3 && text.length < 200) {
          cards.push({
            set_name: setName,
            card_number: specId,
            description: text.split("\n")[0].trim(),
            year: "",
          });
        }
      });
    }
  }

  // 重複除去
  const unique = new Map<string, ScrapedCard>();
  for (const card of cards) {
    if (!unique.has(card.description)) {
      unique.set(card.description, card);
    }
  }
  const result = Array.from(unique.values());

  console.log(`[Grading Helper] スクレイピング結果: ${result.length}件`);
  if (result.length > 0) {
    console.log("[Grading Helper] サンプル:", result.slice(0, 5));
  }

  // ページのHTML構造もログ（デバッグ用）
  const bodyChildren = document.body.children;
  const structure: string[] = [];
  for (let i = 0; i < Math.min(bodyChildren.length, 20); i++) {
    const el = bodyChildren[i];
    structure.push(`${el.tagName}.${el.className?.toString().slice(0, 30)} (${el.childElementCount} children)`);
  }
  console.log("[Grading Helper] ページ構造:", structure);

  return { cards: result, setName };
}

async function handleScrapePopReport(): Promise<{ success: boolean; count: number; setName: string; error?: string }> {
  const progressDiv = createProgress();
  progressDiv.innerHTML = progressHtml("Pop Report", "スクレイピング中...");

  try {
    const { cards, setName } = await scrapePopReport();

    if (cards.length === 0) {
      progressDiv.style.background = "#dc2626";
      progressDiv.innerHTML = progressHtml(
        "Pop Report",
        "カードデータが見つかりませんでした。<br>コンソール(F12)でページ構造を確認してください。"
      );
      setTimeout(() => progressDiv.remove(), 8000);
      return { success: false, count: 0, setName, error: "カードデータなし" };
    }

    progressDiv.innerHTML = progressHtml(
      "Pop Report",
      `${cards.length}件見つかりました。DBに保存中...`
    );

    const settings = await getSettings();
    if (!settings.serverUrl || !settings.apiKey) {
      progressDiv.style.background = "#dc2626";
      progressDiv.innerHTML = progressHtml("Pop Report", "サーバーURL/APIキーが未設定です");
      setTimeout(() => progressDiv.remove(), 5000);
      return { success: false, count: 0, setName, error: "設定未完了" };
    }

    // バッチで保存（100件ずつ）
    let saved = 0;
    for (let i = 0; i < cards.length; i += 100) {
      const batch = cards.slice(i, i + 100);
      const res = await fetch(`${settings.serverUrl}/api/v1/psa-specs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ specs: batch }),
      });

      if (res.ok) {
        const data = await res.json();
        saved += data.count || batch.length;
      } else {
        console.warn(`[Grading Helper] バッチ保存エラー: ${res.status}`);
      }

      progressDiv.innerHTML = progressHtml(
        "Pop Report",
        `保存中... ${Math.min(i + 100, cards.length)}/${cards.length}`
      );
    }

    progressDiv.style.background = "#16a34a";
    progressDiv.innerHTML = progressHtml(
      "Pop Report 完了",
      `${saved}件をDBに保存しました (${escapeHtml(setName)})`
    );
    setTimeout(() => progressDiv.remove(), 8000);
    return { success: true, count: saved, setName };
  } catch (err) {
    progressDiv.style.background = "#dc2626";
    progressDiv.innerHTML = progressHtml("Pop Report エラー", (err as Error).message);
    setTimeout(() => progressDiv.remove(), 8000);
    return { success: false, count: 0, setName: "", error: (err as Error).message };
  }
}

// === メッセージ受信 ===
chrome.runtime.onMessage.addListener(
  (message: { type: string; items?: SubmissionItem[] }, _sender, sendResponse) => {
    if (message.type === "FETCH_PSA_NAMES" && message.items) {
      fetchPsaNames(message.items)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
      return true;
    }
    if (message.type === "AUTOFILL_PSA" && message.items) {
      autoFillItems(message.items)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
      return true;
    }
    if (message.type === "SCRAPE_POP_REPORT") {
      handleScrapePopReport()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
      return true;
    }
  }
);

console.log("[Grading Helper] PSA content script loaded (API intercept + Pop Report scrape)");
