-- 为用户表添加 enable_attendance 字段，用于控制是否开启考勤管理
ALTER TABLE users ADD COLUMN enable_attendance BOOLEAN DEFAULT 1;

-- 确保现有用户默认开启考勤管理
UPDATE users SET enable_attendance = 1 WHERE enable_attendance IS NULL;


