-- シフトテンプレートテーブル
CREATE TABLE shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  work_type_id uuid NOT NULL REFERENCES work_types(id),
  start_time time NOT NULL,
  end_time time NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_templates_select" ON shift_templates
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "shift_templates_insert" ON shift_templates
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "shift_templates_update" ON shift_templates
  FOR UPDATE USING (tenant_id = get_tenant_id());

CREATE POLICY "shift_templates_delete" ON shift_templates
  FOR DELETE USING (tenant_id = get_tenant_id());

-- インデックス
CREATE INDEX idx_shift_templates_tenant ON shift_templates(tenant_id);

-- updated_at トリガー
CREATE TRIGGER update_shift_templates_updated_at
  BEFORE UPDATE ON shift_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
