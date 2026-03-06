-- ============================================
-- 給与計算機能: employeesカラム追加 + payroll_recordsテーブル
-- ============================================

-- employees に給与関連カラム追加
ALTER TABLE employees
  ADD COLUMN transportation_allowance int DEFAULT 0,
  ADD COLUMN dependents_count int DEFAULT 0,
  ADD COLUMN tax_column text DEFAULT 'kou' CHECK (tax_column IN ('kou', 'otsu')),
  ADD COLUMN social_insurance_enrolled boolean DEFAULT false;

-- ============================================
-- payroll_records テーブル（給与明細）
-- ============================================
CREATE TABLE payroll_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL CHECK (month >= 1 AND month <= 12),

  -- 勤怠サマリ
  work_days int NOT NULL DEFAULT 0,
  total_hours numeric(8,2) NOT NULL DEFAULT 0,
  overtime_hours numeric(8,2) NOT NULL DEFAULT 0,
  late_night_hours numeric(8,2) NOT NULL DEFAULT 0,
  holiday_hours numeric(8,2) NOT NULL DEFAULT 0,

  -- 支給
  base_pay int NOT NULL DEFAULT 0,
  overtime_pay int NOT NULL DEFAULT 0,
  late_night_pay int NOT NULL DEFAULT 0,
  holiday_pay int NOT NULL DEFAULT 0,
  daily_allowance_total int NOT NULL DEFAULT 0,
  transportation_allowance int NOT NULL DEFAULT 0,
  gross_pay int NOT NULL DEFAULT 0,

  -- 控除
  health_insurance int NOT NULL DEFAULT 0,
  pension int NOT NULL DEFAULT 0,
  employment_insurance int NOT NULL DEFAULT 0,
  income_tax int NOT NULL DEFAULT 0,
  total_deductions int NOT NULL DEFAULT 0,

  -- 差引支給額
  net_pay int NOT NULL DEFAULT 0,

  -- ステータス・メタ
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  calculation_details jsonb,

  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  UNIQUE(tenant_id, employee_id, year, month)
);

ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_records_select" ON payroll_records
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "payroll_records_insert" ON payroll_records
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "payroll_records_update" ON payroll_records
  FOR UPDATE USING (tenant_id = get_tenant_id());

CREATE POLICY "payroll_records_delete" ON payroll_records
  FOR DELETE USING (tenant_id = get_tenant_id());

CREATE INDEX idx_payroll_records_tenant ON payroll_records(tenant_id);
CREATE INDEX idx_payroll_records_period ON payroll_records(tenant_id, year, month);

CREATE TRIGGER update_payroll_records_updated_at
  BEFORE UPDATE ON payroll_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
