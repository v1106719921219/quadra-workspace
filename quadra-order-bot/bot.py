"""quadra-order-bot エントリーポイント"""

import os
import signal
import time
import atexit
import traceback
import discord
from discord.ext import commands, tasks

# ---- 多重起動防止 ----
_PID_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bot.pid")

if os.path.exists(_PID_FILE):
    try:
        with open(_PID_FILE) as _f:
            _old_pid = int(_f.read().strip())
        os.kill(_old_pid, signal.SIGTERM)
        print(f"⚠️ 旧プロセス (PID {_old_pid}) を終了しました", flush=True)
        time.sleep(1)
    except (ProcessLookupError, ValueError, PermissionError):
        pass  # 既に終了済みまたはPIDファイルが壊れている

with open(_PID_FILE, "w") as _f:
    _f.write(str(os.getpid()))

atexit.register(lambda: os.remove(_PID_FILE) if os.path.exists(_PID_FILE) else None)
# ----------------------

from datetime import datetime, timedelta, timezone
from config import DISCORD_BOT_TOKEN, MANAGEMENT_SERVER_ID, AUTO_INVITE_USER_IDS, STATUS_CONFIRMED
from db.supabase import get_thread_by_thread_id, update_thread_status, cleanup_old_pending_replies, cleanup_old_processed_messages
from utils.thread import update_thread_status_emoji
from handlers import message as message_handler
from handlers import reply as reply_handler
from handlers import order as order_handler
from handlers import pricelist as pricelist_handler
from handlers import reminder as reminder_handler
from handlers import inventory as inventory_handler
from handlers import buyback as buyback_handler
from handlers import animac_label as animac_label_handler
from handlers import payment_forward as payment_forward_handler
from handlers import qa as qa_handler

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.members = True
intents.reactions = True

bot = commands.Bot(command_prefix="!", intents=intents)

# ---- 切断ウォッチドッグ ----
_WATCHDOG_TIMEOUT = 300  # 5分以上切断でプロセス終了 → run_bot.sh が再起動
_disconnect_time = None  # type: float | None


@bot.event
async def on_disconnect():
    global _disconnect_time
    if _disconnect_time is None:
        _disconnect_time = time.time()
        print(f"[{time.strftime('%H:%M:%S')}] ⚠️ Discord接続が切断されました。{_WATCHDOG_TIMEOUT}秒以内に再接続できなければ再起動します", flush=True)


@bot.event
async def on_resumed():
    global _disconnect_time
    _disconnect_time = None  # RESUME時もタイマーリセット
    print(f"[{time.strftime('%H:%M:%S')}] ✅ Discord接続がRESUMEされました", flush=True)


@tasks.loop(seconds=60)
async def _connection_watchdog():
    global _disconnect_time
    if _disconnect_time is not None and time.time() - _disconnect_time > _WATCHDOG_TIMEOUT:
        print(f"💀 {_WATCHDOG_TIMEOUT}秒以上切断状態が続いたため再起動します", flush=True)
        os._exit(1)


# -------------------------


