"""スレッド名のステータス絵文字プレフィックス管理"""

import re
import discord

from config import STATUS_EMOJI

# ステータス絵文字パターン（既存プレフィックスを除去するため）
_EMOJI_PREFIX_RE = re.compile(r"^[🔴🟡🟢🟠]\s*")


async def update_thread_status_emoji(thread: discord.Thread, status: str):
    """スレッド名のステータス絵文字を更新する"""
    emoji = STATUS_EMOJI.get(status, "")
    if not emoji:
        return

    current_name = thread.name
    # 既存の絵文字プレフィックスを除去
    clean_name = _EMOJI_PREFIX_RE.sub("", current_name)
    new_name = f"{emoji} {clean_name}"

    if new_name != current_name:
        try:
            await thread.edit(name=new_name)
        except Exception as e:
            print(f"スレッド名変更エラー: {e}", flush=True)
