from __future__ import annotations
from typing import Optional, List

from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY
from datetime import date, datetime, timezone

_client = None


def get_client():
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


# --- discord_server_customers ---

def get_customer_by_server_id(server_id: str) -> Optional[dict]:
    """DiscordサーバーIDから顧客マッピングを取得"""
    res = (
        get_client()
        .table("discord_server_customers")
        .select("*, customers(*)")
        .eq("discord_server_id", server_id)
        .execute()
    )
    if res.data and len(res.data) > 0:
        return res.data[0]
    return None


def update_general_channel_id(server_id: str, channel_id: str) -> None:
    """general_channel_idを更新（チャンネル名変更時の自動修正用）"""
    get_client().table("discord_server_customers").update(
        {"general_channel_id": channel_id}
    ).eq("discord_server_id", server_id).execute()


def upsert_server_customer(
    server_id: str,
    server_name: str,
    customer_id: str,
    general_channel_id: Optional[str] = None,
    invoice_channel_id: Optional[str] = None,
    label_channel_id: Optional[str] = None,
    pricelist_channel_id: Optional[str] = None,
) -> dict:
    """サーバー↔顧客マッピングを登録/更新"""
    data = {
        "discord_server_id": server_id,
        "discord_server_name": server_name,
        "customer_id": customer_id,
        "general_channel_id": general_channel_id,
        "invoice_channel_id": invoice_channel_id,
        "label_channel_id": label_channel_id,
    }
    if pricelist_channel_id is not None:
        data["pricelist_channel_id"] = pricelist_channel_id
    res = (
        get_client()
        .table("discord_server_customers")
        .upsert(data, on_conflict="discord_server_id")
        .execute()
    )
    return res.data[0]


# --- discord_mirror_threads ---

def get_thread_for_today(server_id: str, thread_date: date) -> Optional[dict]:
    """今日のミラースレッドを取得"""
    res = (
        get_client()
        .table("discord_mirror_threads")
        .select("*")
        .eq("discord_server_id", server_id)
        .eq("thread_date", thread_date.isoformat())
        .execute()
    )
    if res.data and len(res.data) > 0:
        return res.data[0]
    return None


def create_mirror_thread(
    server_id: str,
    customer_id: str,
    thread_date: date,
    thread_id: str,
    source_channel_id: Optional[str] = None,
) -> dict:
    """ミラースレッドレコードを作成"""
    res = (
        get_client()
        .table("discord_mirror_threads")
        .insert(
            {
                "discord_server_id": server_id,
                "customer_id": customer_id,
                "thread_date": thread_date.isoformat(),
                "thread_id": thread_id,
                "source_channel_id": source_channel_id,
            }
        )
        .execute()
    )
    return res.data[0]


def get_thread_by_thread_id(thread_id: str) -> Optional[dict]:
    """DiscordスレッドIDからミラースレッドレコードを取得"""
    res = (
        get_client()
        .table("discord_mirror_threads")
        .select("*, customers(*)")
        .eq("thread_id", thread_id)
        .execute()
    )
    if res.data and len(res.data) > 0:
        return res.data[0]
    return None


def update_thread_status(thread_id: str, status: str) -> Optional[dict]:
    """スレッドのステータスを更新"""
    res = (
        get_client()
        .table("discord_mirror_threads")
        .update({"status": status})
        .eq("thread_id", thread_id)
        .execute()
    )
    if res.data and len(res.data) > 0:
        return res.data[0]
    return None


