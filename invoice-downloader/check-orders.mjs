/**
 * 受注データの日付範囲とステータスを調査
 */
import { chromium } from "playwright";

const BASE_URL = "https://bizsys3.s-o-b.jp/quadra-order-mng";
const LOGIN_URL = `${BASE_URL}/mng/login`;
const DETAIL_URL = `${BASE_URL}/mng/orderMng/detail/edit`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  // ログイン
  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
  await page.locator('input[type="text"]').first().fill("v11067");
  await page.locator('input[type="password"]').first().fill("Tessa123");
  try { await page.locator('button, input[type="submit"]').first().click({ timeout: 60000 }); } catch {}
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);
  console.log("ログイン成功\n");

  // 請求書なしの受注をサンプルチェック（古い方から）
  console.log("===== 請求書なし受注の調査 =====");
  const checkNums = [1, 5, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 881, 900, 1000];

  for (const num of checkNums) {
    await page.goto(`${DETAIL_URL}/${num}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    const info = await page.evaluate(() => {
      const body = document.body.textContent;
      const dateMatch = body.match(/発注日時\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/);
      const statusMatch = body.match(/ステータス.*?([\u4e00-\u9fff]+済み|[\u4e00-\u9fff]+中|[\u4e00-\u9fff]+)/);
      const hasInvoice = !!document.querySelector('input[value="請求書発行"]');

      // ステータスのselect値を取得
      const statusSelect = document.querySelector('select');
      const selectedOption = statusSelect ? statusSelect.options[statusSelect.selectedIndex]?.text : null;

      // 発注IDを取得
      const idMatch = body.match(/発注ID\s*(OD_\d+)/);

      return {
        orderId: idMatch ? idMatch[1] : "不明",
        date: dateMatch ? dateMatch[1] : "不明",
        status: selectedOption || "不明",
        hasInvoiceBtn: hasInvoice,
      };
    });

    console.log(`  OD_${num}: ${info.date} | ステータス: ${info.status} | 請求書ボタン: ${info.hasInvoiceBtn ? "あり" : "なし"}`);
  }

  // 一覧で全件の日付範囲を確認
  console.log("\n===== 一覧ページで確認 =====");
  await page.goto(`${BASE_URL}/mng/orderMng/list/init`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 日付フィルタクリア＆検索
  await page.evaluate(() => {
    document.querySelectorAll('input[type="text"]').forEach(el => {
      if (el.value && /^\d{4}/.test(el.value)) {
        el.value = "";
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    document.querySelectorAll(".xdsoft_datetimepicker").forEach(el => el.style.display = "none");
    if (typeof clickSearch === "function") clickSearch();
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const totalInfo = await page.evaluate(() => {
    const body = document.body.textContent;
    const countMatch = body.match(/全(\d+)件/);
    return { total: countMatch ? countMatch[1] : "不明" };
  });
  console.log(`全件数: ${totalInfo.total}件`);

  // 最後のページに行って最古の受注を確認
  const lastPage = Math.ceil(parseInt(totalInfo.total) / 35);
  console.log(`最終ページ: ${lastPage}`);

  await page.evaluate((pn) => {
    if (typeof clickMovePage === "function") clickMovePage(pn);
  }, lastPage);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  const lastPageInfo = await page.evaluate(() => {
    const rows = document.querySelectorAll("table.table-hover tbody tr");
    const first = rows[0]?.querySelectorAll("td");
    const last = rows[rows.length - 1]?.querySelectorAll("td");
    return {
      firstId: first?.[0]?.textContent?.trim(),
      firstDate: first?.[1]?.textContent?.trim(),
      lastId: last?.[0]?.textContent?.trim(),
      lastDate: last?.[1]?.textContent?.trim(),
      rowCount: rows.length,
    };
  });
  console.log(`最終ページの最初: ${lastPageInfo.firstId} (${lastPageInfo.firstDate})`);
  console.log(`最終ページの最後: ${lastPageInfo.lastId} (${lastPageInfo.lastDate})`);

  await browser.close();
}

main().catch(console.error);
