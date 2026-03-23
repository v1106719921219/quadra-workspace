"""機能4: 「確定」キーワード検知→プレビュー確認→注文登録/更新"""

import re
import discord
import httpx

from config import (
    SHIPORD_API_URL,
    SHIPORD_BASE_URL,
    DISCORD_BOT_API_KEY,
    MANAGEMENT_CHANNEL_ID,
    MANAGEMENT_SERVER_ID,
    STATUS_CONFIRMED,
)
from db.supabase import (
    get_customer_by_server_id,
    get_thread_for_today,
    get_thread_by_thread_id,
    update_thread_status,
    update_thread_status_and_order,
)
from utils.thread import update_thread_status_emoji
from handlers.inventory import update_spreadsheet_orders
from datetime import datetime
import pytz

JST = pytz.timezone("Asia/Tokyo")

ORDER_KEYWORDS = ["確定でお願いします", "確定でお願い", "これで確定", "確定で", "確定"]
KEYWORD_PATTERN = re.compile("|".join(re.escape(kw) for kw in ORDER_KEYWORDS))

SUMMARY_KEYWORDS = ["まとめ", "注文確認", "オーダー確認"]
SUMMARY_PATTERN = re.compile("|".join(re.escape(kw) for kw in SUMMARY_KEYWORDS))

# プレビューメッセージID → コンテキストのマッピング
_pending_previews: dict[int, dict] = {}

# スプレッドシート更新: メッセージID → 注文アイテム+顧客名
_pending_spreadsheet: dict[int, dict] = {}

EMOJI_TOKYO = "\U0001F5FC"      # 🗼
EMOJI_YAMAGUCHI = "\U000026E9"  # ⛩


def _contains_order_keyword(text: str) -> bool:
    return bool(KEYWORD_PATTERN.search(text))


async def _collect_conversation(channel, today_only: bool = False) -> str:
    """チャンネルの直近50件をテキスト化（today_only=Trueで本日JST分のみ）"""
    today_jst = datetime.now(JST).date() if today_only else None
    messages_text = []
    async for msg in channel.history(limit=50):
        if not msg.content:
            continue
        msg_date = msg.created_at.astimezone(JST).date()
        if today_jst and msg_date != today_jst:
            continue
        timestamp = msg.created_at.astimezone(JST).strftime("%H:%M")
        messages_text.append(f"[{timestamp}] {msg.author.display_name}: {msg.content}")
    messages_text.reverse()
    return "\n".join(messages_text)


async def _parse_chat(conversation: str, customer_id: str, preview_only: bool = True, order_id: str = None) -> dict:
    """ShipOrd APIでAI解析"""
    async with httpx.AsyncClient() as client:
        if order_id:
            # 既存注文の更新解析
            resp = await client.post(
                f"{SHIPORD_API_URL}/api/orders/{order_id}/update-from-discord-chat",
                json={
                    "text": conversation,
                    "customer_id": customer_id,
                    "preview_only": preview_only,
                },
                headers={"Authorization": f"Bearer {DISCORD_BOT_API_KEY}"},
                timeout=30,
            )
        else:
            # 新規注文の解析
            resp = await client.post(
                f"{SHIPORD_API_URL}/api/orders/parse-discord-chat",
                json={
                    "text": conversation,
                    "customer_id": customer_id,
                    "preview_only": preview_only,
                },
                headers={"Authorization": f"Bearer {DISCORD_BOT_API_KEY}"},
                timeout=30,
            )
        if resp.status_code >= 400:
            body = resp.text
            raise Exception(f"HTTP {resp.status_code}: {body}")
        return resp.json()


