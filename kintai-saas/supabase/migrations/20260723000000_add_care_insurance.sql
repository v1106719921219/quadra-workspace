-- 介護保険（40〜64歳の第2号被保険者）対応
ALTER TABLE employees ADD COLUMN IF NOT EXISTS care_insurance_enrolled boolean NOT NULL DEFAULT false;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS care_insurance integer NOT NULL DEFAULT 0;
