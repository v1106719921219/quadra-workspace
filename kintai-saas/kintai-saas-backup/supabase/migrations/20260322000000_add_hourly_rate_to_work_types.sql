-- work_typesに時給カラムを追加
ALTER TABLE work_types ADD COLUMN hourly_rate int DEFAULT NULL;