def _format_preview_embed(items: list, customer_name: str, is_update: bool, changes: dict = None) -> discord.Embed:
    """プレビュー用Discord Embed生成"""
    if is_update:
        embed = discord.Embed(
            title=f"📝 注文変更プレビュー | {customer_name}",
            description="以下の内容で注文を**更新**します。✅で確定してください。",
            color=0xFF8C00,  # 🟠オレンジ
        )
        # 差分情報を表示
        if changes:
            diff_lines = []
            for item in changes.get("added", []):
                diff_lines.append(f"➕ {item['product_name']} x {item['quantity']}")
            for item in changes.get("removed", []):
                diff_lines.append(f"➖ {item['product_name']} x {item['quantity']}")
            for item in changes.get("modified", []):
                diff_lines.append(
                    f"✏️ {item['product_name']} "
                    f"{item['old_quantity']}→{item['new_quantity']}"
                )
            for item in changes.get("unchanged", []):
                diff_lines.append(f"　　{item['product_name']} x {item['quantity']}")
            if diff_lines:
                embed.add_field(name="変更内容", value="\n".join(diff_lines), inline=False)
    else:
        embed = discord.Embed(
            title=f"📝 注文プレビュー | {customer_name}",
            description="以下の内容で注文を**新規登録**します。✅で確定してください。",
            color=0x3498DB,  # 青
        )

    # 商品リスト
    items_text = "\n".join(
        f"・{item['product_name']} x {item['quantity']} "
        + (f"¥{item['unit_price']:,}" if item.get("unit_price") else "（価格未定）")
        for item in items
    )
    if items_text:
        embed.add_field(name="商品", value=items_text, inline=False)

    embed.set_footer(text="✅を押すと注文が確定されます")
    return embed


async def _post_preview(
    mgmt_thread: discord.Thread,
    customer_channel,
    embed: discord.Embed,
    context: dict,
):
    """管理スレッドにプレビュー投稿 + ✅リアクション + コンテキスト保存"""
    # 同一スレッドの旧プレビューを削除
    old_ids = [
        msg_id for msg_id, ctx in _pending_previews.items()
        if ctx.get("mgmt_thread_id") == mgmt_thread.id
    ]
    for old_id in old_ids:
        del _pending_previews[old_id]

    # プレビュー投稿
    preview_msg = await mgmt_thread.send(embed=embed)
    await preview_msg.add_reaction("✅")

    # コンテキスト保存
    context["mgmt_thread_id"] = mgmt_thread.id
    _pending_previews[preview_msg.id] = context

    # 顧客に確認中通知
    if customer_channel:
        try:
            await customer_channel.send("📝 ご注文内容を確認中です。少々お待ちください。")
        except Exception:
            pass


async def handle_preview_reaction(bot, payload: discord.RawReactionActionEvent):
    """✅リアクション検知でプレビューを確定し注文作成/更新"""
    message_id = payload.message_id
    context = _pending_previews.pop(message_id, None)
    if not context:
        return

    mgmt_thread_id = context["mgmt_thread_id"]
    customer_id = context["customer_id"]
    customer_name = context["customer_name"]
    conversation = context["conversation"]
    thread_record = context["thread_record"]
    customer_channel_id = context.get("customer_channel_id")
    is_update = context.get("is_update", False)
    order_id = context.get("order_id")

    # 管理スレッド取得
    try:
        mgmt_thread = await bot.fetch_channel(mgmt_thread_id)
    except Exception as e:
        print(f"管理スレッド取得エラー: {e}", flush=True)
        return

    # 顧客チャンネル取得
    customer_channel = None
    if customer_channel_id:
        try:
            customer_channel = await bot.fetch_channel(int(customer_channel_id))
        except Exception:
            pass

    try:
        if is_update and order_id:
            await _update_existing_order(
                bot, mgmt_thread, customer_channel,
                conversation, customer_id, customer_name,
                order_id, thread_record,
            )
        else:
            await _create_new_order(
                bot, mgmt_thread, customer_channel,
                conversation, customer_id, customer_name,
                thread_record,
            )
    except Exception as e:
        await mgmt_thread.send(f"❌ 注文処理に失敗しました: {e}")
        print(f"注文処理エラー: {e}", flush=True)


