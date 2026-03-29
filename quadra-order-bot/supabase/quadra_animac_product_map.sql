-- QuadraのDiscord価格 ↔ AnimacのproductsテーブルIDのマッピング
CREATE TABLE IF NOT EXISTS quadra_animac_product_map (
    quadra_name TEXT PRIMARY KEY,       -- Discordで使う商品名（日本語）
    animac_product_id UUID NOT NULL,    -- Animacのproducts.id
    animac_product_name TEXT,           -- 参照用（Animacの英語名）
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
