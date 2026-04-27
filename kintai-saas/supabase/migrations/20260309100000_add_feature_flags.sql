-- ============================================
-- テナント別機能フラグ追加
-- デフォルトは従来のまま（新機能OFF）
-- ============================================

-- 現場・配置表・タイムカード機能の有効フラグ
ALTER TABLE tenant_settings ADD COLUMN enable_job_sites boolean NOT NULL DEFAULT false;

-- time_rounding_minutesのデフォルトを1（丸めなし）に変更
-- 既存テナントも1に戻す（まだ本番運用前のため安全）
ALTER TABLE tenant_settings ALTER COLUMN time_rounding_minutes SET DEFAULT 1;
UPDATE tenant_settings SET time_rounding_minutes = 1 WHERE time_rounding_minutes = 15;
