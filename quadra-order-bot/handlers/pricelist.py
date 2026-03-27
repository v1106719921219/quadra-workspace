"""管理サーバー#価格表配信 → プレビュー確認 → 全顧客の#プライスリストに転送 + 英語版自動配信
   管理サーバー#価格表配信 でマークアップ設定も可能"""

import re
import httpx
import discord
from discord.ext import commands
import anthropic

from config import ANTHROPIC_API_KEY
from db.supabase import get_all_pricelist_webhooks, get_all_english_pricelist_webhooks, update_customer_markup, get_all_customers

PRICELIST_CHANNEL_NAME = "📊｜本日の価格表配信"

# プレビューメッセージID → 配信コンテキスト
_pending_pricelist: dict[int, dict] = {}

_MARKUP_RE = re.compile(r"^マークアップ\s+(.+?)\s+(\d+)$")
_MARKUP_LIST_RE = re.compile(r"^マークアップ$")


async def _translate_to_english(text: str, markup: int = 0) -> str:
    """Claude Haikuで価格表テキストを英語に翻訳 + マークアップ適用"""
    markup_instruction = ""
    if markup > 0:
        markup_instruction = f"\n\nIMPORTANT: Add ¥{markup:,} to every price. For example, if the original price is ¥10,000, output ¥{10000 + markup:,}."

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        system=f"You are a price list formatter. From the following Japanese price list, extract ONLY the product names and prices. Translate product names to English. Ignore shipping info, notes, inventory quantities, and other non-product details. If the same product appears multiple times, list it only once. Output in this format:\n\n・Product Name - ¥XX,XXX\n\nOnly output the formatted list, no explanations.{markup_instruction}",
        messages=[{"role": "user", "content": text}],
    )
    return response.content[0].text


async def handle(bot: commands.Bot, message: discord.Message):
    """管理サーバーのメッセージを処理"""
    if not isinstance(message.channel, discord.TextChannel):
        return

    if "価格表配信" in message.channel.name:
        await _handle_japanese(bot, message)


async def _handle_japanese(bot: commands.Bot, message: discord.Message):
    """#価格表配信 → 日本語+英語を一括配信（マークアップコマンドも処理）"""
    if not message.content and not message.attachments:
        return

    # マークアップ一覧表示
    if message.content and _MARKUP_LIST_RE.match(message.content.strip()):
        en_customers = get_all_english_pricelist_webhooks()
        if not en_customers:
            await message.channel.send("⚠️ 英語版価格表の登録顧客がいません")
            return
        lines = ["📋 **マークアップ設定一覧**\n"]
        for c in en_customers:
            name = c.get("company_name") or c.get("name") or "不明"
            markup = c.get("price_markup", 0) or 0
            lines.append(f"・{name}: +¥{markup:,}")
        lines.append("\n変更: `マークアップ 顧客名 金額`")
        await message.channel.send("\n".join(lines))
        return

    # マークアップ設定コマンド
    if message.content:
        match = _MARKUP_RE.match(message.content.strip())
        if match:
            customer_name = match.group(1)
            amount = int(match.group(2))
            all_customers = get_all_customers()
            customer = next(
                (c for c in all_customers if customer_name in (c.get("name", ""), c.get("company_name", ""))),
                None,
            )
            if not customer:
                customer = next(
                    (c for c in all_customers if customer_name in (c.get("company_name") or "") or customer_name in (c.get("name") or "")),
                    None,
                )
            if not customer:
                await message.channel.send(f"⚠️ 顧客「{customer_name}」が見つかりません")
                return
            update_customer_markup(customer["id"], amount)
            display = customer.get("company_name") or customer["name"]
            await message.channel.send(f"✅ {display} のマークアップを +¥{amount:,} に設定しました")
            return

    # --- 価格表配信プレビュー ---
    webhooks = get_all_pricelist_webhooks()
    en_customers = get_all_english_pricelist_webhooks()

    if not webhooks and not en_customers:
        await message.channel.send("⚠️ 配信先が0件です（日本語・英語とも未登録）")
        return

    files = []
    for att in message.attachments:
        file_bytes = await att.read()
        files.append({"name": att.filename, "bytes": file_bytes})

    embed = discord.Embed(
        title="📋 価格表配信プレビュー",
        description="以下の内容で配信します。✅で配信を実行してください。",
        color=0x3498DB,
    )

    if files:
        file_names = "\n".join(f"📎 {f['name']}" for f in files)
        embed.add_field(name="添付ファイル", value=file_names, inline=False)

    if message.content:
        embed.add_field(name="メッセージ", value=message.content[:1024], inline=False)

    # 日本語配信先
    if webhooks:
        jp_names = [wh.get("company_name") or wh.get("name") or "不明" for wh in webhooks]
        embed.add_field(
            name=f"🇯🇵 日本語配信先（{len(jp_names)}件）",
            value="\n".join(f"・{name}" for name in jp_names),
            inline=False,
        )

    # 英語版: 並列翻訳してプレビュー表示
    en_previews = []
    if en_customers and message.content:
        await message.channel.send(f"🌐 英語版を翻訳中...（{len(en_customers)}社並列）")

        import asyncio

        async def translate_one(c):
            name = c.get("company_name") or c.get("name") or "不明"
            markup = c.get("price_markup", 0) or 0
            try:
                translated = await _translate_to_english(message.content, markup)
                return {"customer": c, "name": name, "markup": markup, "translated": translated, "error": None}
            except Exception as e:
                return {"customer": c, "name": name, "markup": markup, "translated": None, "error": str(e)}

        results = await asyncio.gather(*[translate_one(c) for c in en_customers])

        for r in results:
            if r["error"]:
                await message.channel.send(f"⚠️ {r['name']} の翻訳に失敗: {r['error']}")
            else:
                en_previews.append(r)

        for p in en_previews:
            markup_label = f"（+¥{p['markup']:,}）" if p["markup"] > 0 else ""
            preview_text = p["translated"][:500] + "..." if len(p["translated"]) > 500 else p["translated"]
            await message.channel.send(f"🌐 **{p['name']}{markup_label} 英語版プレビュー:**\n{preview_text}")
    elif en_customers and not message.content:
        embed.add_field(
            name="🌐 英語版",
            value="⚠️ テキストがないため英語版はスキップされます",
            inline=False,
        )

    embed.set_footer(text="✅を押すと全顧客に配信されます")

    preview_msg = await message.channel.send(embed=embed)
    await preview_msg.add_reaction("✅")

    _pending_pricelist[preview_msg.id] = {
        "channel_id": message.channel.id,
        "content": message.content,
        "files": files,
        "webhooks": webhooks,
        "en_previews": en_previews,
    }


