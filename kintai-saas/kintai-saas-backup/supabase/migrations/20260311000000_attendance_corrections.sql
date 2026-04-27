-- ============================================
-- attendance_corrections テーブル（修正申告）
-- ============================================
CREATE TABLE attendance_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  time_record_id uuid REFERENCES time_records(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  correction_type text NOT NULL DEFAULT 'clock_out' CHECK (correction_type IN ('clock_out', 'clock_in', 'both')),
  corrected_clock_in timestamptz,
  corrected_clock_out timestamptz,
  work_type_id uuid REFERENCES work_types(id),
  break_minutes int NOT NULL DEFAULT 0,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_corrections_select" ON attendance_corrections
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "attendance_corrections_insert" ON attendance_corrections
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "attendance_corrections_update" ON attendance_corrections
  FOR UPDATE USING (tenant_id = get_tenant_id());

CREATE INDEX idx_attendance_corrections_tenant ON attendance_corrections(tenant_id);
CREATE INDEX idx_attendance_corrections_status ON attendance_corrections(tenant_id, status);

CREATE TRIGGER update_attendance_corrections_updated_at
  BEFORE UPDATE ON attendance_corrections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
