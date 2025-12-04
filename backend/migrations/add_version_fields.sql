-- 添加version字段到关键表
-- 用于实现乐观锁并发控制
-- 执行日期: 2024-12-04

-- 1. 为users表添加version字段
ALTER TABLE users ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;

-- 2. 为leave_applications表添加version字段
ALTER TABLE leave_applications ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;

-- 3. 为overtime_applications表添加version字段
ALTER TABLE overtime_applications ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;

-- 更新现有记录的version为1
UPDATE users SET version = 1 WHERE version IS NULL;
UPDATE leave_applications SET version = 1 WHERE version IS NULL;
UPDATE overtime_applications SET version = 1 WHERE version IS NULL;
