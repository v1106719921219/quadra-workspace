-- 実働時間の手動上書きカラムを追加
ALTER TABLE time_records ADD COLUMN actual_hours_override numeric(5,2) DEFAULT NULL;

-- コメント追加
COMMENT ON COLUMN time_records.actual_hours_override IS '実働時間の手動上書き値（時間単位、NULLの場合は自動計算）';
