-- ANIMAC ラベル自動取込テーブル
-- Supabase SQL Editor で実行すること

CREATE TABLE animac_daily_labels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label_date DATE NOT NULL,
  order_ref TEXT NOT NULL,
  customer_name TEXT,
  country TEXT,
  carrier TEXT,
  product_name_en TEXT,
  quantity INT,
  tracking_numbers TEXT[],
  memo TEXT,
  product_name_jp TEXT,
  quantity_jp INT,
  unit_price INT,
  memo_extra TEXT,
  label_pdf_urls TEXT[],
  source_thread_id TEXT,
  source_message_id TEXT UNIQUE,
  scheduled_ship_date DATE,
  shipord_order_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_animac_labels_date_status ON animac_daily_labels(label_date, status);
CREATE INDEX idx_animac_labels_ship_date ON animac_daily_labels(scheduled_ship_date, status);
