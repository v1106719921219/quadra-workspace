"""Q&A自動回答ハンドラ（テキストチャンネル+自動スレッド対応）
テキストチャンネルでbotにメンションされると自動でスレッドを作成し回答。
スレッド内ではメンション不要で会話を続けられる（深掘り・フォローアップ可能）。
- 管理サーバー → ShipOrd（受注管理システム）の知識で回答
- それ以外 → 買取スクエア（トレカ買取システム）の知識で回答
"""

import os
import re
import anthropic
import discord
from discord.ext import commands

from config import ANTHROPIC_API_KEY, MANAGEMENT_SERVER_ID, QA_CHANNEL_IDS

_DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs")


def _load_guide(filename: str) -> str:
    """docsディレクトリからガイドファイルを読み込む"""
    path = os.path.join(_DOCS_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


SHIPORD_SYSTEM_PROMPT = (
    "あなたはShipOrd（受注管理システム）のサポートアシスタントです。\n"
    "以下の操作ガイドに基づいて、ユーザーの質問に簡潔に回答してください。\n"
    "回答はDiscordメッセージとして適切な長さで返してください。\n"
    "わからない場合は正直にわからないと答えてください。\n\n"
    + _load_guide("shipord_guide.md")
)

BUYBACK_SYSTEM_PROMPT = (
    "あなたは買取スクエア（トレカ買取申込システム）のサポートアシスタントです。\n"
    "以下の操作ガイドに基づいて、ユーザーの質問に簡潔に回答してください。\n"
    "回答はDiscordメッセージとして適切な長さで返してください。\n"
    "わからない場合は正直にわからないと答えてください。\n\n"
    + _load_guide("buyback_guide.md")
)

# スレッド内の会話履歴取得上限
MAX_HISTORY_MESSAGES = 20


def _is_qa_channel(channel: discord.abc.Messageable) -> bool:
    """Q&A対象チャンネル（フォーラムのスレッド or 通常チャンネル）かどうか判定"""
    # フォーラムスレッドの場合: parent_idがQA_CHANNEL_IDsに含まれるか
    if isinstance(channel, discord.Thread) and channel.parent_id in QA_CHANNEL_IDS:
        return True
    # 通常チャンネルの場合
    if channel.id in QA_CHANNEL_IDS:
        return True
    return False


async def _collect_thread_history(channel: discord.Thread, bot_id: int) -> list[dict]:
    """スレッド内の会話履歴をClaude API用のmessages形式に変換"""
    messages = []
    history = []
    async for msg in channel.history(limit=MAX_HISTORY_MESSAGES, oldest_first=True):
        history.append(msg)

    for msg in history:
        # メンション除去したテキスト
        content = re.sub(r"<@!?\d+>", "", msg.content).strip()
        if not content:
            continue

        if msg.author.id == bot_id:
            role = "assistant"
        else:
            role = "user"

        # 同じロールが連続する場合はまとめる（Claude API制約）
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += f"\n{content}"
        else:
            messages.append({"role": role, "content": content})

    return messages


async def _generate_answer(bot: commands.Bot, system_prompt: str, api_messages: list[dict]) -> str:
    """Claude Haikuで回答を生成（非同期クライアント使用）"""
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=system_prompt,
        messages=api_messages,
    )
    answer = response.content[0].text
    # Discord制限: 2000文字以内に収める
    if len(answer) > 2000:
        answer = answer[:1997] + "..."
    return answer


def _get_system_prompt(guild_id: int) -> str:
    """サーバーIDに基づいてシステムプロンプトを選択"""
    if guild_id == MANAGEMENT_SERVER_ID:
        return SHIPORD_SYSTEM_PROMPT
    return BUYBACK_SYSTEM_PROMPT


async def handle(bot: commands.Bot, message: discord.Message):
    """Q&Aメッセージを処理
    - テキストチャンネルでメンション → スレッド作成して回答
    - スレッド内 → メンション不要、会話履歴付きで回答
    """
    is_in_qa_thread = (
        isinstance(message.channel, discord.Thread)
        and message.channel.parent_id in QA_CHANNEL_IDS
    )
    is_in_qa_channel = message.channel.id in QA_CHANNEL_IDS
    is_mentioned = bot.user.id in [m.id for m in message.mentions]

    # スレッド内: メンション不要で応答（bot自身のメッセージは除外済み）
    if is_in_qa_thread:
        pass  # スレッド内なら続行
    # テキストチャンネル: メンション必須
    elif is_in_qa_channel and is_mentioned:
        pass  # メンションありなので続行
    else:
        return

    # メンション部分を除去して質問テキストを抽出
    question = re.sub(r"<@!?\d+>", "", message.content).strip()
    if not question:
        return

    system_prompt = _get_system_prompt(message.guild.id)

    try:
        # テキストチャンネルでの初回質問 → スレッドを作成
        if is_in_qa_channel and not is_in_qa_thread:
            # スレッド名: 質問の先頭30文字
            thread_name = question[:30] + ("..." if len(question) > 30 else "")
            thread = await message.create_thread(name=thread_name, auto_archive_duration=1440)
            api_messages = [{"role": "user", "content": question}]
            answer = await _generate_answer(bot, system_prompt, api_messages)
            await thread.send(answer)
        else:
            # スレッド内のフォローアップ → 会話履歴付きで回答
            api_messages = await _collect_thread_history(message.channel, bot.user.id)
            if not api_messages:
                api_messages = [{"role": "user", "content": question}]
            if api_messages[0]["role"] == "assistant":
                api_messages.insert(0, {"role": "user", "content": "質問があります"})
            answer = await _generate_answer(bot, system_prompt, api_messages)
            await message.reply(answer)
    except Exception as e:
        print(f"Q&A回答エラー: {e}", flush=True)
        target = message.channel
        await target.send("⚠️ 回答の生成に失敗しました。しばらくしてからもう一度お試しください。")
