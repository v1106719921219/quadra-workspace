import { fetchSubmissions, fetchSubmissionItems, type Submission, type SubmissionItem } from "../lib/api";

const content = document.getElementById("content")!;
const loading = document.getElementById("loading")!;

document.getElementById("options-btn")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: "作成中", cls: "badge-draft" },
  submitted: { label: "提出済", cls: "badge-submitted" },
  returned: { label: "返却済", cls: "badge-returned" },
};

let currentItems: SubmissionItem[] = [];

// === メイン画面: 提出リスト + Pop Report取り込みボタン ===
async function showSubmissionList() {
  loading.style.display = "block";
  try {
    const submissions = await fetchSubmissions();
    loading.style.display = "none";

    let html = "";

    // Pop Report取り込みセクション（常に表示）
    html += `<div class="scrape-section">`;
    html += `<button class="scrape-btn" id="scrape-btn">Pop Report取り込み</button>`;
    html += `<div class="scrape-hint">PSAのPop Reportページを開いてボタンを押すと、カード名をDBに保存します</div>`;
    html += `</div>`;

    if (submissions.length === 0) {
      html += `<div class="empty">提出リストがありません</div>`;
    } else {
      html += `<div class="section-label">提出リスト</div>`;
      html += `<ul class="list">`;
      for (const sub of submissions) {
        const s = STATUS_LABELS[sub.status] || STATUS_LABELS.draft;
        html += `
          <li data-id="${sub.id}">
            <div class="list-title">
              <span>${escapeHtml(sub.title)}</span>
              <span class="badge ${s.cls}">${s.label}</span>
            </div>
            <div class="list-meta">${sub.item_count}枚 / ${sub.grading_company_id.toUpperCase()}</div>
          </li>
        `;
      }
      html += `</ul>`;
    }

    content.innerHTML = html;

    // イベント登録
    document.getElementById("scrape-btn")?.addEventListener("click", handleScrapePopReport);
    content.querySelectorAll(".list li[data-id]").forEach((li) => {
      const subId = li.getAttribute("data-id")!;
      const sub = submissions.find((s) => s.id === subId)!;
      li.addEventListener("click", () => showSubmissionItems(sub));
    });
  } catch (err) {
    loading.style.display = "none";
    content.innerHTML = `<div class="error">${escapeHtml((err as Error).message)}</div>`;
  }
}

// === Pop Reportスクレイピング ===
async function handleScrapePopReport() {
  const btn = document.getElementById("scrape-btn") as HTMLButtonElement;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "取り込み中...";
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("アクティブタブが見つかりません");

    if (!tab.url?.includes("psacard.com")) {
      throw new Error("PSAのページを開いてください (psacard.com)");
    }

    const result = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_POP_REPORT" });

    if (result?.success) {
      if (btn) {
        btn.textContent = `${result.count}件取り込み完了`;
        btn.style.background = "#059669";
      }
    } else {
      throw new Error(result?.error || "取り込みに失敗しました");
    }
  } catch (err) {
    const msg = (err as Error).message;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Pop Report取り込み";
    }
    content.insertAdjacentHTML(
      "afterbegin",
      `<div class="error">${escapeHtml(msg)}</div>`
    );
  }
}

// === カード一覧画面 ===
async function showSubmissionItems(sub: Submission) {
  content.innerHTML = `<div class="loading">カード読み込み中...</div>`;
  try {
    const items = await fetchSubmissionItems(sub.id);
    currentItems = items;

    let html = `<button class="back-btn" id="back-btn">&larr; 一覧に戻る</button>`;
    html += `<div style="font-weight:600;margin-bottom:8px;">${escapeHtml(sub.title)} (${items.length}枚)</div>`;

    if (items.length === 0) {
      html += `<div class="empty">カードがありません</div>`;
    } else {
      html += `<ul class="card-list">`;
      for (const item of items) {
        html += `
          <li class="card-item">
            <div class="card-name">${escapeHtml(item.name_ja || `${item.set_code}-${item.card_number}`)}</div>
            <div class="card-grading">${escapeHtml(item.grading_name)}</div>
          </li>
        `;
      }
      html += `</ul>`;
      html += `<div class="btn-group">`;
      html += `<button class="fetch-btn" id="fetch-btn">PSA名取得</button>`;
      html += `<button class="autofill-btn" id="autofill-btn">自動入力</button>`;
      html += `</div>`;
    }

    content.innerHTML = html;
    document.getElementById("back-btn")?.addEventListener("click", showSubmissionList);
    document.getElementById("fetch-btn")?.addEventListener("click", handleFetchPsaNames);
    document.getElementById("autofill-btn")?.addEventListener("click", handleAutoFill);
  } catch (err) {
    content.innerHTML = `<div class="error">${escapeHtml((err as Error).message)}</div>`;
  }
}

async function handleFetchPsaNames() {
  const btn = document.getElementById("fetch-btn") as HTMLButtonElement;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "取得中...";
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("アクティブタブが見つかりません");

    if (!tab.url?.includes("psacard.com")) {
      throw new Error("PSAのページを開いてください (psacard.com)");
    }

    await chrome.tabs.sendMessage(tab.id, {
      type: "FETCH_PSA_NAMES",
      items: currentItems,
    });

    if (btn) btn.textContent = "取得完了";
  } catch (err) {
    const msg = (err as Error).message;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "PSA名取得";
    }
    content.insertAdjacentHTML(
      "afterbegin",
      `<div class="error">${escapeHtml(msg)}</div>`
    );
  }
}

async function handleAutoFill() {
  const btn = document.getElementById("autofill-btn") as HTMLButtonElement;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "送信中...";
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("アクティブタブが見つかりません");

    if (!tab.url?.includes("psacard.com")) {
      throw new Error("PSAのページを開いてください (psacard.com)");
    }

    await chrome.tabs.sendMessage(tab.id, {
      type: "AUTOFILL_PSA",
      items: currentItems,
    });

    if (btn) btn.textContent = "入力完了";
  } catch (err) {
    const msg = (err as Error).message;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "自動入力";
    }
    content.insertAdjacentHTML(
      "afterbegin",
      `<div class="error">${escapeHtml(msg)}</div>`
    );
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

showSubmissionList();
