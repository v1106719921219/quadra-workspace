-- employeesに通勤費（1日往復）カラム追加
ALTER TABLE employees ADD COLUMN commute_allowance int NOT NULL DEFAULT 0;
