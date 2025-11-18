-- 添加加班类型字段的迁移脚本
-- 执行时间：2025-11-18
-- 功能：为overtime_applications表添加overtime_type字段，支持主动加班和被动加班分类

-- 1. 添加加班类型字段
-- 默认值设为'active'（主动加班），确保向后兼容
ALTER TABLE overtime_applications ADD COLUMN overtime_type TEXT DEFAULT 'active';

-- 2. 为所有现有记录设置默认值（冗余操作，确保数据一致性）
UPDATE overtime_applications SET overtime_type = 'active' WHERE overtime_type IS NULL;

-- 3. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_overtime_type ON overtime_applications(overtime_type);

-- 4. 创建复合索引，优化按用户和类型查询的性能
CREATE INDEX IF NOT EXISTS idx_overtime_user_type ON overtime_applications(user_id, overtime_type);

-- 5. 创建复合索引，优化按状态和类型查询的性能
CREATE INDEX IF NOT EXISTS idx_overtime_status_type ON overtime_applications(status, overtime_type);

-- 6. 验证迁移结果的查询语句（注释掉，仅供参考）
-- SELECT COUNT(*) as total_records FROM overtime_applications;
-- SELECT overtime_type, COUNT(*) as count FROM overtime_applications GROUP BY overtime_type;
-- PRAGMA table_info(overtime_applications);