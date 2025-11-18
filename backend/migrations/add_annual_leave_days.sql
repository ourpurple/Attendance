-- 添加年假天数字段到用户表
-- 如果使用SQLite，可以直接运行此SQL
-- 如果使用其他数据库，请根据实际情况调整

ALTER TABLE users ADD COLUMN annual_leave_days FLOAT DEFAULT 10.0;

-- 为所有现有用户设置默认年假天数为10天
UPDATE users SET annual_leave_days = 10.0 WHERE annual_leave_days IS NULL;

