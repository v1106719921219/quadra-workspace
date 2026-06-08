"""在庫データからの価格表自動生成（自社確認用） + 受注データのスプレッドシート書き戻し"""

from __future__ import annotations
from typing import Optional, List, Dict
import json
import os
import re
import unicodedata
from datetime import datetime

import httpx
import discord
import pytz

from config import GOOGLE_APPS_SCRIPT_URL
from db.supabase import get_product_prices, get_today_product_prices, save_product_prices, get_product_sort_orders
from handlers.animac_price_sync import sync_prices_to_animac
from handlers.domestic_price_sync import sync_prices_to_domestic


class AnimacSyncConfirmView(discord.ui.View):
    """Animac同期確認ボタン（永続的View: Bot再起動後も動作）"""

    def __init__(self):
        super().__init__(timeout=None)  # 永続的（タイムアウトなし）

    @discord.ui.button(label="✅ Animacに同期する", style=discord.ButtonStyle.success, custom_id="animac_sync_all_prices")
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        try:
            await interaction.response.defer()
            import asyncio

            def _do_sync():
                from db.supabase import get_animac_mapping
                today_prices = get_today_product_prices()
                syncable = {name: price for name, price in today_prices.items() if get_animac_mapping(name)}
                synced = sync_prices_to_animac(syncable)
                return syncable, synced

            syncable, synced = await asyncio.to_thread(_do_sync)

            # 元メッセージのボタンを消す
            await interaction.edit_original_response(view=None)

            # 結果を新しいメッセージで通知
            if synced:
                lines = [f"✅ **Animac同期完了（{len(synced)}件）**"]
                for quadra_name, animac_name in synced:
                    price = syncable.get(quadra_name, 0)
                    lines.append(f"　・{quadra_name} → {animac_name}  仕入値 {price:,}円")
                await interaction.followup.send("\n".join(lines))
            else:
                await interaction.followup.send("⚠️ 同期できた商品がありませんでした（マッピング未登録）")
        except Exception as e:
            print(f"[ERROR] Animac同期ボタン処理失敗: {e}", flush=True)
            import traceback; traceback.print_exc()
            try:
                await interaction.followup.send(f"⚠️ 同期中にエラーが発生しました: {e}")
            except Exception:
                pass

    @discord.ui.button(label="キャンセル", style=discord.ButtonStyle.secondary, custom_id="animac_sync_cancel")
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        try:
            await interaction.response.defer()
            original_content = interaction.message.content if interaction.message else ""
            await interaction.edit_original_response(content=original_content + "\n　　　　↳ 同期をキャンセルしました", view=None)
        except Exception as e:
            print(f"[ERROR] Animacキャンセルボタン処理失敗: {e}", flush=True)


class DomesticSyncConfirmView(discord.ui.View):
    """国内受注サイト同期確認ボタン（永続的View: Bot再起動後も動作）"""

    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="🏠 国内サイトに同期する", style=discord.ButtonStyle.primary, custom_id="domestic_sync_all_prices")
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        try:
            await interaction.response.defer()
            import asyncio

            today_prices = await asyncio.to_thread(get_today_product_prices)
            sort_orders = await asyncio.to_thread(get_product_sort_orders)
            result = await asyncio.to_thread(sync_prices_to_domestic, today_prices, sort_orders)

            await interaction.edit_original_response(view=None)

            if result and result.get("updated", 0) > 0:
                lines = [f"✅ **国内サイト価格同期完了（{result['updated']}件）**"]
                for d in result.get("details", []):
                    lines.append(f"　・{d['name']}: {d['old_price']:,}円 → {d['new_price']:,}円")
                if result.get("not_found"):
                    lines.append(f"\n⚠️ 未登録商品（{len(result['not_found'])}件）: {', '.join(result['not_found'][:10])}")
                await interaction.followup.send("\n".join(lines))
            elif result and result.get("not_found"):
                await interaction.followup.send(
                    f"⚠️ 価格変更なし。未登録商品: {', '.join(result['not_found'][:10])}"
                )
            else:
                await interaction.followup.send("✅ 価格に変更はありませんでした（全商品同額）")
        except Exception as e:
            print(f"[ERROR] 国内同期ボタン処理失敗: {e}", flush=True)
            import traceback; traceback.print_exc()
            try:
                await interaction.followup.send(f"⚠️ 同期中にエラーが発生しました: {e}")
            except Exception:
                pass

    @discord.ui.button(label="キャンセル", style=discord.ButtonStyle.secondary, custom_id="domestic_sync_cancel")
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        try:
            await interaction.response.defer()
            original_content = interaction.message.content if interaction.message else ""
            await interaction.edit_original_response(content=original_content + "\n　　　　↳ 国内同期をキャンセルしました", view=None)
        except Exception as e:
            print(f"[ERROR] 国内キャンセルボタン処理失敗: {e}", flush=True)

