import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const BASE_URL = "https://bizsys3.s-o-b.jp/quadra-order-mng";
const LOGIN_URL = `${BASE_URL}/mng/login`;
const DETAIL_URL = `${BASE_URL}/mng/orderMng/detail/edit/1539`;
const OUT = join(process.cwd(), "invoices_pdf");
if (!existsSync(OUT)) mkdirSync(OUT);

async function main() {
  // headlessでログイン→詳細ページ→HTML保存
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
  await page.locator('input[type="text"]').first().fill("v11067");
  await page.locator('input[type="password"]').first().fill("Tessa123");
  try {
    await page.locator('button, input[type="submit"]').first().click({ timeout: 60000 });
  } catch {}
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);
  console.log("ログイン後URL:", page.url());

  // 詳細ページ
  await page.goto(DETAIL_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  console.log("詳細ページURL:", page.url());

  // ページ全体のHTMLを保存
  const html = await page.content();
  writeFileSync(join(OUT, "_debug_detail_headless.html"), html);

  // 全ボタン/リンクのテキストを取得
  const elements = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll("button, a, .btn, [onclick]").forEach((el) => {
      const text = el.textContent.trim().slice(0, 50);
      if (text) {
        results.push({
          tag: el.tagName,
          text,
          onclick: el.getAttribute("onclick")?.slice(0, 100),
          class: el.className.slice(0, 50),
        });
      }
    });
    return results;
  });
  console.log("\nページ上の操作要素:");
  elements.forEach((e) => console.log(`  ${e.tag} [${e.class}] "${e.text}" onclick="${e.onclick || ''}"`));

  await browser.close();
}

main().catch(console.error);
