"""機能2: 顧客サーバー→管理サーバーへのメッセージミラーリング"""

from __future__ import annotations
from typing import Optional, Dict, Tuple

import asyncio
import discord
from datetime import datetime
import pytz

from config import MANAGEMENT_CHANNEL_ID, STATUS_CONFIRMED, STATUS_MODIFIED
from db.supabase import (
    get_customer_by_server_id,
    get_thread_for_today,
    get_latest_open_thread,
    create_mirror_thread,
    get_thread_by_thread_id,
    update_thread_status,
    update_general_channel_id,
    try_claim_message,
)
from utils.thread import update_thread_status_emoji

JST = pytz.timezone("Asia/Tokyo")

# メモリキャッシュ: server_id -> (thread_id, date, expires_at)
_thread_cache: Dict[str, Tuple[str, str, float]] = {}
CACHE_TTL = 300  # 5分


def _get_cached_thread(server_id: str, today_str: str) -> Optional[str]:
    """キャッシュからスレッドIDを取得"""
    import time

    cached = _thread_cache.get(server_id)
    if cached and cached[1] == today_str and cached[2] > time.time():
        return cached[0]
    return None


def _set_cache(server_id: str, thread_id: str, today_str: str):
    import time

    _thread_cache[server_id] = (thread_id, today_str, time.time() + CACHE_TTL)


async def handle(bot: discord.ext.commands.Bot, message: discord.Message):
    """顧客サーバーのメッセージを管理サーバーのスレッドにミラーリング"""
    if not message.guild:
        return

    # 分散重複防止: 同じメッセージIDを2回処理しない
    claimed = await asyncio.to_thread(try_claim_message, message.id)
    if not claimed:
        print(f"[DEBUG] mirror: message_id={message.id} は処理済みのためスキップ", flush=True)
        return

    server_id = str(message.guild.id)
    now_jst = datetime.now(JST)
    today = now_jst.date()
    today_str = today.isoformat()

    # サーバー→顧客マッピング取得（同期DBコールをスレッドで実行）
    try:
        mapping = await asyncio.to_thread(get_customer_by_server_id, server_id)
    except Exception as e:
        print(f"[ERROR] get_customer_by_server_id失敗 server={server_id}: {e}", flush=True)
        return
    if not mapping:
        print(f"[DEBUG] mirror: server_id={server_id} がDBに未登録 → スキップ", flush=True)
        return

    # 価格表チャンネルは除外（Bot自動送信が多いため）
    EXCLUDED_CHANNEL_NAMES = {"プライスリスト", "pricelist-english", "pricelist", "price-list", "💎【自動応答】プライスリスト", "💎【自動応答】pricelist-english"}
    channel_name = getattr(message.channel, "name", "")
    if channel_name in EXCLUDED_CHANNEL_NAMES:
        return

    try:
        customer = mapping.get("customers", {})
        customer_name = customer.get("company_name") or customer.get("name", "不明")
        customer_id = mapping["customer_id"]

        # 管理サーバーの#注文受信チャンネル取得
        order_channel = bot.get_channel(MANAGEMENT_CHANNEL_ID)
        if not order_channel or not isinstance(order_channel, discord.TextChannel):
            print(f"[ERROR] 注文受信チャンネル取得失敗 MANAGEMENT_CHANNEL_ID={MANAGEMENT_CHANNEL_ID} ch={order_channel} type={type(order_channel).__name__}", flush=True)
            return

        # 今日のスレッドを探す（キャッシュ→DB）
        thread_id = _get_cached_thread(server_id, today_str)
        thread = None

        if thread_id:
            thread = bot.get_channel(int(thread_id))
            if thread is None:
                try:
                    thread = await bot.fetch_channel(int(thread_id))
                except Exception:
                    thread = None

        if thread is None:
            # DBから未確定スレッドを探す（日付問わず最新を優先）
            db_record = await asyncio.to_thread(get_latest_open_thread, server_id)
            if db_record:
                try:
                    thread = await bot.fetch_channel(int(db_record["thread_id"]))
                    _set_cache(server_id, db_record["thread_id"], today_str)
                    print(f"[DEBUG] mirror: 既存スレッド取得 thread_id={db_record['thread_id']} server={server_id}", flush=True)
                except Exception as e:
                    print(f"[ERROR] 既存スレッド取得失敗 thread_id={db_record['thread_id']}: {e}", flush=True)
                    thread = None

        # スレッドがなければ新規作成
        is_new_thread = thread is None
        if is_new_thread:
            thread_name = f"🔴 {customer_name} / {now_jst.strftime('%m-%d')}"
            thread = await order_channel.create_thread(
                name=thread_name,
                type=discord.ChannelType.public_thread,
                auto_archive_duration=10080,  # 7日間アーカイブしない
            )
            await asyncio.to_thread(
                create_mirror_thread,
                server_id,
                customer_id,
                today,
                str(thread.id),
                str(message.channel.id),
            )
            _set_cache(server_id, str(thread.id), today_str)

        # メッセージをスレッドに転送
        time_str = now_jst.strftime("%H:%M")
        author = message.author.display_name
        content = f"**{author}** ({customer_name} / #{channel_name} | {time_str})\n{message.content}"

        # 添付ファイルがあれば転送
        files = []
        for attachment in message.attachments:
            try:
                file = await attachment.to_file()
                files.append(file)
            except Exception:
                pass

        await thread.send(content=content, files=files if files else discord.utils.MISSING)
        print(f"[INFO] mirror: 転送完了 server={server_id} customer={customer_name} thread={thread.id}", flush=True)

        # 親チャンネルに通知（新規 or 既存スレッドへの追記）
        preview = (message.content or "（添付ファイル）")[:40]
        if is_new_thread:
            await order_channel.send(f"@everyone 📦 **{customer_name}** から新しい注文が届きました → {thread.mention}")
        else:
            await order_channel.send(f"📨 **{customer_name}** からメッセージが届きました → {thread.mention}\n> {preview}{'...' if len(message.content or '') > 40 else ''}")

        # 確定済みスレッドに顧客からメッセージ → 🟠 modified に自動遷移
        db_record = await asyncio.to_thread(get_thread_for_today, server_id, today)
        if db_record and db_record.get("status") == STATUS_CONFIRMED:
            thread_id_str = str(thread.id)
            await asyncio.to_thread(update_thread_status, thread_id_str, STATUS_MODIFIED)
            await update_thread_status_emoji(thread, STATUS_MODIFIED)
            await thread.send("⚠️ 確定済みの注文に追加メッセージがあります。内容を確認してください。")
    except Exception as e:
        import traceback
        print(f"[ERROR] ミラーリングエラー: {e}", flush=True)
        traceback.print_exc()
