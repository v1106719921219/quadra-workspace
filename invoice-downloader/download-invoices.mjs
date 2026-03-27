/**
 * 請求書一括ダウンロードスクリプト v8
 * - セッション切れ自動再ログイン対応
 * - page.pdf() でPDF生成
 * - 月/日付フォルダに整理
 */

import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

// ===== 設定 =====
const BASE_URL = "https://bizsys3.s-o-b.jp/quadra-order-mng";
const LOGIN_URL = `${BASE_URL}/mng/login`;
const DETAIL_URL_BASE = `${BASE_URL}/mng/orderMng/detail/edit`;
const DOWNLOAD_DIR = join(process.cwd(), "invoices_pdf");
const WAIT_MS = 600;
const MAX_ORDER = 1539;
const RELOGIN_INTERVAL = 200; // N件ごとに予防的に再ログイン

// ===== ログイン情報 =====
const LOGIN_ID = "v11067";
const LOGIN_PW = "Tessa123";

async function main() {
  if (!existsSync(DOWNLOAD_DIR)) {
    mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  const existingFiles = scanExistingFiles(DOWNLOAD_DIR);
  console.log(`PDF保存先: ${DOWNLOAD_DIR}`);
  console.log(`既にダウンロード済み: ${existingFiles.size}件\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  // 初回ログイン
  await doLogin(page);

  // ===== 全件ダウンロード =====
  console.log("===== 請求書PDF一括生成 =====");
  let downloadedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let noInvoiceCount = 0;
  let processedSinceLogin = 0;

  for (let num = MAX_ORDER; num >= 1; num--) {
    const orderId = `OD_${num}`;
    const fileName = `${orderId}_請求書.pdf`;

    if (existingFiles.has(fileName)) {
      skippedCount++;
      continue;
    }

    const idx = MAX_ORDER - num + 1;
    processedSinceLogin++;

    // 定期的に再ログイン（セッション切れ予防）
    if (processedSinceLogin >= RELOGIN_INTERVAL) {
      console.log("  [再ログイン中...]");
      await doLogin(page);
      processedSinceLogin = 0;
    }

    try {
      const result = await downloadInvoicePdf(page, context, num, DOWNLOAD_DIR, existingFiles);

      if (result === true) {
        downloadedCount++;
        process.stdout.write(`  [${idx}/${MAX_ORDER}] ${orderId} ✓\n`);
      } else if (result === "no_button") {
        noInvoiceCount++;
      } else if (result === "session_expired") {
        // セッション切れ → 再ログインしてリトライ
        console.log(`  [${idx}/${MAX_ORDER}] ${orderId} セッション切れ → 再ログイン`);
        await doLogin(page);
        processedSinceLogin = 0;

        // リトライ
        const retry = await downloadInvoicePdf(page, context, num, DOWNLOAD_DIR, existingFiles);
        if (retry === true) {
          downloadedCount++;
          process.stdout.write(`  [${idx}/${MAX_ORDER}] ${orderId} ✓ (リトライ)\n`);
        } else if (retry === "no_button") {
          noInvoiceCount++;
        } else {
          errorCount++;
          process.stdout.write(`  [${idx}/${MAX_ORDER}] ${orderId} ✗\n`);
        }
      } else {
        errorCount++;
        process.stdout.write(`  [${idx}/${MAX_ORDER}] ${orderId} ✗\n`);
      }
    } catch (e) {
      errorCount++;
      process.stdout.write(`  [${idx}/${MAX_ORDER}] ${orderId} ✗ ${e.message.slice(0, 40)}\n`);
    }

    if (idx % 100 === 0) {
      console.log(`\n  --- ${idx}/${MAX_ORDER} | PDF:${downloadedCount} Skip:${skippedCount} Err:${errorCount} NoInv:${noInvoiceCount} ---\n`);
    }
  }

  // ===== サマリー =====
  console.log("\n===================================");
  console.log("           完了サマリー");
  console.log("===================================");
  console.log(`PDF生成成功:          ${downloadedCount}件`);
  console.log(`スキップ（既存）:     ${skippedCount}件`);
  console.log(`請求書発行なし:       ${noInvoiceCount}件`);
  console.log(`エラー:              ${errorCount}件`);
  console.log(`合計PDF:             ${downloadedCount + skippedCount}件`);
  console.log(`保存先: ${DOWNLOAD_DIR}`);
  console.log("===================================\n");

  await browser.close();
}

/**
 * ログイン処理
 */
async function doLogin(page) {
  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
  await page.locator('input[type="text"]').first().fill(LOGIN_ID);
  await page.locator('input[type="password"]').first().fill(LOGIN_PW);
  try {
    await page.locator('button, input[type="submit"]').first().click({ timeout: 60000 });
  } catch {}
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);

  if (page.url().includes("login")) {
    console.log("✗ ログイン失敗");
    throw new Error("ログイン失敗");
  }
  console.log("✓ ログイン成功");
}

/**
 * 1件の請求書をPDF保存
 * @returns {true|false|"no_button"|"session_expired"}
 */
async function downloadInvoicePdf(page, context, orderNum, downloadDir, existingFiles) {
  const orderId = `OD_${orderNum}`;
  const fileName = `${orderId}_請求書.pdf`;

  // 詳細ページに移動
  await page.goto(`${DETAIL_URL_BASE}/${orderNum}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  // セッション切れチェック（ログインページにリダイレクトされた場合）
  if (page.url().includes("login")) {
    return "session_expired";
  }

  // 請求書発行ボタン確認
  const hasBtn = await page.evaluate(() => {
    return !!document.querySelector('input[value="請求書発行"]');
  });
  if (!hasBtn) return "no_button";

  // 発注日時を取得
  const orderDate = await page.evaluate(() => {
    const match = document.body.textContent.match(/発注日時\s*(\d{4}\/\d{2}\/\d{2})/);
    return match ? match[1] : null;
  });

  // 保存先フォルダ
  let targetDir = downloadDir;
  if (orderDate) {
    const [year, month, day] = orderDate.split("/");
    targetDir = join(downloadDir, `${year}-${month}`, `${year}-${month}-${day}`);
  } else {
    targetDir = join(downloadDir, "日付不明");
  }
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  const savePath = join(targetDir, fileName);

  // 請求書発行クリック → 新タブ
  let newPage;
  try {
    [newPage] = await Promise.all([
      context.waitForEvent("page", { timeout: 10000 }),
      page.evaluate(() => {
        if (typeof clickOutputInvoice === "function") clickOutputInvoice();
        else document.querySelector('input[value="請求書発行"]').click();
      }),
    ]);
  } catch {
    return false;
  }

  try {
    await newPage.waitForLoadState("networkidle");
    await newPage.waitForTimeout(500);
    await newPage.emulateMedia({ media: "print" });
    await newPage.pdf({
      path: savePath,
      format: "A4",
      printBackground: true,
      margin: { top: "5mm", bottom: "5mm", left: "5mm", right: "5mm" },
    });
    await newPage.close();
    existingFiles.add(fileName);
    return true;
  } catch {
    try { await newPage.close(); } catch {}
    return false;
  }
}

/**
 * 既存PDFを再帰スキャン
 */
function scanExistingFiles(dir) {
  const files = new Set();
  if (!existsSync(dir)) return files;
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(d, entry.name));
      else if (entry.name.endsWith(".pdf")) files.add(entry.name);
    }
  }
  walk(dir);
  return files;
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  process.exit(1);
});
