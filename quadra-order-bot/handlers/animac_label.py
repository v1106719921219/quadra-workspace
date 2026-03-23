"""ANIMAC ラベル自動取込 + 請求書一括作成ハンドラ"""
from __future__ import annotations

import re
import discord
import httpx
from datetime import datetime, date
from typing import Optional
import pytz

from config import (
    ANIMAC_CUSTOMER_ID,
    ANIMAC_SERVER_ID,
    MANAGEMENT_SERVER_ID,
    MANAGEMENT_CHANNEL_ID,
    SHIPORD_API_URL,
    SHIPORD_BASE_URL,
    DISCORD_BOT_API_KEY,
)
from db.animac_label import (
    save_label,
    get_labels_by_ship_date,
    get_label_by_message_id,
    get_existing_order_for_ship_date,
    update_labels_status,
)

JST = pytz.timezone("Asia/Tokyo")

# フォーラムタグ名
TAG_INVOICED = "請求書済"


async def _ensure_forum_tag(forum: discord.ForumChannel, name: str, emoji: str = None) -> discord.ForumTag:
    """フォーラムにタグが存在しなければ作成して返す"""
    existing = discord.utils.get(forum.available_tags, name=name)
    if existing:
        return existing
    new_tag = discord.ForumTag(name=name, emoji=emoji)
    await forum.edit(available_tags=[*forum.available_tags, new_tag])
    # 再取得
    forum = await forum.guild.fetch_channel(forum.id)
    return discord.utils.get(forum.available_tags, name=name)


async def _add_forum_tag_to_thread(bot, thread_id: str, tag_name: str):
    """フォーラムスレッドにタグを追加"""
    try:
        thread = await bot.fetch_channel(int(thread_id))
        if not isinstance(thread, discord.Thread):
            return
        parent = thread.parent
        if not isinstance(parent, discord.ForumChannel):
            return
        tag = await _ensure_forum_tag(parent, tag_name, "📄" if tag_name == TAG_INVOICED else None)
        if not tag:
            return
        if tag in thread.applied_tags:
            return
        await thread.edit(applied_tags=[*thread.applied_tags, tag])
    except Exception as e:
        print(f"フォーラムタグ追加エラー ({tag_name}): {e}", flush=True)


# --- 正規表現パース（AI不使用、無料・高速・確定的） ---
RE_ORDER = re.compile(r"発送準備中:\s*(\S+)")
RE_CUSTOMER = re.compile(r"顧客:\s*(.+?)\s*\((.+?)\)")
RE_CARRIER = re.compile(r"キャリア:\s*(.+)")
RE_PRODUCT = re.compile(r"[•・]\s*(.+?)\s*x\s*(\d+)", re.IGNORECASE)
RE_TRACKING = re.compile(r"追跡番号:\s*\[?([^\]\n]+)\]?")
RE_MEMO = re.compile(r"メモ:\s*(.+?)(?=\nラベル:|\n操作:|\Z)", re.DOTALL)
RE_MEMO_DETAIL = re.compile(r"(.+?)(\d+)(箱|個|枚|セット|パック)\s*[@＠]\s*(\d[\d,]*)")
RE_SHIP_DATE = re.compile(r"発送予定日:\s*(\d{4}-\d{2}-\d{2})")

# 日付パース用: "3/13", "03/13", "2026/3/13" etc.
RE_DATE_INPUT = re.compile(r"(\d{1,4})/(\d{1,2})(?:/(\d{1,2}))?")

# プレビューメッセージID → コンテキスト
_pending_invoices: dict[int, dict] = {}

SPIDEY_BOT_NAME = "Spidey Bot"

# 発送日 → 管理スレッドIDのキャッシュ
_animac_thread_cache: dict[str, int] = {}


# ============================================================
# ユーティリティ
# ============================================================

def _parse_date_input(text: str) -> Optional[date]:
    """テキストから日付を抽出。"3/13" → 今年の3/13、"2026/3/13" → そのまま"""
    m = RE_DATE_INPUT.search(text)
    if not m:
        return None

    parts = [m.group(1), m.group(2), m.group(3)]
    now_jst = datetime.now(JST)

    if parts[2]:
        # 3パート: year/month/day or month/day/??? → year/month/day
        first = int(parts[0])
        if first > 31:
            # year/month/day
            return date(first, int(parts[1]), int(parts[2]))
        else:
            # month/day/year は想定しない → year=今年, month=first, day=parts[1]
            return date(first, int(parts[1]), int(parts[2]))
    else:
        # 2パート: month/day
        return date(now_jst.year, int(parts[0]), int(parts[1]))