@bot.event
async def on_ready():
    global _disconnect_time
    _disconnect_time = None  # 接続回復 → タイマーリセット
    if not _connection_watchdog.is_running():
        _connection_watchdog.start()
    print(f"✅ {bot.user} としてログインしました", flush=True)
    print(f"参加サーバー数: {len(bot.guilds)}", flush=True)

    try:
        # スラッシュコマンド登録（on_readyが複数回呼ばれる場合は既登録をスキップ）
        from commands import setup
        if not bot.cogs.get("SetupCog"):
            await setup.setup(bot)
        # 全サーバーにコマンドを同期
        await bot.tree.sync()
        print("✅ スラッシュコマンド同期完了", flush=True)
    except Exception:
        traceback.print_exc()
        print("⚠️ スラッシュコマンド同期に失敗（Bot自体は動作中）", flush=True)

    # 管理サーバーに #本日の価格表作成 チャンネルがなければ作成
    mgmt_guild = bot.get_guild(MANAGEMENT_SERVER_ID)
    if mgmt_guild:
        ch = discord.utils.get(mgmt_guild.text_channels, name="📊｜本日の価格表作成")
        if not ch:
            try:
                await mgmt_guild.create_text_channel("📊｜本日の価格表作成")
                print("✅ #📊｜本日の価格表作成 チャンネル作成完了", flush=True)
            except Exception as e:
                print(f"⚠️ #📊｜本日の価格表作成 チャンネル作成失敗: {e}", flush=True)

    # 古いペンディング返信をクリーンアップ（48時間以上前）
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
        import asyncio
        await asyncio.to_thread(cleanup_old_pending_replies, cutoff)
        print("✅ 古いペンディング返信クリーンアップ完了", flush=True)
    except Exception as e:
        print(f"⚠️ ペンディング返信クリーンアップ失敗: {e}", flush=True)

    # 古い処理済みメッセージIDをクリーンアップ
    try:
        await asyncio.to_thread(cleanup_old_processed_messages)
        print("✅ 処理済みメッセージクリーンアップ完了", flush=True)
    except Exception as e:
        print(f"⚠️ 処理済みメッセージクリーンアップ失敗: {e}", flush=True)

    # 16:00 JST リマインダー開始
    reminder_handler.start_reminder(bot)
    print("✅ リマインダータスク開始", flush=True)

    # 振込リマインダー開始
    payment_forward_handler.start_payment_reminder(bot)
    print("✅ 振込リマインダータスク開始", flush=True)


@bot.event
async def on_message(message: discord.Message):
    if not message.author.bot and message.guild:
        print(f"[MSG] guild={message.guild.id} ch={message.channel.id}(#{getattr(message.channel,'name','')}) author={message.author.id} bot={message.author.bot}", flush=True)
    if message.author.bot:
        await animac_label_handler.handle_bot_message(bot, message)
        return
    if message.guild is None:
        return  # DMは無視

    # Q&A自動回答（管理サーバー・顧客サーバー両方で動作）
    await qa_handler.handle(bot, message)

    if message.guild.id == MANAGEMENT_SERVER_ID:
        # 管理サーバー: #価格表配信 → 在庫から作成 or 全顧客に転送
        await inventory_handler.handle(bot, message)
        await pricelist_handler.handle(bot, message)
        # 管理サーバー: スレッドへの返信→顧客サーバーに転送
        await reply_handler.handle(bot, message)
        # 管理スレッドでの「まとめ」→注文内容一覧表示
        await order_handler.check_and_show_summary(bot, message)
        # 管理スレッドでの「確定」→注文登録
        await order_handler.check_and_process_from_thread(bot, message)
        # 買取商品の表示/非表示管理
        await buyback_handler.handle(bot, message)
        # ANIMAC請求書作成トリガー
        await animac_label_handler.handle_invoice_trigger(bot, message)
        # ANIMACラベルスキャン
        await animac_label_handler.handle_scan_trigger(bot, message)
    else:
        # 顧客サーバー: メッセージをミラーリング
        await message_handler.handle(bot, message)
        # 支払い依頼請求書 → 口座登録依頼に転送
        await payment_forward_handler.handle(bot, message)

    await bot.process_commands(message)


