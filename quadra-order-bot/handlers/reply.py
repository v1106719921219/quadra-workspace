"""機能3: 管理スレッド→顧客サーバーへの双方向返信（確認付き）"""

import asyncio
import re
import discord
from config import STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_MODIFIED
from db.supabase import (
    get_thread_by_thread_id,
    get_customer_by_server_id,
    update_thread_status,
    save_pending_reply,
    pop_pending_reply,
)
from utils.thread import update_thread_status_emoji

# Botコマンドキーワード（確認プロンプトを出さない）
_BOT_COMMANDS = ["確定でお願いします", "確定でお願い", "これで確定", "確定で", "確定", "まとめ", "注文確認", "オーダー確認", "在庫から作成"]
_BOT_COMMAND_RE = re.compile(
    r"^(" + "|".join(re.escape(kw) for kw in _BOT_COMMANDS) + r"|マークアップ\s*\d+|価格\s+.+\s+[\d,]+)$"
)

REPLY_CONFIRM_EMOJI = "💬"


async def handle(bot: discord.ext.commands.Bot, message: discord.Message):
    """管理スレッドへのメッセージに送信確認を表示"""
    if not isinstance(message.channel, discord.Thread):
        return

    # Botコマンドは無視
    if message.content and _BOT_COMMAND_RE.match(message.content.strip()):
        return

    thread_id = str(message.channel.id)

    # DBからスレッド→顧客サーバーマッピングを取得
    thread_record = await asyncio.to_thread(get_thread_by_thread_id, thread_id)
    if not thread_record:
        return

    # スタッフ返信: pending→in_progress / modified→in_progress
    current_status = thread_record.get("status")
    if current_status in (STATUS_PENDING, STATUS_MODIFIED):
        await asyncio.to_thread(update_thread_status, thread_id, STATUS_IN_PROGRESS)
        await update_thread_status_emoji(message.channel, STATUS_IN_PROGRESS)

    # メッセージ内容がなく添付もない場合は無視
    if not message.content and not message.attachments:
        return

    server_id = thread_record["discord_server_id"]
    mapping = await asyncio.to_thread(get_customer_by_server_id, server_id)
    if not mapping or not mapping.get("general_channel_id"):
        return

    # 送信確認プロンプト
    preview = message.content[:100] if message.content else "(添付ファイル)"
    confirm_msg = await message.channel.send(
        f"💬 顧客に送信しますか？\n> {preview}\n📤 を押すと送信されます"
    )
    await confirm_msg.add_reaction("📤")

    # コンテキストをDBに保存（bot再起動耐性）
    context = {
        "original_message_id": message.id,
        "channel_id": message.channel.id,
        "content": message.content,
        "attachment_urls": [att.url for att in message.attachments],
        "general_channel_id": mapping["general_channel_id"],
    }
    await asyncio.to_thread(save_pending_reply, confirm_msg.id, context)


async def handle_reply_reaction(bot, payload: discord.RawReactionActionEvent):
    """📤リアクションで顧客に送信（DBからコンテキスト取得）"""
    context = await asyncio.to_thread(pop_pending_reply, payload.message_id)
    if not context:
        return

    general_channel_id = int(context["general_channel_id"])
    channel = bot.get_channel(general_channel_id)
    if channel is None:
        try:
            channel = await bot.fetch_channel(general_channel_id)
        except Exception:
            return

    content = context["content"]

    # 添付ファイルを再取得
    files = []
    try:
        thread = bot.get_channel(context["channel_id"])
        if thread:
            original_msg = await thread.fetch_message(context["original_message_id"])
            for attachment in original_msg.attachments:
                try:
                    file = await attachment.to_file()
                    files.append(file)
                except Exception:
                    pass
    except Exception:
        pass

    # 請求書メッセージなら支払案内を追加
    is_invoice = content and "請求書" in content
    if is_invoice:
        content += "\n\nお支払いが完了しましたら✅スタンプを押していただけますようお願いします。スクショ等は不要です。スタンプで結構です。"

    sent_msg = await channel.send(content=content, files=files if files else discord.utils.MISSING)

    # 請求書メッセージなら✅リアクションを付ける
    if is_invoice:
        try:
            await sent_msg.add_reaction("✅")
        except Exception:
            pass

    # 元のメッセージに ✅ をつけて送信済みを明示
    try:
        thread = bot.get_channel(context["channel_id"])
        if thread:
            original_msg = await thread.fetch_message(context["original_message_id"])
            await original_msg.add_reaction("✅")
            # 確認メッセージを削除（スレッドをすっきり）
            confirm_msg = await thread.fetch_message(payload.message_id)
            await confirm_msg.delete()
    except Exception:
        pass
