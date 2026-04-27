-- site_assignmentsに車番カラム追加
ALTER TABLE site_assignments ADD COLUMN car_number text DEFAULT NULL;

-- employeesにスポットフラグ追加
ALTER TABLE employees ADD COLUMN is_spot boolean NOT NULL DEFAULT false;

-- time_records.work_type_idをnullable化（業務タイプ廃止対応）
ALTER TABLE time_records ALTER COLUMN work_type_id DROP NOT NULL;
