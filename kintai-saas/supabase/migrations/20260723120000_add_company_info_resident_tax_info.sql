-- 会社情報（所得税徴収高計算書・帳票用）
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS company_address text;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS company_phone text;

-- 住民税納付先情報（住民税徴収額一覧表用）
ALTER TABLE employees ADD COLUMN IF NOT EXISTS resident_tax_city text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS resident_tax_city_code text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS resident_tax_designation_number text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS resident_tax_addressee_number text;