async def _create_new_order(bot, mgmt_thread, customer_channel, conversation, customer_id, customer_name, thread_record):
    """ShipOrd APIで新規注文作成"""
    result = await _parse_chat(conversation, customer_id, preview_only=False)

    order_id = result.get("order_id", "")
    order_number = result.get("order_number", "---")
    items = result.get("items", [])

    items_text = "\n".join(
        f"・{item['product_name']} x {item['quantity']} "
        + (f"¥{item['unit_price']:,}" if item.get("unit_price") else "（価格未定）")
        for item in items
    )

    # 管理スレッドに確定通知
    detail_notification = (
        f"✅ 注文登録完了 | 注文番号：{order_number}\n"
        f"{items_text}\n"
        f"→ shipordで確認：{SHIPORD_BASE_URL}/orders/{order_id}"
    )
    await mgmt_thread.send(detail_notification)

    # 顧客に確定通知
    if customer_channel:
        try:
            await customer_channel.send(f"✅ ご注文を承りました（注文番号：{order_number}）")
        except Exception:
            pass

    # ステータスをconfirmed + order_id保存
    mirror_thread_id = thread_record["thread_id"]
    update_thread_status_and_order(mirror_thread_id, STATUS_CONFIRMED, order_id)
    if isinstance(mgmt_thread, discord.Thread):
        await update_thread_status_emoji(mgmt_thread, STATUS_CONFIRMED)

    # スプレッドシート更新: 発送元選択を投稿
    if items:
        await _ask_spreadsheet_location(mgmt_thread, items, customer_name)


async def _update_existing_order(bot, mgmt_thread, customer_channel, conversation, customer_id, customer_name, order_id, thread_record):
    """ShipOrd APIで既存注文差分更新"""
    result = await _parse_chat(conversation, customer_id, preview_only=False, order_id=order_id)

    order_number = result.get("order_number", "---")
    changes = result.get("changes", {})

    # 変更サマリー組み立て
    summary_lines = [f"✅ 注文更新完了 | 注文番号：{order_number}"]
    added = changes.get("added", [])
    removed = changes.get("removed", [])
    modified = changes.get("modified", [])

    if added:
        summary_lines.append("**追加:**")
        for item in added:
            summary_lines.append(f"  ➕ {item['product_name']} x {item['quantity']}")
    if removed:
        summary_lines.append("**削除:**")
        for item in removed:
            summary_lines.append(f"  ➖ {item['product_name']} x {item['quantity']}")
    if modified:
        summary_lines.append("**変更:**")
        for item in modified:
            summary_lines.append(
                f"  ✏️ {item['product_name']} "
                f"{item['old_quantity']}→{item['new_quantity']}"
            )
    if not added and not removed and not modified:
        summary_lines.append("（変更なし）")

    summary_lines.append(f"→ shipordで確認：{SHIPORD_BASE_URL}/orders/{order_id}")

    await mgmt_thread.send("\n".join(summary_lines))

    # 顧客に通知
    if customer_channel:
        try:
            await customer_channel.send(f"✅ ご注文の変更を承りました（注文番号：{order_number}）")
        except Exception:
            pass

    # ステータスをconfirmedに戻す
    mirror_thread_id = thread_record["thread_id"]
    update_thread_status(mirror_thread_id, STATUS_CONFIRMED)
    if isinstance(mgmt_thread, discord.Thread):
        await update_thread_status_emoji(mgmt_thread, STATUS_CONFIRMED)

    # スプレッドシート更新: 追加分のみ記録
    update_items = added + [
        {"product_name": m["product_name"], "quantity": m.get("new_quantity", 0)}
        for m in modified if m.get("new_quantity", 0) > m.get("old_quantity", 0)
    ]
    if update_items:
        await _ask_spreadsheet_location(mgmt_thread, update_items, customer_name)


