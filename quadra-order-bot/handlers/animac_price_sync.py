"""Quadraの価格更新 → Animac プライスリスト（cost_price / unit_price）自動同期"""

from __future__ import annotations
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
        # 現在のprofitを取得
        res = client.table("products").select("profit").eq("id", animac_product_id).eq("tenant_id", ANIMAC_TENANT_ID).execute()
        if not res.data:
            print(f"[WARN] Animac商品が見つかりません: {animac_product_id}", flush=True)
            return None

        profit = float(res.data[0].get("profit") or 0)
        unit_price = price + profit

        # cost_price と unit_price を更新
        client.table("products").update({
            "cost_price": price,
            "unit_price": unit_price,
        }).eq("id", animac_product_id).eq("tenant_id", ANIMAC_TENANT_ID).execute()

        print(f"[INFO] Animac価格同期: {quadra_name} → 仕入値={price:,}円 / 売値={unit_price:,}円", flush=True)
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
