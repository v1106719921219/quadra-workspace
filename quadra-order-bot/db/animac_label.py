"""animac_daily_labels テーブルの CRUD 操作"""

from __future__ import annotations
from typing import Optional, List
from datetime import date

from db.supabase import get_client


def save_label(data: dict) -> dict:
    """ラベルデータを保存"""
    res = get_client().table("animac_daily_labels").insert(data).execute()
    return res.data[0] if res.data else {}


def get_labels_by_ship_date(ship_date: date, status: str = "pending") -> List[dict]:
    """発送予定日 + ステータスでラベル取得"""
    res = (
        get_client()
        .table("animac_daily_labels")
        .select("*")
        .eq("scheduled_ship_date", ship_date.isoformat())
        .eq("status", status)
        .order("created_at")
        .execute()
    )
    return res.data or []


def get_label_by_message_id(message_id: str) -> Optional[dict]:
    """source_message_id で重複チェック"""
    res = (
        get_client()
        .table("animac_daily_labels")
        .select("id")
        .eq("source_message_id", message_id)
        .execute()
    )
    if res.data and len(res.data) > 0:
        return res.data[0]
    return None


def get_existing_order_for_ship_date(ship_date: date) -> Optional[str]:
    """発送日に既にprocessed注文があればそのshipord_order_idを返す"""
    res = (
        get_client()
        .table("animac_daily_labels")
        .select("shipord_order_id")
        .eq("scheduled_ship_date", ship_date.isoformat())
        .eq("status", "processed")
        .not_.is_("shipord_order_id", "null")
        .limit(1)
        .execute()
    )
    if res.data and len(res.data) > 0:
        return res.data[0]["shipord_order_id"]
    return None


def update_labels_status(label_ids: List[str], status: str, order_id: str = None) -> None:
    """複数ラベルのステータスを一括更新"""
    update_data = {"status": status}
    if order_id:
        update_data["shipord_order_id"] = order_id

    for label_id in label_ids:
        get_client().table("animac_daily_labels").update(update_data).eq("id", label_id).execute()