async def _handle_order_request(bot, message, customer_id, customer_name, source_channel, mgmt_thread, customer_channel, thread_record):
    """「確定」検知時のプレビュー生成共通処理"""
    try:
        # 顧客サーバーのチャンネルから本日分のみ会話収集
        conversation = await _collect_conversation(source_channel, today_only=True)

        # 新規 or 更新の判定
        order_id = thread_record.get("order_id")
        is_update = order_id is not None

        # AI解析（preview_only）
        result = await _parse_chat(conversation, customer_id, preview_only=True, order_id=order_id if is_update else None)
        items = result.get("items", result.get("new_items", []))
        changes = result.get("changes") if is_update else None

        # プレビューEmbed生成
        embed = _format_preview_embed(items, customer_name, is_update, changes)

        # 顧客チャンネルID保存用
        customer_channel_id = str(customer_channel.id) if customer_channel else None

        # プレビュー投稿（管理スレッドに）
        await _post_preview(
            mgmt_thread,
            customer_channel,
            embed,
            {
                "customer_id": customer_id,
                "customer_name": customer_name,
                "conversation": conversation,
                "thread_record": thread_record,
                "customer_channel_id": customer_channel_id,
                "is_update": is_update,
                "order_id": order_id,
            },
        )
    except Exception as e:
        await message.channel.send(f"❌ 注文解析に失敗しました: {e}")
        print(f"注文プレビュー生成エラー: {e}", flush=True)


async def check_and_process(bot, message: discord.Message):
    """顧客サーバーで「確定」が含まれていたらプレビューを生成"""
    if not message.guild or not message.content:
        return
    if not _contains_order_keyword(message.content):
        return

    server_id = str(message.guild.id)
    mapping = get_customer_by_server_id(server_id)
    if not mapping:
        return

    # #一般チャンネルのメッセージのみ対象
    if mapping.get("general_channel_id") and str(message.channel.id) != mapping["general_channel_id"]:
        return

    customer_id = mapping["customer_id"]
    customer = mapping.get("customers", {})
    customer_name = customer.get("company_name") or customer.get("name", "不明")

    # 管理サーバーのスレッドを取得
    now_jst = datetime.now(JST)
    today = now_jst.date()
    thread_record = get_thread_for_today(server_id, today)
    if not thread_record:
        return

    mgmt_thread = None
    try:
        mgmt_thread = await bot.fetch_channel(int(thread_record["thread_id"]))
    except Exception:
        return

    await _handle_order_request(
        bot, message, customer_id, customer_name,
        message.channel, mgmt_thread, message.channel, thread_record,
    )


async def check_and_show_summary(bot, message: discord.Message):
    """管理スレッドで「まとめ」→ 現在の注文内容を一覧表示（確定はしない）"""
    if not message.content:
        return
    if not SUMMARY_PATTERN.search(message.content):
        return
    if not isinstance(message.channel, discord.Thread):
        return

    thread_id = str(message.channel.id)
    thread_record = get_thread_by_thread_id(thread_id)
    if not thread_record:
        return

    server_id = thread_record["discord_server_id"]
    customer_id = thread_record["customer_id"]

    mapping = get_customer_by_server_id(server_id)
    customer_name = "不明"

    if mapping:
        customer = mapping.get("customers", {})
        customer_name = customer.get("company_name") or customer.get("name", "不明")

    # 顧客チャンネルから会話収集
    customer_channel = None
    if mapping and mapping.get("general_channel_id"):
        try:
            customer_channel = await bot.fetch_channel(int(mapping["general_channel_id"]))
        except Exception:
            pass

    source = customer_channel if customer_channel else message.channel

    try:
        conversation = await _collect_conversation(source, today_only=True)
        result = await _parse_chat(conversation, customer_id, preview_only=True)
        items = result.get("items", [])

        embed = discord.Embed(
            title=f"📦 現在の注文内容 | {customer_name}",
            description="AIが会話から読み取った注文内容です。確定するには「確定」と入力してください。",
            color=0x9B59B6,  # 紫
        )

        if items:
            items_text = "\n".join(
                f"・{item['product_name']} x {item['quantity']} "
                + (f"¥{item['unit_price']:,}" if item.get("unit_price") else "（価格未定）")
                for item in items
            )
            embed.add_field(name=f"商品（{len(items)}件）", value=items_text, inline=False)
        else:
            embed.add_field(name="商品", value="注文内容が読み取れませんでした", inline=False)

        notes = result.get("notes")
        if notes:
            embed.add_field(name="備考", value=notes, inline=False)

        embed.set_footer(text="※ これは確認用です。注文は作成されません")
        await message.channel.send(embed=embed)

    except Exception as e:
        await message.channel.send(f"❌ まとめの取得に失敗しました: {e}")
        print(f"まとめ取得エラー: {e}", flush=True)


