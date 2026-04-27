-- employeesにPINカラム追加
ALTER TABLE employees ADD COLUMN pin text;

-- 休日希望テーブル
CREATE TABLE day_off_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  request_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, employee_id, request_date)
);

ALTER TABLE day_off_requests ENABLE ROW LEVEL SECURITY;

-- service_roleのみアクセス（スタッフはAPIから直接アクセスしない）
CREATE POLICY "day_off_requests_select" ON day_off_requests
  FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY "day_off_requests_insert" ON day_off_requests
  FOR INSERT WITH CHECK (true);
CREATE POLICY "day_off_requests_update" ON day_off_requests
  FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "day_off_requests_delete" ON day_off_requests
  FOR DELETE USING (true);

CREATE INDEX idx_day_off_requests_tenant ON day_off_requests(tenant_id);
CREATE INDEX idx_day_off_requests_employee ON day_off_requests(employee_id);
CREATE INDEX idx_day_off_requests_date ON day_off_requests(tenant_id, request_date);

CREATE TRIGGER update_day_off_requests_updated_at
  BEFORE UPDATE ON day_off_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