JST = pytz.timezone("Asia/Tokyo")
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
PRICES_FILE = os.path.join(DATA_DIR, "prices.json")
UNITS_FILE = os.path.join(DATA_DIR, "units.json")
EXCLUDE_FILE = os.path.join(DATA_DIR, "exclude_products.txt")

INVENTORY_TRIGGERS = {"在庫から作成", "作成", "/作成", "/価格表", "価格表作成"}
PRICE_SET_RE = re.compile(r"^価格\s+(.+?)\s+([\d,]+)$")
# 価格入り価格表の検知: /(数字)円 が含まれ かつ ・ が含まれる
HAS_PRICE_RE = re.compile(r"/[\d,]+円")

# 除外する商品タイプ（BOX以外は基本除外）
EXCLUDE_TYPES = {"カートン", "アソート", "ピース"}


# ---- 除外リスト ----

def _load_exclude_keywords() -> List[str]:
    keywords = []
    if not os.path.exists(EXCLUDE_FILE):
        return keywords
    with open(EXCLUDE_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            keywords.append(line)
    return keywords


def _load_location_excludes(location_key: str) -> List[str]:
    """拠点別除外商品名リスト（完全一致）を読み込む"""
    path = os.path.join(DATA_DIR, f"exclude_products_{location_key}.txt")
    names = []
    if not os.path.exists(path):
        return names
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            names.append(line)
    return names


def _should_exclude(name: str, product_type: str, exclude_keywords: List[str], location_excludes: List[str] = None) -> bool:
    # タイプで除外
    if product_type in EXCLUDE_TYPES:
        return True
    # 拠点別除外（完全一致）
    if location_excludes and name in location_excludes:
        return True
    # キーワードで除外（商品名チェック）
    name_lower = name.lower()
    for kw in exclude_keywords:
        if kw.lower() in name_lower:
            return True
    return False


# ---- 価格ストレージ ----

def _load_prices() -> Dict[str, int]:
    return get_product_prices()


def _load_units() -> Dict[str, str]:
    if not os.path.exists(UNITS_FILE):
        return {}
    try:
        with open(UNITS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def _save_prices(prices: Dict[str, int], sort_orders: Dict[str, int] = None):
    save_product_prices(prices, sort_orders)


def _load_footer(location: str) -> str:
    filename = f"footer_{location}.txt"
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


# ---- 在庫取得 ----

async def fetch_inventory(location: str = "all") -> Optional[dict]:
    if not GOOGLE_APPS_SCRIPT_URL:
        return None
    url = f"{GOOGLE_APPS_SCRIPT_URL}?location={location}"
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            print(f"[ERROR] 在庫API応答エラー: {resp.status_code}", flush=True)
            return None
        text = resp.text.strip()
        if not text:
            print(f"[ERROR] 在庫API応答が空です (status={resp.status_code})", flush=True)
            return None
        try:
            return resp.json()
        except Exception as e:
            print(f"[ERROR] 在庫APIのJSONパース失敗: {e}\nレスポンス先頭200文字: {text[:200]}", flush=True)
            return None


# ---- 価格表フォーマット（拠点別） ----

def _format_location_pricelist(
    items: List[dict],
    prices: Dict[str, int],
    units: Dict[str, str],
    location_label: str,
    exclude_keywords: List[str],
    location_excludes: List[str] = None,
) -> Optional[str]:
    """1拠点分の価格表テキストを生成"""
    # フィルタ: 除外 + 在庫あり
    filtered = [
        item for item in items
        if not _should_exclude(item["name"], item["type"], exclude_keywords, location_excludes)
        and item["available"] > 0
    ]
    if not filtered:
        return None

    lines = [f"【{location_label}在庫商品】\n"]

    unpriced = []
    for item in filtered:
        name = item["name"]
        qty = max(item["available"], 0)
        display_name = re.sub(r'【.*?】\s*', '', name).strip()
        price = prices.get(name) or prices.get(display_name)

        if price and price > 0:
            price_str = f"{price}円"
        else:
            price_str = "円"

        lines.append(f"・{display_name}　")
        lines.append(f"在庫{qty}/{price_str}\n")

    # フッター
    location_key = "tokyo" if "東京" in location_label else "yamaguchi"
    footer = _load_footer(location_key)
    if footer:
        lines.append(footer)


    return "\n".join(lines)


# ---- メッセージハンドラ ----

async def handle(bot, message: discord.Message):
    if not isinstance(message.channel, discord.TextChannel):
        return
    if "価格表作成" not in message.channel.name:
        return

    content = message.content.strip()

    if content in INVENTORY_TRIGGERS:
        await _generate_from_inventory(bot, message)
        return

    match = PRICE_SET_RE.match(content)
    if match:
        product_name = match.group(1)
        price_value = int(match.group(2).replace(",", ""))
        await _set_price(message, product_name, price_value)
        return

    # 価格入り価格表が貼り付けられた → 全商品の価格を一括保存
    normalized = _normalize_text(content)
    if HAS_PRICE_RE.search(normalized) and re.search(r"[・•·]", normalized):
        await _save_prices_from_pricelist(message, content)
        return


async def _generate_from_inventory(bot, message: discord.Message):
    if not GOOGLE_APPS_SCRIPT_URL:
        await message.channel.send(
            "⚠️ GOOGLE_APPS_SCRIPT_URLが未設定です。"
        )
        return

    await message.channel.send("📊 在庫データを取得中...")

    try:
        data = await fetch_inventory("all")
        if not data:
            await message.channel.send("⚠️ 在庫データの取得に失敗しました")
            return
        if "error" in data:
            await message.channel.send(f"⚠️ APIエラー: {data['error']}")
            return

        exclude_keywords = _load_exclude_keywords()
        import asyncio
        prices = await asyncio.to_thread(_load_prices)
        units = _load_units()

        # 在庫データの順番からsort_orderを生成して保存
        all_items = data.get("tokyo", []) + data.get("yamaguchi", [])
        seen = set()
        sort_orders = {}
        idx = 0
        for item in all_items:
            name = item["name"]
            if name not in seen:
                seen.add(name)
                sort_orders[name] = idx
                idx += 1
        if sort_orders:
            await asyncio.to_thread(_save_prices, prices, sort_orders)

        # 東京・山口それぞれ生成
        for location_key, location_label in [("tokyo", "東京"), ("yamaguchi", "山口")]:
            items = data.get(location_key, [])
            location_excludes = _load_location_excludes(location_key)
            text = _format_location_pricelist(items, prices, units, location_label, exclude_keywords, location_excludes)
            if text:
                # 2000文字制限で分割送信
                while text:
                    chunk = text[:2000]
                    await message.channel.send(chunk)
                    text = text[2000:]

        # 国内受注サイト・Animacへの同期ボタンを表示
        from db.supabase import get_animac_mapping
        today_prices = await asyncio.to_thread(get_today_product_prices)
        syncable_animac = {name: p for name, p in today_prices.items() if get_animac_mapping(name)}
        if syncable_animac:
            animac_view = AnimacSyncConfirmView()
            await message.channel.send(
                f"🔄 Animacに {len(syncable_animac)}件の価格を同期できます",
                view=animac_view,
            )

        domestic_view = DomesticSyncConfirmView()
        await message.channel.send(
            f"🏠 国内受注サイトに価格を同期できます（{len(today_prices)}件）",
            view=domestic_view,
        )

    except Exception as e:
        import traceback
        await message.channel.send(f"⚠️ エラー: {e}")
        traceback.print_exc()


async def _set_price(message: discord.Message, product_name: str, price: int):
    prices = _load_prices()
    prices[product_name] = price
    _save_prices(prices)
    msg = f"✅ {product_name} の価格を {price:,}円 に設定しました"

    # Animacマッピングがあれば確認ボタンを表示
    from db.supabase import get_animac_mapping
    mapping = get_animac_mapping(product_name)
    if mapping:
        view = AnimacSyncConfirmView()
        msg += f"\n\n🔄 Animac同期可能: **{mapping['animac_product_name']}** → 仕入値 {price:,}円"
        await message.channel.send(msg, view=view)
    else:
        await message.channel.send(msg)

    # 国内受注サイトへの同期ボタン
    domestic_view = DomesticSyncConfirmView()
    await message.channel.send(
        f"🏠 国内受注サイトにも価格を同期できます（{product_name}: {price:,}円）",
        view=domestic_view,
    )


def _normalize_text(text: str) -> str:
    """全角英数字・記号を半角に正規化（商品名のカタカナ等は維持）"""
    # NFKC正規化: 全角英数字→半角、全角スラッシュ／→/、等
    text = unicodedata.normalize("NFKC", text)
    # ゼロ幅スペース等の不可視文字を除去（コピペ時に混入しやすい）
    text = re.sub(r"[\u200b\u200c\u200d\u2060\ufeff\u00ad\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", text)
    # 各種中黒・ビュレットを統一 (∙⦁⋅‧⸱ → ・)
    text = re.sub(r"[\u2219\u2981\u22c5\u2027\u2e31]", "・", text)
    return text


def _parse_prices_from_pricelist(text: str) -> Dict[str, int]:
    """価格表テキストから商品名と価格を一括抽出。
    対応形式1（2行）:
      ・商品名
      3箱/18500円  or  在庫20/16000円
    対応形式2（1行）:
      ・商品名　3箱/18500円  or  ・商品名　在庫20/16000円
    """
    text = _normalize_text(text)
    prices = {}
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    i = 0
    # 数量/価格 or 在庫数/価格 のパターン（在庫と数字の間のスペース許容）
    _qty_price = r"(?:在庫\s*|)\d+\S*\s*/\s*([\d,]+)\s*円"
    # 中黒の複数バリエーション対応 (・U+30FB, •U+2022, ·U+00B7)
    _bullet = r"[・•·]"
    while i < len(lines):
        line = lines[i]

        # 1行形式: ・商品名　数量/価格円
        single = re.match(r"^" + _bullet + r"(.+?)[\s　]+" + _qty_price, line)
        if single:
            name = single.group(1).strip()
            price = int(single.group(2).replace(",", ""))
            if price > 0:
                prices[name] = price
            i += 1
            continue

        # 2行形式の1行目: ・商品名
        name_match = re.match(r"^" + _bullet + r"(.+?)[\s　]*$", line)
        if name_match and i + 1 < len(lines):
            name = name_match.group(1).strip()
            price_match = re.match(r"^" + _qty_price, lines[i + 1])
            if price_match:
                price = int(price_match.group(1).replace(",", ""))
                if price > 0:
                    prices[name] = price
                i += 2
                continue

        i += 1
    return prices


async def _save_prices_from_pricelist(message: discord.Message, text: str):
    """貼り付けられた価格表から全商品の価格を保存"""
    parsed = _parse_prices_from_pricelist(text)
    if not parsed:
        # デバッグ: パース失敗時にメッセージ内容をログ出力（文字コード付き）
        normalized = _normalize_text(text)
        lines_debug = [l.strip() for l in normalized.split("\n") if l.strip()][:5]
        for j, dl in enumerate(lines_debug):
            chars = " ".join(f"U+{ord(c):04X}" for c in dl[:20])
            print(f"⚠️ パース失敗 line[{j}] repr={repr(dl[:80])} chars={chars}", flush=True)
        await message.channel.send("⚠️ 価格を解析できませんでした（形式: ・商品名 → 数量箱/価格円）")
        return
    prices = _load_prices()
    prices.update(parsed)
    _save_prices(prices)
    lines = [f"✅ {len(parsed)}商品の価格を保存しました（東京・山口共通・次回も引き継ぎ）\n"]
    for name, price in parsed.items():
        lines.append(f"・{name}: {price:,}円")

    # Animacマッピング済み商品をプレビュー表示 → 確認ボタン
    from db.supabase import get_animac_mapping
    syncable = {name: price for name, price in parsed.items() if get_animac_mapping(name)}
    if syncable:
        lines.append(f"\n🔄 Animac同期可能: {len(syncable)}件")
        view = AnimacSyncConfirmView()
        await message.channel.send("\n".join(lines), view=view)
    else:
        await message.channel.send("\n".join(lines))

    # 国内受注サイトへの同期ボタン
    domestic_view = DomesticSyncConfirmView()
    await message.channel.send(
        f"🏠 国内受注サイトにも {len(parsed)}件の価格を同期できます",
        view=domestic_view,
    )


# ---- 受注データ書き戻し ----

async def update_spreadsheet_orders(
    location: str,
    orders: List[dict],
) -> Optional[dict]:
    if not GOOGLE_APPS_SCRIPT_URL:
        return None

    payload = {
        "action": "update_orders",
        "location": location,
        "orders": orders,
    }

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.post(GOOGLE_APPS_SCRIPT_URL, json=payload)
            if resp.status_code != 200:
                print(f"[ERROR] スプレッドシート更新エラー: {resp.status_code}", flush=True)
                return None
            result = resp.json()
            if result.get("errors"):
                for err in result["errors"]:
                    print(f"[WARN] スプレッドシート更新: {err}", flush=True)
            return result
    except Exception as e:
        print(f"[ERROR] スプレッドシート更新例外: {e}", flush=True)
        return None
