-- 假期管理模块迁移：加班调休跨年清零开关
-- 说明：users.hire_date 列由 run_migration_holiday_management.py 用 PRAGMA 判断后幂等添加，
-- 此处仅放置可重复执行的 system_settings 初始化。
INSERT OR IGNORE INTO system_settings (key, value, description)
VALUES ('comp_leave_yearly_reset', 'false', '开启后加班调休余额按自然年跨年清零');