# ============================================================
# 管理スレッド管理
# ============================================================

async def _get_or_create_animac_thread(bot, ship_date_str: Optional[str]) -> discord.Thread | None:
    """発送日ごとのANIMACスレッドを取得or作成（#注文受信に他の顧客と同じ形式で）"""
    if not ship_date_str:
        ship_date_str = datetime.now(JST).date().isoformat()

    # キャッシュチェック
    cached_id = _animac_thread_cache.get(ship_date_str)
    if cached_id:
        thread = bot.get_channel(cached_id)
        if thread:
            return thread
        try:
            thread = await bot.fetch_channel(cached_id)
            return thread
        except Exception:
            del _animac_thread_cache[ship_date_str]

    # #注文受信チャンネル取得
    order_channel = bot.get_channel(MANAGEMENT_CHANNEL_ID)
    if not order_channel or not isinstance(order_channel, discord.TextChannel):
        return None

    # 既存スレッド検索（名前にANIMACと発送日を含む）
    try:
        ship_date = date.fromisoformat(ship_date_str)
    except ValueError:
        return None

    date_label = ship_date.strftime("%m/%d")
    thread_prefix = f"ANIMAC / {date_label}"

    for thread in order_channel.threads:
        if thread_prefix in thread.name:
            _animac_thread_cache[ship_date_str] = thread.id
            return thread

    # アーカイブ済みも検索
    async for thread in order_channel.archived_threads(limit=50):
        if thread_prefix in thread.name:
            _animac_thread_cache[ship_date_str] = thread.id
            return thread

    # 新規作成
    thread_name = f"🔴 {thread_prefix} (発送)"
    thread = await order_channel.create_thread(
        name=thread_name,
        type=discord.ChannelType.public_thread,
        auto_archive_duration=1440,
    )
    _animac_thread_cache[ship_date_str] = thread.id
    return thread


# ============================================================
# パース関数
# ============================================================

def _is_label_forum(message: discord.Message) -> bool:
    """Threadの親がForumChannel名"ラベル"かチェック"""
    if not isinstance(message.channel, discord.Thread):
        return False
    parent = message.channel.parent
    if parent is None:
        return False
    if not isinstance(parent, discord.ForumChannel):
        return False
    return "ラベル" in parent.name


def _extract_text_from_message(message: discord.Message) -> str:
    """message.content + embed内容を結合してテキスト化"""
    parts = []
    if message.content:
        parts.append(message.content)
    for embed in message.embeds:
        if embed.title:
            parts.append(embed.title)
        if embed.description:
            parts.append(embed.description)
        for field in embed.fields:
            # フィールド名と値を "名前: 値" 形式で結合（正規表現がマッチするように）
            if field.name and field.value:
                parts.append(f"{field.name}: {field.value}")
            elif field.name:
                parts.append(field.name)
            elif field.value:
                parts.append(field.value)
    return "\n".join(parts)


def parse_label_post(text: str) -> dict:
    """構造化テキストをdict化"""
    result = {}

    m = RE_ORDER.search(text)
    if m:
        result["order_ref"] = m.group(1)

    m = RE_CUSTOMER.search(text)
    if m:
        result["customer_name"] = m.group(1).strip()
        result["country"] = m.group(2).strip()

    m = RE_CARRIER.search(text)
    if m:
        result["carrier"] = m.group(1).strip()

    # 複数商品対応
    products = RE_PRODUCT.findall(text)
    if products:
        # 最初の商品をメインとして保持（後方互換）
        result["product_name_en"] = products[0][0].strip()
        result["quantity"] = sum(int(q) for _, q in products)
        # 全商品リストも保持
        result["products"] = [
            {"name": name.strip(), "quantity": int(qty)}
            for name, qty in products
        ]

    m = RE_TRACKING.search(text)
    if m:
        tracking_str = m.group(1).strip()
        result["tracking_numbers"] = [t.strip() for t in tracking_str.split(",")]

    m = RE_SHIP_DATE.search(text)
    if m:
        result["scheduled_ship_date"] = m.group(1)

    m = RE_MEMO.search(text)
    if m:
        result["memo"] = m.group(1).strip()
        memo_parsed = parse_memo(result["memo"])
        result.update(memo_parsed)

    return result


