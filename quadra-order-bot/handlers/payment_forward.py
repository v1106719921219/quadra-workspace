"""管理サーバーの「支払い依頼請求書」→「口座登録依頼」チャンネルへの自動転送 + 振込リマインド"""

from __future__ import annotations

import discord
from discord.ext import tasks
from datetime import datetime, timedelta, time
import pytz

from config import (
    BACKOFFICE_PAYMENT_CHANNEL_ID,
    PAYMENT_SOURCE_CHANNEL_ID,
    PAYMENT_REMINDER_USER_ID,
    PAYMENT_REMINDER_EMOJI,
    PAYMENT_REMINDER_HOURS,
)
from db.supabase import (
    create_payment_forward,
    mark_payment_forward_paid,
    get_pending_payment_forwards,
    mark_payment_forward_reminded,
)

JST = pytz.timezone("Asia/Tokyo")

# リマインドチェック: 毎日10:00と16:00 JST
REMINDER_TIMES = [time(hour=10, minute=0, tzinfo=JST), time(hour=16, minute=0, tzinfo=JST)]


async def handle(bot: discord.ext.commands.Bot, message: discord.Message):
    """支払い依頼請求書チャンネルのメッセージを口座登録依頼チャンネルに転送"""
    # 対象チャンネル以外は無視
    if message.channel.id != PAYMENT_SOURCE_CHANNEL_ID:
        return

    try:
        now_jst = datetime.now(JST)
        time_str = now_jst.strftime("%H:%M")
        author = message.author.display_name

        # 転送先チャンネル取得
        target_channel = bot.get_channel(BACKOFFICE_PAYMENT_CHANNEL_ID)
        if not target_channel:
            try:
                target_channel = await bot.fetch_channel(BACKOFFICE_PAYMENT_CHANNEL_ID)
            except Exception:
                print(f"[ERROR] 口座登録依頼チャンネル取得失敗: {BACKOFFICE_PAYMENT_CHANNEL_ID}", flush=True)
                return

        # メッセージ組み立て
        content = f"**{author}** ({time_str})\n口座登録をしてください。振込も速やかにお願いします。\n\n{message.content}"

        # 添付ファイル転送
        files = []
        for attachment in message.attachments:
            try:
                file = await attachment.to_file()
                files.append(file)
            except Exception:
                pass

        sent_msg = await target_channel.send(content=content, files=files if files else discord.utils.MISSING)

        # 転送記録をDBに保存（リマインド用）
        try:
            create_payment_forward(
                forwarded_message_id=str(sent_msg.id),
                source_author=author,
                forwarded_at=now_jst.isoformat(),
            )
        except Exception as e:
            print(f"[WARN] 転送記録保存失敗: {e}", flush=True)

    except Exception as e:
        import traceback
        print(f"[ERROR] 支払い転送エラー: {e}", flush=True)
        traceback.print_exc()


async def handle_paid_reaction(bot: discord.ext.commands.Bot, payload: discord.RawReactionActionEvent):
    """口座登録依頼チャンネルで振込済スタンプが押されたら記録を更新"""
    if payload.channel_id != BACKOFFICE_PAYMENT_CHANNEL_ID:
        return

    emoji = payload.emoji
    if emoji.name != PAYMENT_REMINDER_EMOJI:
        return

    try:
        mark_payment_forward_paid(str(payload.message_id))
    except Exception as e:
        print(f"[WARN] 振込済マーク更新失敗: {e}", flush=True)


def start_payment_reminder(bot: discord.ext.commands.Bot):
    """振込リマインダータスクを開始"""
    if not _payment_reminder.is_running():
        _payment_reminder.bot = bot
        _payment_reminder.start(bot)


@tasks.loop(time=REMINDER_TIMES)
async def _payment_reminder(bot: discord.ext.commands.Bot):
    """48時間以上振込済スタンプがないメッセージをリマインド"""
    now_jst = datetime.now(JST)
    cutoff = now_jst - timedelta(hours=PAYMENT_REMINDER_HOURS)

    pending = get_pending_payment_forwards(cutoff.isoformat())
    if not pending:
        return

    target_channel = bot.get_channel(BACKOFFICE_PAYMENT_CHANNEL_ID)
    if not target_channel:
        try:
            target_channel = await bot.fetch_channel(BACKOFFICE_PAYMENT_CHANNEL_ID)
        except Exception:
            return

    for record in pending:
        msg_id = record["forwarded_message_id"]
        author = record.get("source_author", "不明")

        # メッセージの実際のリアクションを再確認
        try:
            msg = await target_channel.fetch_message(int(msg_id))
            has_paid = any(
                r.emoji.name == PAYMENT_REMINDER_EMOJI
                for r in msg.reactions
                if hasattr(r.emoji, "name")
            )
            if has_paid:
                mark_payment_forward_paid(msg_id)
                continue
        except discord.NotFound:
            mark_payment_forward_reminded(msg_id)
            continue
        except Exception:
            pass

        # リマインド送信
        try:
            mention = f"<@{PAYMENT_REMINDER_USER_ID}>"
            msg_link = f"https://discord.com/channels/{target_channel.guild.id}/{target_channel.id}/{msg_id}"
            await target_channel.send(
                f"{mention} 振込が未完了です。確認をお願いします。\n"
                f"対象: {author}\n{msg_link}"
            )
            mark_payment_forward_reminded(msg_id)
        except Exception as e:
            print(f"[ERROR] 振込リマインド送信失敗: {e}", flush=True)


@_payment_reminder.before_loop
async def _before_payment_reminder():
    await _payment_reminder.bot.wait_until_ready()
