-- 商品価格テーブル（Railway再起動・デプロイ後も価格を保持）
CREATE TABLE IF NOT EXISTS product_prices (
    product_name TEXT PRIMARY KEY,
    price INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