def parse_memo(memo: str) -> dict:
    """メモから商品名・数量・単価を抽出
    例: "忍者50箱　@12500 / 25箱ずつ2梱包"
    → product_name_jp="忍者", quantity_jp=50, unit_price=12500, memo_extra="25箱ずつ2梱包"
    """
    result = {}

    m = RE_MEMO_DETAIL.search(memo)
    if m:
        result["product_name_jp"] = m.group(1).strip()
        result["quantity_jp"] = int(m.group(2))
        unit_str = m.group(4).replace(",", "")
        result["unit_price"] = int(unit_str)

    # "/" 以降を extra として保持
    parts = memo.split("/")
    if len(parts) > 1:
        result["memo_extra"] = "/".join(parts[1:]).strip()

    return result


# ============================================================
# Bot投稿検知 → 解析 → DB保存 → 管理サーバー通知
# ============================================================

async def handle_bot_message(bot, message: discord.Message):
    """bot.pyから呼出。#ラベルフォーラムのSpidey Bot投稿を検知・解析・保存"""
    # ANIMACサーバーでなければ無視
    if not message.guild or message.guild.id != ANIMAC_SERVER_ID:
        return

    # #ラベルフォーラムでなければ無視
    if not _is_label_forum(message):
        return

    # Spidey Bot以外は無視
    if SPIDEY_BOT_NAME not in message.author.display_name:
        return

    # メッセージ本文 + Embed内容を結合
    full_text = _extract_text_from_message(message)

    # 「発送準備中」を含まなければ無視（ラベル投稿以外のBotメッセージ除外）
    if "発送準備中" not in full_text:
        return

    # 重複チェック（source_message_id UNIQUE）
    msg_id = str(message.id)
    if get_label_by_message_id(msg_id):
        return

    # テキスト解析
    parsed = parse_label_post(full_text)
    if not parsed.get("order_ref"):
        return

    # 添付ファイル（ラベルPDF）のURL取得
    label_urls = [
        att.url for att in message.attachments
        if att.filename.lower().endswith((".pdf", ".png", ".jpg", ".jpeg"))
    ]

    # DB保存
    now_jst = datetime.now(JST)
    label_data = {
        "label_date": now_jst.date().isoformat(),
        "order_ref": parsed.get("order_ref", ""),
        "customer_name": parsed.get("customer_name"),
        "country": parsed.get("country"),
        "carrier": parsed.get("carrier"),
        "product_name_en": parsed.get("product_name_en"),
        "quantity": parsed.get("quantity"),
        "tracking_numbers": parsed.get("tracking_numbers", []),
        "memo": parsed.get("memo"),
        "product_name_jp": parsed.get("product_name_jp"),
        "quantity_jp": parsed.get("quantity_jp"),
        "unit_price": parsed.get("unit_price"),
        "memo_extra": parsed.get("memo_extra"),
        "label_pdf_urls": label_urls,
        "scheduled_ship_date": parsed.get("scheduled_ship_date"),
        "source_thread_id": str(message.channel.id),
        "source_message_id": msg_id,
    }

    try:
        save_label(label_data)
    except Exception as e:
        print(f"ANIMAC ラベル保存エラー: {e}", flush=True)
        return

    # 管理サーバーの#注文受信にスレッド投稿（他の顧客と同じ形式）
    ship_date = parsed.get("scheduled_ship_date")
    product_name = parsed.get("product_name_jp") or parsed.get("product_name_en", "不明")
    qty = parsed.get("quantity_jp") or parsed.get("quantity", "?")
    price = parsed.get("unit_price")
    price_str = f" @¥{price:,}" if price else ""

    try:
        thread = await _get_or_create_animac_thread(bot, ship_date)
        if thread:
            customer = parsed.get("customer_name", "")
            country = parsed.get("country", "")
            carrier = parsed.get("carrier", "")
            tracking = parsed.get("tracking_numbers", [])
            tracking_str = ", ".join(tracking[:2])
            if len(tracking) > 2:
                tracking_str += f" +{len(tracking) - 2}"

            lines = [
                f"📦 **{product_name} x{qty}{price_str}**",
                f"顧客: {customer} ({country})" if customer else None,
                f"キャリア: {carrier}" if carrier else None,
                f"追跡: {tracking_str}" if tracking_str else None,
                f"メモ: {parsed.get('memo', '')}" if parsed.get("memo") else None,
            ]
            await thread.send("\n".join(l for l in lines if l))
    except Exception as e:
        print(f"ANIMAC 通知エラー: {e}", flush=True)


