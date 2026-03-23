import os
from dotenv import load_dotenv

load_dotenv()

# Discord
DISCORD_BOT_TOKEN = os.environ["DISCORD_BOT_TOKEN"]
MANAGEMENT_SERVER_ID = int(os.environ["MANAGEMENT_SERVER_ID"])
MANAGEMENT_CHANNEL_ID = int(os.environ["MANAGEMENT_CHANNEL_ID"])  # #注文受信
PAYMENT_SOURCE_CHANNEL_ID = int(os.environ.get("PAYMENT_SOURCE_CHANNEL_ID", "1482174352362442915"))  # #支払い依頼請求書（山口事務所）
BACKOFFICE_PAYMENT_CHANNEL_ID = int(os.environ.get("BACKOFFICE_PAYMENT_CHANNEL_ID", "1477921381378297999"))  # #口座登録依頼
PAYMENT_REMINDER_USER_ID = int(os.environ.get("PAYMENT_REMINDER_USER_ID", "1475162679537696956"))  # 振込リマインド先
PAYMENT_REMINDER_EMOJI = os.environ.get("PAYMENT_REMINDER_EMOJI", "振込済")  # カスタム絵文字名
PAYMENT_REMINDER_HOURS = int(os.environ.get("PAYMENT_REMINDER_HOURS", "48"))  # リマインドまでの時間

# Supabase
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]  # service role key

# ShipOrd API
SHIPORD_API_URL = os.environ["SHIPORD_API_URL"]  # e.g. https://shipord.example.com
DISCORD_BOT_API_KEY = os.environ["DISCORD_BOT_API_KEY"]  # Bearer token
SHIPORD_BASE_URL = os.environ.get("SHIPORD_BASE_URL", "https://shipord-domestic.vercel.app")

# Anthropic API
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# Q&A自動回答チャンネル（カンマ区切りで複数指定可）
QA_CHANNEL_IDS = [int(x) for x in os.environ.get("QA_CHANNEL_IDS", "").split(",") if x.strip()]

# Google Apps Script (在庫管理スプレッドシートAPI)
GOOGLE_APPS_SCRIPT_URL = os.environ.get("GOOGLE_APPS_SCRIPT_URL", "")

# 買取スクエア Supabase (商品表示/非表示管理)
BUYBACK_SUPABASE_URL_TOKYO = os.environ.get("BUYBACK_SUPABASE_URL_TOKYO", "")
BUYBACK_SUPABASE_KEY_TOKYO = os.environ.get("BUYBACK_SUPABASE_KEY_TOKYO", "")
BUYBACK_SUPABASE_URL_CHIBA = os.environ.get("BUYBACK_SUPABASE_URL_CHIBA", "")
BUYBACK_SUPABASE_KEY_CHIBA = os.environ.get("BUYBACK_SUPABASE_KEY_CHIBA", "")

# スレッドステータス
STATUS_PENDING = "pending"
STATUS_IN_PROGRESS = "in_progress"
STATUS_CONFIRMED = "confirmed"
STATUS_MODIFIED = "modified"
STATUS_EMOJI = {
    STATUS_PENDING: "🔴",
    STATUS_IN_PROGRESS: "🟡",
    STATUS_CONFIRMED: "🟢",
    STATUS_MODIFIED: "🟠",
}

# ANIMAC
ANIMAC_CUSTOMER_ID = os.environ.get("ANIMAC_CUSTOMER_ID", "712f7bb6-5532-42eb-8315-5c6d99defb26")
ANIMAC_SERVER_ID = int(os.environ.get("ANIMAC_SERVER_ID", "1476793964769185872"))

# 自動招待メンバー
AUTO_INVITE_USER_IDS = [
    1475162679537696956,
    1476734004748357682,
    1477502211079540816,
    1477125253552672893,
    1476707950751121509,
]
