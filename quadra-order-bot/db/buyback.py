"""買取スクエアDB操作（商品の表示/非表示管理）"""

from __future__ import annotations
from typing import List, Optional

from supabase import create_client
from config import (
    BUYBACK_SUPABASE_URL_TOKYO,
    BUYBACK_SUPABASE_KEY_TOKYO,
    BUYBACK_SUPABASE_URL_CHIBA,
    BUYBACK_SUPABASE_KEY_CHIBA,
)

_clients = {}


def _get_client(location: str):
    if location not in _clients:
        if location == "tokyo":
            _clients[location] = create_client(BUYBACK_SUPABASE_URL_TOKYO, BUYBACK_SUPABASE_KEY_TOKYO)
        elif location == "chiba":
            _clients[location] = create_client(BUYBACK_SUPABASE_URL_CHIBA, BUYBACK_SUPABASE_KEY_CHIBA)
    return _clients[location]


LOCATIONS = ["tokyo", "chiba"]
LOCATION_LABELS = {"tokyo": "東京", "chiba": "千葉"}


def search_products(query: str) -> List[dict]:
    """商品名で検索（東京DBから。両DB同一商品構成の前提）"""
    client = _get_client("tokyo")
    res = (
        client.table("products")
        .select("id, name, price, is_active, show_in_price_list")
        .ilike("name", f"%{query}%")
        .order("name")
        .limit(10)
        .execute()
    )
    return res.data or []


def set_show_in_price_list(product_name: str, visible: bool) -> dict:
    """両DBで商品の show_in_price_list を更新。商品名で完全一致検索。"""
    results = {}
    for loc in LOCATIONS:
        client = _get_client(loc)
        # 名前で検索
        search = client.table("products").select("id, name").eq("name", product_name).execute()
        if not search.data:
            results[loc] = {"error": "商品が見つかりません"}
            continue

        product_id = search.data[0]["id"]
        client.table("products").update({"show_in_price_list": visible}).eq("id", product_id).execute()
        results[loc] = {"success": True}

    return results
