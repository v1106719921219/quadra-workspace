/**
 * 「請求書発行なし」100件を再確認するスクリプト
 * 全1539件をスキャンし、PDFが存在しない受注番号を特定→再チェック
 */
import { chromium } from "playwright";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

const BASE_URL = "https://bizsys3.s-o-b.jp/quadra-order-mng";
const LOGIN_URL = `${BASE_URL}/mng/login`;
const DETAIL_URL_BASE = `${BASE_URL}/mng/orderMng/detail/edit`;
const DOWNLOAD_DIR = join(process.cwd(), "invoices_pdf");

const LOGIN_ID = "v11067";
const LOGIN_PW = "Tessa123";
const MAX_ORDER = 1539;

// 既存PDFをスキャンして、PDFがない受注番号を特定
function findMissingOrders() {
  const existingFiles = new Set();
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(d, entry.name));
      else if (entry.name.endsWith(".pdf")) existingFiles.add(entry.name);
    }
  }
  if (existsSync(DOWNLOAD_DIR)) walk(DOWNLOAD_DIR);

  const missing = [];
  for (let num = 1; num <= MAX_ORDER; num++) {
    const fileName = `OD_${num}_請求書.pdf`;
    if (!existingFiles.has(fileName)) {
      missing.push(num);
    }
  }
  return missing;
}

async function doLogin(page) {
  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
  await page.locator('input[type="text"]').first().fill(LOGIN_ID);
  await page.locator('input[type="password"]').first().fill(LOGIN_PW);
  try {
    await page.locator('button, input[type="submit"]').first().click({ timeout: 60000 });
  } catch {}
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  if (page.url().includes("login")) throw new Error("ログイン失敗");
  console.log("✓ ログイン成功");
}

async function main() {
  const missing = findMissingOrders();
  console.log(`PDFが存在しない受注: ${missing.length}件`);
  console.log(`対象: ${missing.join(", ")}\n`);

  if (missing.length === 0) {
    console.log("全件PDFが存在します。");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  await doLogin(page);

  const results = [];
  let processed = 0;

  for (const num of missing) {
    processed++;

    // 50件ごとに再ログイン
    if (processed > 1 && processed % 50 === 0) {
      console.log("  [再ログイン中...]");
      await doLogin(page);
    }

    try {
      await page.goto(`${DETAIL_URL_BASE}/${num}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      // セッション切れチェック
      if (page.url().includes("login")) {
        console.log(`  OD_${num}: セッション切れ → 再ログイン`);
        await doLogin(page);
        await page.goto(`${DETAIL_URL_BASE}/${num}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(500);
      }

      // ページ情報を取得
      const info = await page.evaluate(() => {
        const body = document.body.textContent;
        const hasInvoiceBtn = !!document.querySelector('input[value="請求書発行"]');

        // 発注日時
        const dateMatch = body.match(/発注日時\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/);

        // ステータス
        const statusSelect = document.querySelector('select');
        const selectedOption = statusSelect ? statusSelect.options[statusSelect.selectedIndex]?.text : null;

        // 発注IDの確認
        const idMatch = body.match(/発注ID\s*(OD_\d+)/);

        // ページにエラーメッセージがないか
        const pageTitle = document.title;
        const hasError = body.includes("エラー") || body.includes("見つかり") || body.includes("存在しません");

        // 全ボタン/input一覧
        const buttons = [];
        document.querySelectorAll('input[type="button"], button').forEach(el => {
          const val = el.value || el.textContent?.trim();
          if (val) buttons.push(val);
        });

        return {
          orderId: idMatch ? idMatch[1] : "不明",
          date: dateMatch ? dateMatch[1] : "不明",
          status: selectedOption || "不明",
          hasInvoiceBtn,
          hasError,
          pageTitle,
          buttons,
        };
      });

      const statusStr = `OD_${num}: 日付=${info.date} | ステータス=${info.status} | 請求書ボタン=${info.hasInvoiceBtn ? "あり" : "なし"} | ボタン一覧=[${info.buttons.join(", ")}]`;
      console.log(`  [${processed}/${missing.length}] ${statusStr}`);

      results.push({
        orderNum: num,
        ...info,
      });
    } catch (e) {
      console.log(`  [${processed}/${missing.length}] OD_${num}: エラー - ${e.message.slice(0, 60)}`);
      results.push({ orderNum: num, error: e.message });
    }
  }

  // サマリー
  console.log("\n===================================");
  console.log("       再確認サマリー");
  console.log("===================================");

  const withButton = results.filter(r => r.hasInvoiceBtn === true);
  const withoutButton = results.filter(r => r.hasInvoiceBtn === false);
  const errors = results.filter(r => r.error);

  console.log(`請求書ボタンあり: ${withButton.length}件`);
  if (withButton.length > 0) {
    console.log("  → これらはPDFダウンロード可能:");
    withButton.forEach(r => console.log(`    OD_${r.orderNum} (${r.date}, ${r.status})`));
  }

  console.log(`請求書ボタンなし: ${withoutButton.length}件`);
  if (withoutButton.length > 0) {
    // ステータス別に集計
    const statusCount = {};
    withoutButton.forEach(r => {
      const s = r.status || "不明";
      statusCount[s] = (statusCount[s] || 0) + 1;
    });
    console.log("  ステータス別内訳:");
    for (const [status, count] of Object.entries(statusCount)) {
      console.log(`    ${status}: ${count}件`);
    }
    console.log("  詳細:");
    withoutButton.forEach(r => console.log(`    OD_${r.orderNum} (${r.date}, ${r.status})`));
  }

  console.log(`エラー: ${errors.length}件`);
  console.log("===================================");

  await browser.close();
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  process.exit(1);
});
