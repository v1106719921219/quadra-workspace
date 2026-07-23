-- 住民税の月別内訳（年税額＋月別金額）
CREATE TABLE resident_tax_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, employee_id, year, month)
);

ALTER TABLE resident_tax_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resident_tax_schedules_select" ON resident_tax_schedules
  FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY "resident_tax_schedules_insert" ON resident_tax_schedules
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "resident_tax_schedules_update" ON resident_tax_schedules
  FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "resident_tax_schedules_delete" ON resident_tax_schedules
  FOR DELETE USING (tenant_id = get_tenant_id());

CREATE INDEX idx_resident_tax_schedules_tenant ON resident_tax_schedules(tenant_id);
CREATE INDEX idx_resident_tax_schedules_employee ON resident_tax_schedules(tenant_id, employee_id, year, month);

CREATE TRIGGER update_resident_tax_schedules_updated_at
  BEFORE UPDATE ON resident_tax_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
