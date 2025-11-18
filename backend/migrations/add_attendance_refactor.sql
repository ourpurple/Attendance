-- 签到模块重构迁移脚本
-- 添加新字段和表

-- 1. 为 attendances 表添加新字段
ALTER TABLE attendances ADD COLUMN checkin_status VARCHAR(20) DEFAULT 'normal';
ALTER TABLE attendances ADD COLUMN morning_status VARCHAR(20);
ALTER TABLE attendances ADD COLUMN afternoon_status VARCHAR(20);
ALTER TABLE attendances ADD COLUMN morning_leave BOOLEAN DEFAULT 0;
ALTER TABLE attendances ADD COLUMN afternoon_leave BOOLEAN DEFAULT 0;

-- 2. 为 attendance_policies 表添加上下午工作时间配置字段
ALTER TABLE attendance_policies ADD COLUMN morning_start_time VARCHAR(5) DEFAULT '09:00';
ALTER TABLE attendance_policies ADD COLUMN morning_end_time VARCHAR(5) DEFAULT '12:00';
ALTER TABLE attendance_policies ADD COLUMN afternoon_start_time VARCHAR(5) DEFAULT '14:00';
ALTER TABLE attendance_policies ADD COLUMN afternoon_end_time VARCHAR(5) DEFAULT '17:30';

-- 3. 创建打卡状态配置表
CREATE TABLE IF NOT EXISTS checkin_status_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. 插入默认的打卡状态配置
INSERT INTO checkin_status_configs (name, code, description, is_active, sort_order) 
VALUES 
    ('正常签到', 'normal', '正常签到', 1, 0),
    ('市区办事', 'city_business', '市区办事', 1, 1),
    ('出差', 'business_trip', '出差', 1, 2)
ON CONFLICT(code) DO NOTHING;

-- 5. 迁移现有数据：根据现有checkin_time和checkout_time推断上下午状态
-- 如果checkin_time在14:10之前，设置morning_status
UPDATE attendances 
SET morning_status = COALESCE(checkin_status, 'normal')
WHERE checkin_time IS NOT NULL 
  AND (strftime('%H:%M', checkin_time) < '14:10' OR (strftime('%H:%M', checkin_time) = '14:10' AND strftime('%S', checkin_time) = '00'));

-- 如果checkout_time存在，设置afternoon_status
UPDATE attendances 
SET afternoon_status = COALESCE(checkin_status, 'normal')
WHERE checkout_time IS NOT NULL;

-- 6. 更新现有记录的checkin_status为normal（如果为空）
UPDATE attendances 
SET checkin_status = 'normal'
WHERE checkin_status IS NULL;

