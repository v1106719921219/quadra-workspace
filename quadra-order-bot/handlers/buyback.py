"""買取スクエア商品の表示/非表示をDiscordから管理するハンドラ

コマンド:
  非表示 商品名  → show_in_price_list=false（両DB）
  表示 商品名    → show_in_price_list=true（両DB）
  商品検索 商品名 → 商品一覧を表示
"""

from __future__ import annotations

import discord
from config import MANAGEMENT_SERVER_ID
from db.buyback import search_products, set_show_in_price_list, LOCATION_LABELS


async def handle(bot: discord.ext.commands.Bot, message: discord.Message):
    if message.guild.id != MANAGEMENT_SERVER_ID:
        return

    content = message.content.strip()

    # 非表示コマンド
    if content.startswith("非表示 ") or content.startswith("非表示　"):
        product_name = content.split(maxsplit=1)[1].strip()
        await _toggle_visibility(message, product_name, visible=False)
        return

    # 表示コマンド（「表示 」で始まり「非表示」ではない）
    if (content.startswith("表示 ") or content.startswith("表示　")) and not content.startswith("非表示"):
        product_name = content.split(maxsplit=1)[1].strip()
        await _toggle_visibility(message, product_name, visible=True)
        return

    # 商品検索コマンド
    if content.startswith("商品検索 ") or content.startswith("商品検索　"):
        query = content.split(maxsplit=1)[1].strip()
        await _search(message, query)
        return


async def _toggle_visibility(message: discord.Message, product_name: str, visible: bool):
    action = "表示" if visible else "非表示"

    # まず検索して確認
    products = search_products(product_name)
    exact = [p for p in products if p["name"] == product_name]

    if not exact:
        if products:
            lines = [f"「{product_name}」に完全一致する商品がありません。もしかして:"]
            for p in products[:5]:
                status = "表示" if p["show_in_price_list"] else "非表示"
                lines.append(f"  • {p['name']}（{p['price']:,}円 / {status}）")
            await message.reply("\n".join(lines))
        else:
            await message.reply(f"「{product_name}」に該当する商品が見つかりません")
        return

    product = exact[0]

    # 既に同じ状態なら通知
    if product["show_in_price_list"] == visible:
        await message.reply(f"「{product_name}」は既に{action}です")
        return

    # 両DBで更新
    results = set_show_in_price_list(product_name, visible)

    lines = [f"✅ 「{product_name}」を **{action}** にしました"]
    for loc, result in results.items():
        label = LOCATION_LABELS.get(loc, loc)
        if result.get("success"):
            lines.append(f"  {label}: OK")
        else:
            lines.append(f"  {label}: ⚠️ {result.get('error', '不明なエラー')}")

    await message.reply("\n".join(lines))


async def _search(message: discord.Message, query: str):
    products = search_products(query)
    if not products:
        await message.reply(f"「{query}」に該当する商品が見つかりません")
        return

    lines = [f"🔍 「{query}」の検索結果:"]
    for p in products:
        status = "✅表示" if p["show_in_price_list"] else "❌非表示"
        active = "" if p["is_active"] else "（無効）"
        lines.append(f"  • {p['name']}　{p['price']:,}円　{status}{active}")

    await message.reply("\n".join(lines))