@bot.event
async def on_raw_reaction_add(payload: discord.RawReactionActionEvent):
    # Bot自身のリアクションは無視
    if payload.user_id == bot.user.id:
        return

    # 管理サーバーでのリアクション処理
    if payload.guild_id == MANAGEMENT_SERVER_ID:
        emoji_str = str(payload.emoji)
        if emoji_str == "✅":
            await order_handler.handle_preview_reaction(bot, payload)
            await pricelist_handler.handle_pricelist_reaction(bot, payload)
            await animac_label_handler.handle_invoice_reaction(bot, payload)
        elif emoji_str == "📤":
            await reply_handler.handle_reply_reaction(bot, payload)
        elif emoji_str in ("\U0001F5FC", "\U000026E9"):  # 🗼東京 / ⛩山口
            await order_handler.handle_spreadsheet_reaction(bot, payload)
        elif emoji_str == "🟢":
            # 管理スレッドで🟢 → 手動で確定ステータスに変更
            await _handle_manual_confirm(payload)
        elif emoji_str == "❌":
            # 管理スレッドで❌ → 破談としてスレッドをアーカイブ
            await _handle_thread_cancel(payload)
        # 口座登録依頼チャンネルの振込済スタンプ（カスタム絵文字なのでemoji_strではなくnameで判定）
        await payment_forward_handler.handle_paid_reaction(bot, payload)
        return

    # 顧客サーバー: 支払い完了を示すスタンプに対応
    payment_emojis = {"✅", "☑️", "✔️", "👍", "💰", "💳"}
    if str(payload.emoji) not in payment_emojis:
        return

    try:
        channel = bot.get_channel(payload.channel_id)
        if not channel:
            return
        # 請求書＆配送ラベルチャンネルのみ
        if channel.name not in ("請求書＆配送ラベル", "💳 請求書・配送ラベル"):
            return

        user = await bot.fetch_user(payload.user_id)
        if user.bot:
            return

        # 重複送信防止: 直近5分以内に同じチャンネルへ既に送信済みか確認
        try:
            cutoff = discord.utils.utcnow() - timedelta(minutes=5)
            async for msg in channel.history(limit=20, after=cutoff):
                if msg.author.id == bot.user.id and "ありがとうございました" in msg.content:
                    return
        except Exception:
            pass

        await channel.send(f"{user.mention} お支払いありがとうございました！確認いたします。")
    except Exception as e:
        print(f"リアクション応答エラー: {e}", flush=True)


@bot.event
async def on_member_join(member: discord.Member):
    """スタッフがサーバーに参加したら自動でスタッフロールを付与"""
    if member.bot:
        return
    if member.guild.id == MANAGEMENT_SERVER_ID:
        return
    if member.id not in AUTO_INVITE_USER_IDS:
        return

    # 「スタッフ」ロールを探して付与
    staff_role = discord.utils.get(member.guild.roles, name="スタッフ")
    if staff_role:
        try:
            await member.add_roles(staff_role, reason="スタッフ自動ロール付与")
        except Exception as e:
            print(f"ロール付与エラー: {e}", flush=True)


async def _handle_manual_confirm(payload: discord.RawReactionActionEvent):
    """管理スレッドで🟢リアクション → 手動でステータスを確定に変更"""
    try:
        print(f"[DEBUG] _handle_manual_confirm: channel_id={payload.channel_id}", flush=True)
        channel = bot.get_channel(payload.channel_id)
        if not channel:
            channel = await bot.fetch_channel(payload.channel_id)
        print(f"[DEBUG] channel type={type(channel).__name__}, is_thread={isinstance(channel, discord.Thread)}", flush=True)
        if not isinstance(channel, discord.Thread):
            return

        thread_id = str(channel.id)
        thread_record = get_thread_by_thread_id(thread_id)
        print(f"[DEBUG] thread_record found={thread_record is not None}, status={thread_record.get('status') if thread_record else 'N/A'}", flush=True)
        if not thread_record:
            return

        # すでに確定済みなら何もしない
        if thread_record.get("status") == STATUS_CONFIRMED:
            return

        update_thread_status(thread_id, STATUS_CONFIRMED)
        await update_thread_status_emoji(channel, STATUS_CONFIRMED)
        await channel.send("🟢 ステータスを手動で確定に変更しました")
    except Exception as e:
        print(f"手動確定エラー: {e}", flush=True)


async def _handle_thread_cancel(payload: discord.RawReactionActionEvent):
    """管理スレッドで❌リアクション → 破談としてスレッドをアーカイブ"""
    try:
        channel = bot.get_channel(payload.channel_id)
        if not channel:
            channel = await bot.fetch_channel(payload.channel_id)
        if not isinstance(channel, discord.Thread):
            return

        thread_id = str(channel.id)
        thread_record = get_thread_by_thread_id(thread_id)
        if not thread_record:
            return

        # スレッド名を破談表示に変更してアーカイブ
        current_name = channel.name
        # 既存のステータス絵文字を除去
        for emoji in ("🔴", "🟡", "🟢", "🟠"):
            current_name = current_name.replace(emoji, "").strip()
        await channel.edit(name=f"❌ {current_name}", archived=True)
        await channel.send("❌ 破談としてクローズしました")
    except Exception as e:
        print(f"破談処理エラー: {e}", flush=True)


if __name__ == "__main__":
    bot.run(DISCORD_BOT_TOKEN)