# ============================================================
# 共通: プレビューEmbed生成
# ============================================================

def _build_preview_embed(labels: list, target_date: date, is_append: bool = False) -> discord.Embed:
    """ラベル一覧からプレビューEmbedを生成"""
    action = "追加" if is_append else "請求書作成"
    embed = discord.Embed(
        title=f"📋 ANIMAC {action}プレビュー | 発送日 {target_date.strftime('%Y/%m/%d')}",
        description=f"**{len(labels)}件** のラベルで{'既存注文に追加' if is_append else '注文を新規作成'}します。",
        color=0xFF8C00 if is_append else 0x3498DB,
    )

    total_amount = 0
    items_lines = []
    for label in labels:
        name = label.get("product_name_jp") or label.get("product_name_en") or "不明"
        qty = label.get("quantity_jp") or label.get("quantity") or 0
        price = label.get("unit_price") or 0
        subtotal = qty * price
        total_amount += subtotal

        price_str = f"¥{price:,}" if price else "価格未定"
        items_lines.append(f"・{name} x{qty}  {price_str}")

        customer = label.get("customer_name", "")
        tracking = label.get("tracking_numbers") or []
        if customer:
            tracking_preview = ", ".join(tracking[:2])
            suffix = f" +{len(tracking) - 2}" if len(tracking) > 2 else ""
            items_lines.append(f"　└ {customer} [{tracking_preview}{suffix}]")

    embed.add_field(name="商品", value="\n".join(items_lines) or "なし", inline=False)

    if total_amount:
        embed.add_field(name="合計金額", value=f"**¥{total_amount:,}**", inline=False)

    footer = "✅を押すと"
    footer += "既存注文に追加・ラベル添付・請求書再生成" if is_append else "注文作成・ラベル添付・請求書生成"
    footer += "を実行します"
    embed.set_footer(text=footer)

    return embed


# ============================================================
# 「animacスキャン」→ フォーラムの既存ラベルを一括取込
# ============================================================

async def handle_scan_trigger(bot, message: discord.Message):
    """管理サーバーで「animacスキャン」を検知 → フォーラムの既存ラベルを取込"""
    if not message.content:
        return
    if not message.guild or message.guild.id != MANAGEMENT_SERVER_ID:
        return

    normalized = message.content.lower().replace(" ", "").replace("　", "")
    if "animacスキャン" not in normalized:
        return

    await message.channel.send("🔍 ANIMACラベルフォーラムをスキャン中...")

    # ANIMACサーバーのラベルフォーラムを取得
    animac_guild = bot.get_guild(ANIMAC_SERVER_ID)
    if not animac_guild:
        try:
            animac_guild = await bot.fetch_guild(ANIMAC_SERVER_ID)
        except Exception:
            await message.channel.send("❌ ANIMACサーバーが見つかりません")
            return

    forum_channel = None
    for ch in await animac_guild.fetch_channels():
        if isinstance(ch, discord.ForumChannel) and "ラベル" in ch.name:
            forum_channel = ch
            break

    if not forum_channel:
        await message.channel.send("❌ ラベルフォーラムが見つかりません")
        return

    imported = 0
    skipped = 0
    errors = 0

    # アクティブスレッド + アーカイブ済みスレッドをスキャン
    all_threads = list(forum_channel.threads)
    async for thread in forum_channel.archived_threads(limit=100):
        all_threads.append(thread)

    for thread in all_threads:
        try:
            # スレッドの最初のメッセージ（スターターメッセージ）を取得
            starter = thread.starter_message
            if not starter:
                starter = await thread.fetch_message(thread.id)

            if not starter or not starter.author.bot:
                continue
            if SPIDEY_BOT_NAME not in starter.author.display_name:
                continue

            # 重複チェック
            msg_id = str(starter.id)
            if get_label_by_message_id(msg_id):
                skipped += 1
                continue

            # Embed内容を抽出
            full_text = _extract_text_from_message(starter)
            if "発送準備中" not in full_text:
                continue

            parsed = parse_label_post(full_text)
            if not parsed.get("order_ref"):
                continue

            # 添付ファイル取得
            label_urls = [
                att.url for att in starter.attachments
                if att.filename.lower().endswith((".pdf", ".png", ".jpg", ".jpeg"))
            ]

            now_jst = datetime.now(JST)
            label_data = {
                "label_date": now_jst.date().isoformat(),
                "order_ref": parsed.get("order_ref", ""),
                "customer_name": parsed.get("customer_name"),
                "country": parsed.get("country"),
                "carrier": parsed.get("carrier"),
                "product_name_en": parsed.get("product_name_en"),
                "quantity": parsed.get("quantity"),
                "tracking_numbers": parsed.get("tracking_numbers", []),
                "memo": parsed.get("memo"),
                "product_name_jp": parsed.get("product_name_jp"),
                "quantity_jp": parsed.get("quantity_jp"),
                "unit_price": parsed.get("unit_price"),
                "memo_extra": parsed.get("memo_extra"),
                "label_pdf_urls": label_urls,
                "scheduled_ship_date": parsed.get("scheduled_ship_date"),
                "source_thread_id": str(thread.id),
                "source_message_id": msg_id,
            }

            save_label(label_data)
            imported += 1

        except Exception as e:
            errors += 1
            print(f"ANIMACスキャンエラー (thread {thread.id}): {e}", flush=True)

    await message.channel.send(
        f"✅ スキャン完了: {imported}件取込 / {skipped}件スキップ（取込済み）"
        + (f" / {errors}件エラー" if errors else "")
    )


