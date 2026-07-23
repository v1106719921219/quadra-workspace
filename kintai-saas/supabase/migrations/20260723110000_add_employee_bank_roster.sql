-- 振込口座情報（給与振込一覧表用）
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_branch text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'ordinary';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_holder text;

-- 労働者名簿用項目
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS retire_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_description text;
