/**
 * ページ構造デバッグスクリプト
 * ページネーションのHTML構造を調査する
 */

import { chromium } from "playwright";
import { join } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";

const BASE_URL = "https://bizsys3.s-o-b.jp/quadra-order-mng";
const LOGIN_URL = `${BASE_URL}/mng/login`;
const LIST_URL = `${BASE_URL}/mng/orderMng/list/init`;
const LOGIN_ID = "v11067";
const LOGIN_PW = "Tessa123";
const OUT_DIR = join(process.cwd(), "invoices");

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  // ログイン
  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
  await page.locator('input[type="text"]').first().fill(LOGIN_ID);
  await page.locator('input[type="password"]').first().fill(LOGIN_PW);
  try {
    await page.locator('button, input[type="submit"]').first().click({ timeout: 60000 });
  } catch {}
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);

  // 一覧ページに移動
  await page.goto(LIST_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 日付クリア＆検索
  await page.evaluate(() => {
    document.querySelectorAll('input[type="text"]').forEach((el) => {
      if (el.value && /^\d{4}/.test(el.value)) {
        el.value = "";
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    document.querySelectorAll(".xdsoft_datetimepicker").forEach((el) => {
      el.style.display = "none";
    });
    if (typeof clickSearch === "function") clickSearch();
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // ===== デバッグ情報収集 =====

  // 1. ページネーション周辺のHTML
  const paginationHtml = await page.evaluate(() => {
    // 「前へ」「次へ」を含む親要素を探す
    const allElements = document.querySelectorAll("*");
    let paginationContainer = null;
    for (const el of allElements) {
      if (el.textContent.includes("次へ") && el.children.length < 20) {
        paginationContainer = el;
      }
    }
    return paginationContainer ? paginationContainer.outerHTML : "ページネーション要素が見つかりません";
  });
  console.log("\n===== ページネーションHTML =====");
  console.log(paginationHtml);

  // 2. テーブルの構造
  const tableInfo = await page.evaluate(() => {
    const tables = document.querySelectorAll("table");
    const info = [];
    tables.forEach((t, idx) => {
      const rows = t.querySelectorAll("tbody tr");
      const firstRow = rows[0];
      const firstCellText = firstRow ? firstRow.querySelector("td")?.textContent?.trim() : "N/A";
      const lastRow = rows[rows.length - 1];
      const lastCellText = lastRow ? lastRow.querySelector("td")?.textContent?.trim() : "N/A";
      info.push({
        index: idx,
        className: t.className,
        id: t.id,
        rowCount: rows.length,
        firstRowText: firstCellText?.slice(0, 30),
        lastRowText: lastCellText?.slice(0, 30),
      });
    });
    return info;
  });
  console.log("\n===== テーブル情報 =====");
  console.log(JSON.stringify(tableInfo, null, 2));

  // 3. 「次へ」リンクの詳細
  const nextLinkInfo = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll("*").forEach((el) => {
      if (el.textContent.trim() === "次へ" && el.children.length === 0) {
        results.push({
          tag: el.tagName,
          className: el.className,
          href: el.getAttribute("href"),
          onclick: el.getAttribute("onclick"),
          parentTag: el.parentElement?.tagName,
          parentClass: el.parentElement?.className,
          parentOnclick: el.parentElement?.getAttribute("onclick"),
        });
      }
    });
    return results;
  });
  console.log("\n===== 「次へ」リンク詳細 =====");
  console.log(JSON.stringify(nextLinkInfo, null, 2));

  // 4. ページネーション関連のJavaScript関数
  const jsFunctions = await page.evaluate(() => {
    const fns = [];
    // よくあるページネーション関数名
    const names = ["changePage", "goPage", "nextPage", "movePage", "clickPage", "pageChange", "clickNext", "changeList"];
    for (const name of names) {
      if (typeof window[name] === "function") {
        fns.push({ name, source: window[name].toString().slice(0, 200) });
      }
    }
    // onclick属性からも探す
    document.querySelectorAll("[onclick]").forEach((el) => {
      const onclick = el.getAttribute("onclick");
      if (onclick && (onclick.includes("page") || onclick.includes("Page"))) {
        fns.push({ element: el.tagName, text: el.textContent.trim().slice(0, 20), onclick });
      }
    });
    return fns;
  });
  console.log("\n===== ページネーション関連JS =====");
  console.log(JSON.stringify(jsFunctions, null, 2));

  // 5. ページのスクリーンショット
  await page.screenshot({ path: join(OUT_DIR, "_debug_full_page.png"), fullPage: true });
  console.log("\nスクリーンショット保存: _debug_full_page.png");

  // 6. ページの全HTML保存
  const fullHtml = await page.content();
  writeFileSync(join(OUT_DIR, "_debug_page.html"), fullHtml);
  console.log("HTML保存: _debug_page.html");

  await browser.close();
}

main().catch(console.error);
