-- site_daily_labelsに車番・出発時間を追加（セル単位で管理）
ALTER TABLE site_daily_labels
  ADD COLUMN car_number text DEFAULT NULL,
  ADD COLUMN departure_time time DEFAULT NULL;
