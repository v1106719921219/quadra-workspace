-- ============================================
-- 現場マスタ・シフト種別・配置テーブル追加
-- ============================================

-- ============================================
-- job_sites（現場マスタ）
-- ============================================
CREATE TABLE job_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  short_name text,
  address text,
  client_name text,
  note text,
  color text NOT NULL DEFAULT '#3b82f6',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE job_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_sites_select" ON job_sites
  FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY "job_sites_insert" ON job_sites
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "job_sites_update" ON job_sites
  FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "job_sites_delete" ON job_sites
  FOR DELETE USING (tenant_id = get_tenant_id());

CREATE INDEX idx_job_sites_tenant ON job_sites(tenant_id);

CREATE TRIGGER update_job_sites_updated_at
  BEFORE UPDATE ON job_sites FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- shift_types（シフト種別: 通常/早出/遅出）
-- ============================================
CREATE TABLE shift_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_start_time time,
  default_end_time time,
  color text NOT NULL DEFAULT '#3b82f6',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE shift_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_types_select" ON shift_types
  FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY "shift_types_insert" ON shift_types
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "shift_types_update" ON shift_types
  FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "shift_types_delete" ON shift_types
  FOR DELETE USING (tenant_id = get_tenant_id());

CREATE INDEX idx_shift_types_tenant ON shift_types(tenant_id);

CREATE TRIGGER update_shift_types_updated_at
  BEFORE UPDATE ON shift_types FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- デフォルトシフト種別シード関数
CREATE OR REPLACE FUNCTION seed_default_shift_types(p_tenant_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO shift_types (tenant_id, name, default_start_time, default_end_time, color, sort_order) VALUES
    (p_tenant_id, '通常', '08:00', '17:00', '#3b82f6', 1),
    (p_tenant_id, '早出', '06:00', '15:00', '#f59e0b', 2),
    (p_tenant_id, '遅出', '10:00', '19:00', '#8b5cf6', 3);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- site_assignments（配置＝誰をどの現場にいつ配置するか）
-- ============================================
CREATE TABLE site_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  job_site_id uuid NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
  shift_type_id uuid REFERENCES shift_types(id) ON DELETE SET NULL,
  assignment_date date NOT NULL,
  start_time time,
  end_time time,
  is_driver boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, employee_id, job_site_id, assignment_date)
);

ALTER TABLE site_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_assignments_select" ON site_assignments
  FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY "site_assignments_insert" ON site_assignments
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "site_assignments_update" ON site_assignments
  FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "site_assignments_delete" ON site_assignments
  FOR DELETE USING (tenant_id = get_tenant_id());

CREATE INDEX idx_site_assignments_tenant ON site_assignments(tenant_id);
CREATE INDEX idx_site_assignments_date ON site_assignments(tenant_id, assignment_date);
CREATE INDEX idx_site_assignments_employee ON site_assignments(employee_id, assignment_date);

CREATE TRIGGER update_site_assignments_updated_at
  BEFORE UPDATE ON site_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 既存テーブル変更
-- ============================================

-- time_records に現場カラム追加
ALTER TABLE time_records ADD COLUMN job_site_id uuid REFERENCES job_sites(id) ON DELETE SET NULL;

-- tenant_settings に15分刻み設定追加
ALTER TABLE tenant_settings ADD COLUMN time_rounding_minutes int NOT NULL DEFAULT 15;
