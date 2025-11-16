-- 添加审批分配相关字段的迁移脚本
-- 执行时间：2025-11-16

-- 1. 创建副总分管部门表
CREATE TABLE IF NOT EXISTS vice_president_departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vice_president_id INTEGER NOT NULL,
    department_id INTEGER NOT NULL,
    is_default BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vice_president_id) REFERENCES users(id),
    FOREIGN KEY (department_id) REFERENCES departments(id),
    UNIQUE(vice_president_id, department_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_vp_dept_vp_id ON vice_president_departments(vice_president_id);
CREATE INDEX IF NOT EXISTS idx_vp_dept_dept_id ON vice_president_departments(department_id);

-- 2. 为请假申请表添加手动指定审批人字段
-- 检查字段是否已存在，如果不存在则添加
-- SQLite 不支持直接检查列是否存在，需要手动执行

-- 添加 assigned_vp_id 字段（如果不存在）
-- 注意：SQLite 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS
-- 需要先检查表结构，如果字段不存在再添加
-- 这里假设字段不存在，如果已存在会报错，需要手动处理

-- 添加 assigned_vp_id
ALTER TABLE leave_applications ADD COLUMN assigned_vp_id INTEGER;
ALTER TABLE leave_applications ADD COLUMN assigned_gm_id INTEGER;

-- 添加外键约束（SQLite 不支持在 ALTER TABLE 中添加外键，需要在创建表时添加）
-- 这里只添加列，外键关系在应用层维护

-- 3. 为加班申请表添加手动指定审批人字段
ALTER TABLE overtime_applications ADD COLUMN assigned_approver_id INTEGER;

-- 4. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_leave_assigned_vp ON leave_applications(assigned_vp_id);
CREATE INDEX IF NOT EXISTS idx_leave_assigned_gm ON leave_applications(assigned_gm_id);
CREATE INDEX IF NOT EXISTS idx_overtime_assigned_approver ON overtime_applications(assigned_approver_id);