def get_latest_open_thread(server_id: str) -> Optional[dict]:
    """顧客サーバーの最新の未確定スレッドを取得（日付問わず）"""
    res = (
        get_client()
        .table("discord_mirror_threads")
        .select("*")
        .eq("discord_server_id", server_id)
        .neq("status", "confirmed")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if res.data and len(res.data) > 0:
        return res.data[0]
    return None


def get_active_threads_for_today(thread_date: date) -> List[dict]:
    """未確定スレッド（pending / in_progress / modified）を取得（直近2日）"""
    from datetime import timedelta
    cutoff = (thread_date - timedelta(days=2)).isoformat()
    res = (
        get_client()
        .table("discord_mirror_threads")
        .select("*, customers(*)")
        .gte("thread_date", cutoff)
        .neq("status", "confirmed")
        .execute()
    )
    return res.data or []


def update_thread_status_and_order(thread_id: str, status: str, order_id: str) -> Optional[dict]:
    """ステータスとorder_idを一括更新"""
    res = (
        get_client()
        .table("discord_mirror_threads")
        .update({"status": status, "order_id": order_id})
        .eq("thread_id", thread_id)
        .execute()
    )
    if res.data and len(res.data) > 0:
        return res.data[0]
    return None


# --- customers ---

def update_customer_pricelist_webhook(customer_id: str, webhook_url: Optional[str]):
    """顧客のpricelist_webhook_urlを更新（Noneで解除）"""
    get_client().table("customers").update(
        {"pricelist_webhook_url": webhook_url}
    ).eq("id", customer_id).execute()


def get_all_pricelist_webhooks() -> List[dict]:
    """pricelist_webhook_urlが登録済みの全顧客を取得"""
    res = (
        get_client()
        .table("customers")
        .select("id, name, company_name, pricelist_webhook_url")
        .neq("pricelist_webhook_url", "null")
        .execute()
    )
    # nullでないものだけフィルタ
    return [c for c in (res.data or []) if c.get("pricelist_webhook_url")]


def update_customer_english_pricelist(customer_id: str, webhook_url: Optional[str], markup: int = 0):
    """顧客の英語版価格表webhook URLとマークアップを更新（Noneで解除）"""
    data = {"english_pricelist_webhook_url": webhook_url}
    if webhook_url is None:
        data["price_markup"] = 0
    else:
        data["price_markup"] = markup
    get_client().table("customers").update(data).eq("id", customer_id).execute()


def get_customer_pricelist_status(customer_id: str) -> dict:
    """顧客の価格表配信状態を取得"""
    res = (
        get_client()
        .table("customers")
        .select("pricelist_webhook_url, english_pricelist_webhook_url, price_markup")
        .eq("id", customer_id)
        .execute()
    )
    if res.data and len(res.data) > 0:
        return res.data[0]
    return {}


def get_all_english_pricelist_webhooks() -> List[dict]:
    """英語版価格表webhook登録済みの全顧客を取得"""
    res = (
        get_client()
        .table("customers")
        .select("id, name, company_name, english_pricelist_webhook_url, price_markup")
        .neq("english_pricelist_webhook_url", "null")
        .execute()
    )
    return [c for c in (res.data or []) if c.get("english_pricelist_webhook_url")]


def update_customer_markup(customer_id: str, markup: int):
    """顧客のマークアップ金額を更新"""
    get_client().table("customers").update(
        {"price_markup": markup}
    ).eq("id", customer_id).execute()


def get_all_customers() -> List[dict]:
    """全顧客一覧を取得"""
    res = get_client().table("customers").select("id, name, company_name").execute()
    return res.data or []


# --- payment_forwards ---

def create_payment_forward(forwarded_message_id: str, source_author: str, forwarded_at: str) -> dict:
    """転送メッセージの記録を作成"""
    res = (
        get_client()
        .table("payment_forwards")
        .insert({
            "forwarded_message_id": forwarded_message_id,
            "source_author": source_author,
            "forwarded_at": forwarded_at,
        })
        .execute()
    )
    return res.data[0]


def mark_payment_forward_paid(forwarded_message_id: str) -> Optional[dict]:
    """振込済スタンプが押されたらpaid=trueに更新"""
    res = (
        get_client()
        .table("payment_forwards")
        .update({"paid": True})
        .eq("forwarded_message_id", forwarded_message_id)
        .execute()
    )
    if res.data and len(res.data) > 0:
        return res.data[0]
    return None


def get_pending_payment_forwards(before_iso: str) -> List[dict]:
    """48時間以上経過した未払い・未リマインドの転送記録を取得"""
    res = (
        get_client()
        .table("payment_forwards")
        .select("*")
        .eq("paid", False)
        .eq("reminded", False)
        .lt("forwarded_at", before_iso)
        .execute()
    )
    return res.data or []


def mark_payment_forward_reminded(forwarded_message_id: str) -> Optional[dict]:
    """リマインド済みに更新"""
    res = (
        get_client()
        .table("payment_forwards")
        .update({"reminded": True})
        .eq("forwarded_message_id", forwarded_message_id)
        .execute()
    )
    if res.data and len(res.data) > 0:
        return res.data[0]
    return None


# --- discord_pending_replies ---

def save_pending_reply(message_id: str, context: dict) -> None:
    """返信確認ペンディングをDBに保存（bot再起動耐性）"""
    get_client().table("discord_pending_replies").upsert({
        "message_id": str(message_id),
        "original_message_id": str(context["original_message_id"]),
        "channel_id": str(context["channel_id"]),
        "content": context.get("content"),
        "attachment_urls": context.get("attachment_urls", []),
        "general_channel_id": str(context["general_channel_id"]),
    }, on_conflict="message_id").execute()


def pop_pending_reply(message_id: str) -> Optional[dict]:
    """返信確認ペンディングをDBから取得して削除"""
    res = (
        get_client()
        .table("discord_pending_replies")
        .select("*")
        .eq("message_id", str(message_id))
        .execute()
    )
    if not res.data:
        return None
    record = res.data[0]
    # 取得後に削除
    get_client().table("discord_pending_replies").delete().eq("message_id", str(message_id)).execute()
    return {
        "original_message_id": int(record["original_message_id"]),
        "channel_id": int(record["channel_id"]),
        "content": record.get("content"),
        "attachment_urls": record.get("attachment_urls") or [],
        "general_channel_id": record["general_channel_id"],
    }


def cleanup_old_pending_replies(before_iso: str) -> None:
    """指定日時より古いペンディングを削除（起動時クリーンアップ用）"""
    get_client().table("discord_pending_replies").delete().lt("created_at", before_iso).execute()


def try_claim_message(message_id: int) -> bool:
    """メッセージIDをクレームする。既に処理済みなら False を返す（分散重複防止）"""
    try:
        get_client().table("processed_messages").insert({
            "message_id": str(message_id),
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        return True  # 新規 → 処理する
    except Exception:
        return False  # 重複 or エラー → スキップ


# --- product_prices ---

def get_product_prices() -> dict:
    """全商品価格をSupabaseから取得 {商品名: 価格}"""
    try:
        res = get_client().table("product_prices").select("product_name, price").execute()
        return {row["product_name"]: row["price"] for row in (res.data or [])}
    except Exception as e:
        print(f"[ERROR] get_product_prices失敗: {e}", flush=True)
        return {}


def get_today_product_prices() -> dict:
    """今日更新された商品価格のみ取得 {商品名: 価格}"""
    try:
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        res = (
            get_client()
            .table("product_prices")
            .select("product_name, price")
            .gte("updated_at", today.isoformat())
            .execute()
        )
        return {row["product_name"]: row["price"] for row in (res.data or [])}
    except Exception as e:
        print(f"[ERROR] get_today_product_prices失敗: {e}", flush=True)
        return {}


def get_product_sort_orders() -> dict:
    """全商品のsort_orderをSupabaseから取得 {商品名: sort_order}"""
    try:
        res = get_client().table("product_prices").select("product_name, sort_order").execute()
        return {row["product_name"]: row.get("sort_order", 0) or 0 for row in (res.data or [])}
    except Exception as e:
        print(f"[ERROR] get_product_sort_orders失敗: {e}", flush=True)
        return {}


def save_product_sort_orders(sort_orders: dict) -> None:
    """sort_orderのみ更新（updated_atは変更しない）"""
    if not sort_orders:
        return
    try:
        for name, order in sort_orders.items():
            get_client().table("product_prices").update(
                {"sort_order": order}
            ).eq("product_name", name).execute()
    except Exception as e:
        print(f"[ERROR] save_product_sort_orders失敗: {e}", flush=True)


def save_product_prices(prices: dict, sort_orders: dict = None) -> None:
    """商品価格をSupabaseに一括upsert {商品名: 価格}
    updated_at は価格が実際に変わった場合のみ更新する。
    """
    if not prices:
        return
    try:
        existing = get_product_prices()
        now = datetime.now(timezone.utc).isoformat()
        rows = []
        for name, price in prices.items():
            row = {"product_name": name, "price": price}
            # 価格が変わった場合、または新規商品の場合のみ updated_at を更新
            if existing.get(name) != price:
                row["updated_at"] = now
            if sort_orders and name in sort_orders:
                row["sort_order"] = sort_orders[name]
            rows.append(row)
        get_client().table("product_prices").upsert(rows, on_conflict="product_name").execute()
    except Exception as e:
        print(f"[ERROR] save_product_prices失敗: {e}", flush=True)


# --- quadra_animac_product_map ---

def get_animac_mapping(quadra_name: str) -> Optional[dict]:
    """QuadraのDiscord商品名 → AnimacのproductIDを取得"""
    try:
        res = get_client().table("quadra_animac_product_map").select("*").eq("quadra_name", quadra_name).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[ERROR] get_animac_mapping失敗: {e}", flush=True)
        return None


def get_all_animac_mappings() -> List[dict]:
    """全マッピング一覧を取得"""
    try:
        res = get_client().table("quadra_animac_product_map").select("*").order("quadra_name").execute()
        return res.data or []
    except Exception as e:
        print(f"[ERROR] get_all_animac_mappings失敗: {e}", flush=True)
        return []


def upsert_animac_mapping(quadra_name: str, animac_product_id: str, animac_product_name: str) -> None:
    """マッピングを登録/更新"""
    try:
        get_client().table("quadra_animac_product_map").upsert(
            {
                "quadra_name": quadra_name,
                "animac_product_id": animac_product_id,
                "animac_product_name": animac_product_name,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="quadra_name",
        ).execute()
    except Exception as e:
        print(f"[ERROR] upsert_animac_mapping失敗: {e}", flush=True)


def delete_animac_mapping(quadra_name: str) -> None:
    """マッピングを削除"""
    try:
        get_client().table("quadra_animac_product_map").delete().eq("quadra_name", quadra_name).execute()
    except Exception as e:
        print(f"[ERROR] delete_animac_mapping失敗: {e}", flush=True)


def cleanup_old_processed_messages() -> None:
    """1時間以上前のprocessed_messagesを削除"""
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    try:
        get_client().table("processed_messages").delete().lt("processed_at", cutoff).execute()
    except Exception:
        pass


# --- discord_message_mirrors ---

def save_message_mirror(source_message_id: str, mirror_message_id: str, thread_id: str) -> None:
    """元メッセージID→ミラーメッセージIDのマッピングを保存"""
    try:
        get_client().table("discord_message_mirrors").upsert({
            "source_message_id": source_message_id,
            "mirror_message_id": mirror_message_id,
            "thread_id": thread_id,
        }, on_conflict="source_message_id").execute()
    except Exception as e:
        print(f"[ERROR] save_message_mirror失敗: {e}", flush=True)


def get_message_mirror(source_message_id: str) -> Optional[dict]:
    """元メッセージIDからミラー情報を取得"""
    try:
        res = (
            get_client()
            .table("discord_message_mirrors")
            .select("*")
            .eq("source_message_id", source_message_id)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[ERROR] get_message_mirror失敗: {e}", flush=True)
        return None


def cleanup_old_message_mirrors() -> None:
    """24時間以上前のメッセージミラーマッピングを削除"""
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    try:
        get_client().table("discord_message_mirrors").delete().lt("created_at", cutoff).execute()
    except Exception:
        pass
