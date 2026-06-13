-- 被动加班、年假调整记录表（期初余额 / 人工增减）
-- 幂等：表与索引均 IF NOT EXISTS，可重复执行。
CREATE TABLE IF NOT EXISTS passive_overtime_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    days FLOAT NOT NULL,
    effective_date DATETIME NOT NULL,
    reason TEXT NOT NULL,
    created_by_id INTEGER,
    created_at DATETIME,
    updated_at DATETIME
);
CREATE INDEX IF NOT EXISTS ix_passive_overtime_adjustments_user_id ON passive_overtime_adjustments(user_id);

CREATE TABLE IF NOT EXISTS annual_leave_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    days FLOAT NOT NULL,
    effective_date DATETIME NOT NULL,
    reason TEXT NOT NULL,
    created_by_id INTEGER,
    created_at DATETIME,
    updated_at DATETIME
);
CREATE INDEX IF NOT EXISTS ix_annual_leave_adjustments_user_id ON annual_leave_adjustments(user_id);
