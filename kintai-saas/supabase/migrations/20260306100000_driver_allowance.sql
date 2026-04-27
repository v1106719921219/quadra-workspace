-- ============================================
-- ドライバー手当機能
-- ============================================

-- time_records にドライバーフラグ追加
ALTER TABLE time_records
  ADD COLUMN is_driver boolean NOT NULL DEFAULT false;

-- employees にドライバー対象フラグ追加
ALTER TABLE employees
  ADD COLUMN can_be_driver boolean NOT NULL DEFAULT false;

-- payroll_records にドライバー手当カラム追加（テーブルが存在する場合のみ）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_records') THEN
    ALTER TABLE payroll_records
      ADD COLUMN IF NOT EXISTS driver_days int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS driver_allowance int NOT NULL DEFAULT 0;
  END IF;
END $$;
