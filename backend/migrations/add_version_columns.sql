-- 添加version字段用于乐观锁
-- 执行日期: 2024-12-05

-- 为users表添加version字段
ALTER TABLE users ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;

-- 为leave_applications表添加version字段
ALTER TABLE leave_applications ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;

-- 为overtime_applications表添加version字段
ALTER TABLE overtime_applications ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;

-- 为attendances表添加version字段
ALTER TABLE attendances ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;

-- 更新现有记录的version为1
UPDATE users SET version = 1 WHERE version IS NULL;
UPDATE leave_applications SET version = 1 WHERE version IS NULL;
UPDATE overtime_applications SET version = 1 WHERE version IS NULL;
UPDATE attendances SET version = 1 WHERE version IS NULL;
