"""毎日16:00 JST に未処理注文スレッドのサマリーを投稿"""

from datetime import datetime, time
import discord
from discord.ext import tasks
import pytz

from config import MANAGEMENT_CHANNEL_ID, STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_MODIFIED, STATUS_EMOJI
from db.supabase import get_active_threads_for_today

JST = pytz.timezone("Asia/Tokyo")
REMINDER_TIME = time(hour=16, minute=0, tzinfo=JST)


def start_reminder(bot: discord.ext.commands.Bot):
    """リマインダータスクを開始"""
    if not _daily_reminder.is_running():
        _daily_reminder.bot = bot
        _daily_reminder.start(bot)


def stop_reminder():
    """リマインダータスクを停止"""
    if _daily_reminder.is_running():
        _daily_reminder.cancel()


@tasks.loop(time=REMINDER_TIME)
async def _daily_reminder(bot: discord.ext.commands.Bot):
    """毎日16:00 JSTに未確定スレッド一覧を投稿"""
    now_jst = datetime.now(JST)
    today = now_jst.date()

    threads = get_active_threads_for_today(today)
    if not threads:
        return  # 全件確定済みまたはスレッドなし

    # ステータス別に分類
    pending = [t for t in threads if t.get("status") == STATUS_PENDING]
    modified = [t for t in threads if t.get("status") == STATUS_MODIFIED]
    in_progress = [t for t in threads if t.get("status") == STATUS_IN_PROGRESS]

    if not pending and not modified and not in_progress:
        return

    # メッセージ組み立て
    lines = ["📋 **本日の未処理注文サマリー**\n"]

    if pending:
        lines.append(f"{STATUS_EMOJI[STATUS_PENDING]} **未処理（{len(pending)}件）**")
        for t in pending:
            customer = t.get("customers", {})
            name = customer.get("company_name") or customer.get("name", "不明")
            thread_id = t["thread_id"]
            lines.append(f"  - {name} <#{thread_id}>")
        lines.append("")

    if modified:
        lines.append(f"{STATUS_EMOJI[STATUS_MODIFIED]} **変更あり（{len(modified)}件）**")
        for t in modified:
            customer = t.get("customers", {})
            name = customer.get("company_name") or customer.get("name", "不明")
            thread_id = t["thread_id"]
            lines.append(f"  - {name} <#{thread_id}>")
        lines.append("")

    if in_progress:
        lines.append(f"{STATUS_EMOJI[STATUS_IN_PROGRESS]} **対応中（{len(in_progress)}件）**")
        for t in in_progress:
            customer = t.get("customers", {})
            name = customer.get("company_name") or customer.get("name", "不明")
            thread_id = t["thread_id"]
            lines.append(f"  - {name} <#{thread_id}>")

    # #注文受信チャンネルに投稿
    channel = bot.get_channel(MANAGEMENT_CHANNEL_ID)
    if channel:
        await channel.send("\n".join(lines))


@_daily_reminder.before_loop
async def _before_reminder():
    """Botが準備完了するまで待機"""
    await _daily_reminder.bot.wait_until_ready()
