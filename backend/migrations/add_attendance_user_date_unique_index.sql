-- 为 attendances 增加 user_id + date 唯一索引
-- 依赖：已先执行去重脚本，避免历史重复导致索引创建失败

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendances_user_date_unique
ON attendances (user_id, date);
