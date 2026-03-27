-- ============================================================
-- 利益管理カラム追加
-- submission_items テーブルにスプレッドシート相当のフィールドを追加
-- ============================================================

alter table submission_items
  add column rarity text,
  add column purchase_cost integer,         -- 仕入値（円）
  add column sold_price integer,            -- 売値/価格（円）
  add column sold boolean not null default false,  -- SOLD
  add column grading_fee integer,           -- 鑑定料（円）
  add column other_fees integer,            -- 手数料諸々（円）
  add column grading_result text,           -- 鑑定結果（PSA10等）
  add column cert_number text,              -- 鑑定番号
  add column plan text,                     -- プラン
  add column completed_at timestamptz;      -- 完了日

-- 粗利は保存せず計算: sold_price - purchase_cost - grading_fee - other_fees
