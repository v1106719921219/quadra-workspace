-- シフト管理テーブル
CREATE TABLE shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_type_id uuid NOT NULL REFERENCES work_types(id),
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(tenant_id, employee_id, shift_date)
);

-- RLS
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shifts_select" ON shifts
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "shifts_insert" ON shifts
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "shifts_update" ON shifts
  FOR UPDATE USING (tenant_id = get_tenant_id());

CREATE POLICY "shifts_delete" ON shifts
  FOR DELETE USING (tenant_id = get_tenant_id());

-- インデックス
CREATE INDEX idx_shifts_tenant ON shifts(tenant_id);
CREATE INDEX idx_shifts_employee_date ON shifts(employee_id, shift_date);
CREATE INDEX idx_shifts_date ON shifts(tenant_id, shift_date);

-- updated_at トリガー
CREATE TRIGGER update_shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
