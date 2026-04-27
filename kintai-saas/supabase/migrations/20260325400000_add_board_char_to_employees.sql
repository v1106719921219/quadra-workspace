-- 配置表に表示する1文字（指定なしの場合は名前の先頭1文字を使用）
ALTER TABLE employees ADD COLUMN board_char text DEFAULT NULL;
