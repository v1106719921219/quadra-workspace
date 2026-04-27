-- job_sitesに正社員日当加算カラム追加
ALTER TABLE job_sites ADD COLUMN daily_allowance int DEFAULT NULL;
