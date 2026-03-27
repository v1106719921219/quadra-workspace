-- ============================================
-- kintai-saas: 初期スキーマ
-- ============================================

-- テナントコンテキスト設定関数
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- リクエストヘッダーからテナントID取得
CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS uuid AS $$
DECLARE
  tid text;
BEGIN
  -- まずローカル設定を確認
  tid := current_setting('app.tenant_id', true);
  IF tid IS NOT NULL AND tid != '' THEN
    RETURN tid::uuid;
  END IF;
  -- 次にリクエストヘッダーを確認
  tid := current_setting('request.headers', true)::json->>'x-tenant-id';
  IF tid IS NOT NULL AND tid != '' THEN
    RETURN tid::uuid;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- profiles テーブル（Supabase Auth連携）
-- ============================================
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Auth トリガー: ユーザー作成時にprofile自動作成
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- organizations テーブル（テナント）
-- ============================================
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_select_by_slug" ON organizations
  FOR SELECT USING (true);

CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (true);

-- ============================================
-- organization_members テーブル
-- ============================================
CREATE TABLE organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'admin', 'manager', 'employee')),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(organization_id, user_id)
);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select" ON organization_members
  FOR SELECT USING (user_id = auth.uid() OR organization_id = get_tenant_id());

CREATE POLICY "org_members_insert" ON organization_members
  FOR INSERT WITH CHECK (true);

CREATE POLICY "org_members_update" ON organization_members
  FOR UPDATE USING (organization_id = get_tenant_id());

CREATE POLICY "org_members_delete" ON organization_members
  FOR DELETE USING (organization_id = get_tenant_id());

-- ============================================
-- tenant_settings テーブル
-- ============================================
CREATE TABLE tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  closing_day int NOT NULL DEFAULT 0 CHECK (closing_day >= 0 AND closing_day <= 28),
  timezone text NOT NULL DEFAULT 'Asia/Tokyo',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_settings_select" ON tenant_settings
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "tenant_settings_update" ON tenant_settings
  FOR UPDATE USING (tenant_id = get_tenant_id());

CREATE POLICY "tenant_settings_insert" ON tenant_settings
  FOR INSERT WITH CHECK (true);

-- ============================================
-- employees テーブル
-- ============================================
CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_number text,
  name text NOT NULL,
  employee_type text NOT NULL DEFAULT 'part_time' CHECK (employee_type IN ('part_time', 'full_time')),
  hourly_rate int,
  monthly_salary int,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_select" ON employees
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "employees_insert" ON employees
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "employees_update" ON employees
  FOR UPDATE USING (tenant_id = get_tenant_id());

CREATE POLICY "employees_delete" ON employees
  FOR DELETE USING (tenant_id = get_tenant_id());

CREATE INDEX idx_employees_tenant ON employees(tenant_id);

-- ============================================
-- work_types テーブル（業務タイプ）
-- ============================================
CREATE TABLE work_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  daily_allowance int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE work_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_types_select" ON work_types
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "work_types_insert" ON work_types
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "work_types_update" ON work_types
  FOR UPDATE USING (tenant_id = get_tenant_id());

CREATE POLICY "work_types_delete" ON work_types
  FOR DELETE USING (tenant_id = get_tenant_id());

CREATE INDEX idx_work_types_tenant ON work_types(tenant_id);

-- ============================================
-- time_records テーブル（打刻記録）
-- ============================================
CREATE TABLE time_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_type_id uuid NOT NULL REFERENCES work_types(id),
  work_date date NOT NULL,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  break_minutes int NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_records_select" ON time_records
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "time_records_insert" ON time_records
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY "time_records_update" ON time_records
  FOR UPDATE USING (tenant_id = get_tenant_id());

CREATE POLICY "time_records_delete" ON time_records
  FOR DELETE USING (tenant_id = get_tenant_id());

CREATE INDEX idx_time_records_tenant ON time_records(tenant_id);
CREATE INDEX idx_time_records_employee_date ON time_records(employee_id, work_date);

-- 二重出勤防止
CREATE UNIQUE INDEX idx_time_records_active_clock
  ON time_records(tenant_id, employee_id)
  WHERE clock_out IS NULL;

-- ============================================
-- デフォルト業務タイプ自動作成関数
-- ============================================
CREATE OR REPLACE FUNCTION seed_default_work_types(p_tenant_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO work_types (tenant_id, name, daily_allowance, sort_order) VALUES
    (p_tenant_id, '業務1', 0, 1),
    (p_tenant_id, '業務2', 2000, 2),
    (p_tenant_id, '業務3', 3000, 3);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_tenant_settings_updated_at BEFORE UPDATE ON tenant_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_work_types_updated_at BEFORE UPDATE ON work_types FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_time_records_updated_at BEFORE UPDATE ON time_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
