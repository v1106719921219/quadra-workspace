-- employees テーブルに PIN カラムを追加
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin text;

-- 休日希望テーブル
CREATE TABLE IF NOT EXISTS day_off_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  request_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, employee_id, request_date)
);

-- RLS 有効化
ALTER TABLE day_off_requests ENABLE ROW LEVEL SECURITY;

-- テナント分離ポリシー
CREATE POLICY "day_off_requests_tenant_isolation" ON day_off_requests
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_day_off_requests_tenant_date
  ON day_off_requests(tenant_id, request_date);

CREATE INDEX IF NOT EXISTS idx_day_off_requests_employee
  ON day_off_requests(tenant_id, employee_id);
