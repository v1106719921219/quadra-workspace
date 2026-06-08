"""Quadraの価格更新 → Animac プライスリスト（box_cost_price / box_price）自動同期"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from supabase import create_client
from config import ANIMAC_SUPABASE_URL, ANIMAC_SUPABASE_KEY, ANIMAC_TENANT_ID
from db.supabase import get_animac_mapping

_animac_client = None


def _get_animac_client():
    global _animac_client
    if _animac_client is None:
        if not ANIMAC_SUPABASE_KEY:
            print("[WARN] ANIMAC_SUPABASE_KEY が未設定のため価格同期をスキップします", flush=True)
            return None
        _animac_client = create_client(ANIMAC_SUPABASE_URL, ANIMAC_SUPABASE_KEY)
    return _animac_client


def sync_price_to_animac(quadra_name: str, price: int) -> Optional[str]:
    """
    Quadraの価格をAnimacの仕入値(cost_price)に同期する。
    戻り値: 同期できた場合は商品名、できなかった場合はNone
    """
    mapping = get_animac_mapping(quadra_name)
    if not mapping:
        return None  # マッピング未登録 → スキップ

    client = _get_animac_client()
    if not client:
        return None

    animac_product_id = mapping["animac_product_id"]
    animac_product_name = mapping.get("animac_product_name", animac_product_id)

    try:
        # 現在の商品情報を取得（is_eachでBOX/Each分岐）
        res = client.table("products").select(
            "is_each, profit, cost_price, unit_price, box_profit, box_cost_price, box_price, is_ask_price, is_ask_price_box"
        ).eq("id", animac_product_id).eq("tenant_id", ANIMAC_TENANT_ID).execute()
        if not res.data:
            print(f"[WARN] Animac商品が見つかりません: {animac_product_id}", flush=True)
            return None

        current = res.data[0]

        # デバッグログ: 同期前の状態を出力
        print(f"[DEBUG] Animac同期前: {quadra_name} (id={animac_product_id}) "
              f"is_each={current.get('is_each')} "
              f"cost={current.get('cost_price')} unit={current.get('unit_price')} "
              f"box_cost={current.get('box_cost_price')} box={current.get('box_price')} "
              f"ask={current.get('is_ask_price')} ask_box={current.get('is_ask_price_box')} "
              f"→ 新価格={price:,}円", flush=True)

        if current.get("is_each"):
            # ASKに設定されている場合は同期をスキップ
            if current.get("is_ask_price"):
                print(f"[INFO] Animac価格同期スキップ(Each/ASK): {quadra_name} — ASK設定中のため同期しません", flush=True)
                return None
            # Each商品: cost_price / unit_price を更新
            profit = float(current.get("profit") or 0)
            unit_price = price + profit
            client.table("products").update({
                "cost_price": price,
                "unit_price": unit_price,
                "is_public": True,
                "price_synced_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", animac_product_id).eq("tenant_id", ANIMAC_TENANT_ID).execute()
            print(f"[INFO] Animac価格同期(Each): {quadra_name} → 仕入値={price:,}円 / 売値={unit_price:,}円", flush=True)
        else:
            # ASKに設定されている場合は同期をスキップ
            if current.get("is_ask_price_box"):
                print(f"[INFO] Animac価格同期スキップ(BOX/ASK): {quadra_name} — ASK設定中のため同期しません", flush=True)
                return None
            # BOX商品: box_cost_price / box_price を更新
            profit = float(current.get("box_profit") or 0)
            box_price = price + profit
            client.table("products").update({
                "prev_box_cost_price": float(current.get("box_cost_price") or 0),
                "prev_box_price": float(current.get("box_price") or 0),
                "box_cost_price": price,
                "box_price": box_price,
                "is_public": True,
                "price_synced_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", animac_product_id).eq("tenant_id", ANIMAC_TENANT_ID).execute()
            print(f"[INFO] Animac価格同期(BOX): {quadra_name} → 仕入値={price:,}円 / 売値={box_price:,}円", flush=True)

        return animac_product_name

    except Exception as e:
        print(f"[ERROR] Animac価格同期失敗 ({quadra_name}): {e}", flush=True)
        return None


def sync_prices_to_animac(prices: dict) -> list[tuple[str, str]]:
    """
    複数商品の価格を一括同期する。
    戻り値: [(quadra_name, animac_product_name), ...] 同期できた商品リスト
    """
    synced = []
    for quadra_name, price in prices.items():
        animac_name = sync_price_to_animac(quadra_name, price)
        if animac_name:
            synced.append((quadra_name, animac_name))
    return synced


def get_animac_products() -> list[dict]:
    """AnimacのANIMACテナントの全商品を取得（マッピング登録時の候補表示用）"""
    client = _get_animac_client()
    if not client:
        return []
    try:
        res = client.table("products").select("id, name, name_ja, unit_price, cost_price").eq("tenant_id", ANIMAC_TENANT_ID).order("name").execute()
        return res.data or []
    except Exception as e:
        print(f"[ERROR] get_animac_products失敗: {e}", flush=True)
        return []
