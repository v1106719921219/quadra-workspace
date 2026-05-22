-- ============================================
-- 社会保険（協会けんぽ）・控除項目拡張
-- ============================================

-- employees に新カラム追加
ALTER TABLE employees
  ADD COLUMN standard_monthly_remuneration int DEFAULT 0,
  ADD COLUMN employment_insurance_enrolled boolean DEFAULT false,
  ADD COLUMN resident_tax int DEFAULT 0,
  ADD COLUMN savings_deduction int DEFAULT 0;

-- payroll_records に新カラム追加
ALTER TABLE payroll_records
  ADD COLUMN child_support_contribution int NOT NULL DEFAULT 0,
  ADD COLUMN resident_tax int NOT NULL DEFAULT 0,
  ADD COLUMN savings_deduction int NOT NULL DEFAULT 0,
  ADD COLUMN absence_deduction int NOT NULL DEFAULT 0;