async def check_and_process_from_thread(bot, message: discord.Message):
    """管理スレッドで「確定」が含まれていたらプレビューを生成"""
    if not message.content:
        return
    if not _contains_order_keyword(message.content):
        return
    if not isinstance(message.channel, discord.Thread):
        return

    thread_id = str(message.channel.id)
    thread_record = get_thread_by_thread_id(thread_id)
    if not thread_record:
        return

    server_id = thread_record["discord_server_id"]
    customer_id = thread_record["customer_id"]

    # 顧客名と顧客チャンネルを取得
    mapping = get_customer_by_server_id(server_id)
    customer_name = "不明"
    customer_channel = None

    if mapping:
        customer = mapping.get("customers", {})
        customer_name = customer.get("company_name") or customer.get("name", "不明")
        if mapping.get("general_channel_id"):
            try:
                customer_channel = await bot.fetch_channel(int(mapping["general_channel_id"]))
            except Exception:
                pass

    # 顧客チャンネルから会話収集
    source = customer_channel if customer_channel else message.channel
    await _handle_order_request(
        bot, message, customer_id, customer_name,
        source, message.channel, customer_channel, thread_record,
    )


# ---- スプレッドシート更新（発送元選択） ----

async def _ask_spreadsheet_location(thread, items, customer_name):
    """注文確定後に発送元を選択するメッセージを投稿（商品ごと）"""
    if len(items) == 1:
        # 1商品なら従来通り一括選択
        item = items[0]
        msg = await thread.send(
            f"📋 スプレッドシートに記録します。発送元を選択してください。\n"
            f"商品: {item['product_name']}x{item['quantity']}\n"
            f"🗼 東京 | ⛩ 山口"
        )
        await msg.add_reaction(EMOJI_TOKYO)
        await msg.add_reaction(EMOJI_YAMAGUCHI)
        _pending_spreadsheet[msg.id] = {
            "items": [item],
            "customer_name": customer_name,
        }
    else:
        # 複数商品: 商品ごとに発送元を聞く
        for item in items:
            msg = await thread.send(
                f"📋 **{item['product_name']}** x{item['quantity']} の発送元は？\n"
                f"🗼 東京 | ⛩ 山口"
            )
            await msg.add_reaction(EMOJI_TOKYO)
            await msg.add_reaction(EMOJI_YAMAGUCHI)
            _pending_spreadsheet[msg.id] = {
                "items": [item],
                "customer_name": customer_name,
            }


async def handle_spreadsheet_reaction(bot, payload: discord.RawReactionActionEvent):
    """🗼/⛩リアクションでスプレッドシートを更新"""
    context = _pending_spreadsheet.pop(payload.message_id, None)
    if not context:
        return

    emoji = str(payload.emoji)
    if emoji == EMOJI_TOKYO:
        location = "tokyo"
        location_label = "東京"
    elif emoji == EMOJI_YAMAGUCHI:
        location = "yamaguchi"
        location_label = "山口"
    else:
        _pending_spreadsheet[payload.message_id] = context
        return

    items = context["items"]
    customer_name = context["customer_name"]

    orders = [
        {
            "product_name": item["product_name"],
            "quantity": item["quantity"],
            "company_name": customer_name,
        }
        for item in items
    ]

    result = await update_spreadsheet_orders(location, orders)

    channel = bot.get_channel(payload.channel_id)
    if not channel:
        try:
            channel = await bot.fetch_channel(payload.channel_id)
        except Exception:
            return

    if result and result.get("success"):
        updated = result.get("updated", 0)
        errors = result.get("errors", [])
        msg = f"✅ スプレッドシート更新完了（{location_label}）: {updated}件記録"
        if errors:
            msg += "\n⚠️ " + "\n⚠️ ".join(errors)
        await channel.send(msg)
    else:
        await channel.send(f"⚠️ スプレッドシート更新に失敗しました")