async def handle_pricelist_reaction(bot, payload: discord.RawReactionActionEvent):
    """✅リアクション検知で価格表を配信"""
    context = _pending_pricelist.pop(payload.message_id, None)
    if context:
        await _send_all(bot, context)
        return


async def _send_all(bot, context):
    """日本語配信 + 英語版自動翻訳配信"""
    channel = bot.get_channel(context["channel_id"])
    if not channel:
        return

    content = context["content"]
    files = context["files"]
    webhooks = context["webhooks"]

    # --- 日本語版配信 ---
    if webhooks:
        await channel.send("📤 日本語版を配信中...")

        jp_success = 0
        jp_failed = 0

        async with httpx.AsyncClient(timeout=30) as client:
            for wh in webhooks:
                url = wh["pricelist_webhook_url"]
                customer_name = wh.get("name") or wh.get("company_name") or "不明"
                try:
                    data = {}
                    if content:
                        data["content"] = content

                    webhook_files = {}
                    for i, f in enumerate(files):
                        key = f"file{i}"
                        webhook_files[key] = (f["name"], f["bytes"])

                    if webhook_files:
                        payload_json = (
                            '{"content": "' + (content or "").replace('"', '\\"') + '"}'
                            if content else '{}'
                        )
                        resp = await client.post(url, files=webhook_files, data={"payload_json": payload_json})
                    else:
                        resp = await client.post(url, json=data)

                    if resp.status_code < 300:
                        jp_success += 1
                    else:
                        jp_failed += 1
                        print(f"⚠️ 価格表配信失敗 ({customer_name}): {resp.status_code}", flush=True)
                except Exception as e:
                    jp_failed += 1
                    print(f"⚠️ 価格表配信エラー ({customer_name}): {e}", flush=True)

        result = f"✅ 日本語版配信完了: {jp_success}件成功"
        if jp_failed > 0:
            result += f" / {jp_failed}件失敗"
        await channel.send(result)

    # --- 英語版配信（翻訳済みデータを使用） ---
    en_previews = context.get("en_previews", [])
    if en_previews:
        await channel.send("🌐 英語版を配信中...")

        en_success = 0
        en_failed = 0

        async with httpx.AsyncClient(timeout=30) as client:
            for p in en_previews:
                url = p["customer"].get("english_pricelist_webhook_url")
                name = p["name"]
                if not url:
                    continue
                try:
                    resp = await client.post(url, json={"content": p["translated"]})
                    if resp.status_code < 300:
                        en_success += 1
                    else:
                        en_failed += 1
                        print(f"⚠️ 英語版配信失敗 ({name}): {resp.status_code}", flush=True)
                except Exception as e:
                    en_failed += 1
                    print(f"⚠️ 英語版配信エラー ({name}): {e}", flush=True)

        result = f"✅ 英語版配信完了: {en_success}件成功"
        if en_failed > 0:
            result += f" / {en_failed}件失敗"
        await channel.send(result)