# ============================================================
# 「animac請求書作成 [日付]」→ 新規注文プレビュー
# ============================================================

async def handle_invoice_trigger(bot, message: discord.Message):
    """管理サーバーで「animac請求書作成」or「animac請求書追加」を検知"""
    if not message.content:
        return
    if not message.guild or message.guild.id != MANAGEMENT_SERVER_ID:
        return

    normalized = message.content.lower().replace(" ", "").replace("　", "")
    print(f"[DEBUG] handle_invoice_trigger: normalized='{normalized}'", flush=True)

    is_append = "animac請求書追加" in normalized
    is_create = "animac請求書作成" in normalized

    if not is_append and not is_create:
        return

    # 日付パース（指定なしなら当日JST）
    target_date = _parse_date_input(message.content)
    if not target_date:
        target_date = datetime.now(JST).date()

    # 未処理ラベル取得
    labels = get_labels_by_ship_date(target_date, status="pending")

    if not labels:
        await message.channel.send(
            f"📭 発送日 {target_date.strftime('%Y/%m/%d')} の未処理ANIMACラベルはありません"
        )
        return

    # 追加モード: 既存注文があるか確認
    existing_order_id = None
    if is_append:
        existing_order_id = get_existing_order_for_ship_date(target_date)
        if not existing_order_id:
            await message.channel.send(
                f"⚠️ 発送日 {target_date.strftime('%Y/%m/%d')} の既存注文がありません。「animac請求書作成 {target_date.month}/{target_date.day}」で新規作成してください。"
            )
            return

    # #注文受信のANIMACスレッドにプレビュー投稿
    thread = await _get_or_create_animac_thread(bot, target_date.isoformat())
    post_channel = thread if thread else message.channel

    embed = _build_preview_embed(labels, target_date, is_append=is_append)
    preview_msg = await post_channel.send(embed=embed)
    await preview_msg.add_reaction("✅")

    _pending_invoices[preview_msg.id] = {
        "labels": labels,
        "channel_id": post_channel.id,
        "target_date": target_date.isoformat(),
        "is_append": is_append,
        "existing_order_id": existing_order_id,
    }


# ============================================================
# ✅リアクション → 注文作成/追加 + ラベル添付 + 請求書生成
# ============================================================

