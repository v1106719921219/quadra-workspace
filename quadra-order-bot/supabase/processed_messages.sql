-- メッセージ重複処理防止テーブル（複数インスタンス間での分散ロック）
CREATE TABLE IF NOT EXISTS processed_messages (
    message_id TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1時間以上前のレコードを定期削除するインデックス
CREATE INDEX IF NOT EXISTS idx_processed_messages_at ON processed_messages (processed_at);
