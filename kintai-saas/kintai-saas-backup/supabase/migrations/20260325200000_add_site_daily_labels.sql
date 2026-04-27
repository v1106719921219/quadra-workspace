-- 現場の日別名称テーブル（現場名はその日その日で変わるため）
CREATE TABLE site_daily_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_site_id uuid NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
  label_date date NOT NULL,
  site_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, job_site_id, label_date)
);

ALTER TABLE site_daily_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_daily_labels_select" ON site_daily_labels FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY "site_daily_labels_insert" ON site_daily_labels FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY "site_daily_labels_update" ON site_daily_labels FOR UPDATE USING (tenant_id = get_tenant_id());
CREATE POLICY "site_daily_labels_delete" ON site_daily_labels FOR DELETE USING (tenant_id = get_tenant_id());

CREATE INDEX idx_site_daily_labels_site_date ON site_daily_labels(job_site_id, label_date);