async def handle_invoice_reaction(bot, payload: discord.RawReactionActionEvent):
    """✅で注文作成or追加 + ラベルPDF添付 + 請求書PDF生成"""
    context = _pending_invoices.pop(payload.message_id, None)
    if not context:
        return

    labels = context["labels"]
    channel_id = context["channel_id"]
    is_append = context.get("is_append", False)
    existing_order_id = context.get("existing_order_id")

    channel = bot.get_channel(channel_id)
    if not channel:
        try:
            channel = await bot.fetch_channel(channel_id)
        except Exception:
            return

    action_name = "追加" if is_append else "請求書作成"
    await channel.send(f"⏳ ANIMAC {action_name}を開始します...")

    try:
        # メモテキストを結合
        memo_lines = []
        for label in labels:
            memo = label.get("memo", "")
            if memo:
                memo_lines.append(memo)
            else:
                name = label.get("product_name_en", "商品")
                qty = label.get("quantity", 1)
                memo_lines.append(f"{name} x{qty}")

        conversation_text = "\n".join(memo_lines)

        async with httpx.AsyncClient() as client:
            if is_append and existing_order_id:
                # --- 既存注文に追加 ---
                resp = await client.post(
                    f"{SHIPORD_API_URL}/api/orders/{existing_order_id}/update-from-discord-chat",
                    json={
                        "text": conversation_text,
                        "customer_id": ANIMAC_CUSTOMER_ID,
                        "preview_only": False,
                    },
                    headers={"Authorization": f"Bearer {DISCORD_BOT_API_KEY}"},
                    timeout=30,
                )
                resp.raise_for_status()
                order_result = resp.json()
                order_id = existing_order_id
                order_number = order_result.get("order_number", "---")
                await channel.send(f"✅ 注文追加完了: **{order_number}**")
            else:
                # --- 新規注文作成 ---
                resp = await client.post(
                    f"{SHIPORD_API_URL}/api/orders/parse-discord-chat",
                    json={
                        "text": conversation_text,
                        "customer_id": ANIMAC_CUSTOMER_ID,
                        "preview_only": False,
                    },
                    headers={"Authorization": f"Bearer {DISCORD_BOT_API_KEY}"},
                    timeout=30,
                )
                resp.raise_for_status()
                order_result = resp.json()
                order_id = order_result.get("order_id", "")
                order_number = order_result.get("order_number", "---")
                await channel.send(f"✅ 注文作成完了: **{order_number}**")

            # --- ラベルPDFダウンロード → shipordにアップロード ---
            label_count = 0
            for label in labels:
                for url in (label.get("label_pdf_urls") or []):
                    try:
                        pdf_resp = await client.get(url, timeout=30, follow_redirects=True)
                        pdf_resp.raise_for_status()

                        filename = url.split("/")[-1].split("?")[0] or "label.pdf"
                        content_type = pdf_resp.headers.get("content-type", "application/pdf")

                        files = {"image": (filename, pdf_resp.content, content_type)}
                        data = {"orderId": order_id}

                        upload_resp = await client.post(
                            f"{SHIPORD_API_URL}/api/shipping/label",
                            files=files,
                            data=data,
                            headers={"Authorization": f"Bearer {DISCORD_BOT_API_KEY}"},
                            timeout=60,
                        )
                        upload_resp.raise_for_status()
                        label_count += 1
                    except Exception as e:
                        print(f"ANIMAC ラベルアップロードエラー: {e}", flush=True)

            if label_count:
                await channel.send(f"📎 ラベル {label_count}件 添付完了")

        # --- DBステータス更新 ---
        label_ids = [label["id"] for label in labels]
        update_labels_status(label_ids, "processed", order_id)

        # --- フォーラムタグ「請求書済」を各ラベルスレッドに追加 ---
        tagged_threads = set()
        for label in labels:
            tid = label.get("source_thread_id")
            if tid and tid not in tagged_threads:
                await _add_forum_tag_to_thread(bot, tid, TAG_INVOICED)
                tagged_threads.add(tid)

        # --- 完了サマリー ---
        items = order_result.get("items", [])
        items_text = "\n".join(
            f"・{item['product_name']} x {item['quantity']} "
            + (f"¥{item['unit_price']:,}" if item.get("unit_price") else "")
            for item in items
        )

        embed = discord.Embed(
            title=f"✅ ANIMAC {'追加' if is_append else '請求書'}処理完了",
            description=f"注文番号: **{order_number}**\nラベル: {label_count}件添付",
            color=0x22C55E,
        )
        if items_text:
            embed.add_field(name="商品", value=items_text, inline=False)
        embed.add_field(
            name="shipord",
            value=f"{SHIPORD_BASE_URL}/orders/{order_id}",
            inline=False,
        )
        await channel.send(embed=embed)

    except Exception as e:
        await channel.send(f"❌ ANIMAC {action_name}に失敗しました: {e}")
        print(f"ANIMAC {action_name}エラー: {e}", flush=True)
