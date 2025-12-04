-- 添加数据库索引以优化查询性能
-- 执行日期: 2024-12-04

-- 1. attendances表索引
-- 优化按用户查询
CREATE INDEX IF NOT EXISTS idx_attendances_user_id ON attendances(user_id);

-- 优化按用户和日期范围查询（复合索引）
CREATE INDEX IF NOT EXISTS idx_attendances_user_date ON attendances(user_id, date);

-- 2. leave_applications表索引
-- 优化按用户查询
CREATE INDEX IF NOT EXISTS idx_leave_applications_user_id ON leave_applications(user_id);

-- 优化按状态查询
CREATE INDEX IF NOT EXISTS idx_leave_applications_status ON leave_applications(status);

-- 优化按用户和状态查询（复合索引）
CREATE INDEX IF NOT EXISTS idx_leave_applications_user_status ON leave_applications(user_id, status);

-- 3. overtime_applications表索引
-- 优化按用户查询
CREATE INDEX IF NOT EXISTS idx_overtime_applications_user_id ON overtime_applications(user_id);

-- 优化按状态查询
CREATE INDEX IF NOT EXISTS idx_overtime_applications_status ON overtime_applications(status);

-- 优化按用户和状态查询（复合索引）
CREATE INDEX IF NOT EXISTS idx_overtime_applications_user_status ON overtime_applications(user_id, status);

-- 4. users表索引（已有username索引，添加其他常用查询字段）
-- 优化按部门查询
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);

-- 优化按角色查询
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 优化按激活状态查询
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
