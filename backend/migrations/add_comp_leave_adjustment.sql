-- 加班调休调整记录表（期初余额 / 人工增减）
-- 幂等：表与索引均 IF NOT EXISTS，可重复执行。
CREATE TABLE IF NOT EXISTS comp_leave_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    days FLOAT NOT NULL,
    effective_date DATETIME NOT NULL,
    reason TEXT NOT NULL,
    created_by_id INTEGER,
    created_at DATETIME,
    updated_at DATETIME
);
CREATE INDEX IF NOT EXISTS ix_comp_leave_adjustments_user_id ON comp_leave_adjustments(user_id);
