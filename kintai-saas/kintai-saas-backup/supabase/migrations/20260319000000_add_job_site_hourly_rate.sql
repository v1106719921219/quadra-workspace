-- job_sitesに時給カラム追加（現場別時給対応）
ALTER TABLE job_sites ADD COLUMN hourly_rate int;
