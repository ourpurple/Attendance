-- 基础年假分档表（按生效年份阶梯，自该年起永久向后生效）
-- 幂等：表与索引均 IF NOT EXISTS，可重复执行。
CREATE TABLE IF NOT EXISTS annual_leave_bases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    effective_year INTEGER NOT NULL,
    days FLOAT NOT NULL,
    reason TEXT,
    created_by_id INTEGER,
    created_at DATETIME,
    updated_at DATETIME
);
CREATE INDEX IF NOT EXISTS ix_annual_leave_bases_user_id ON annual_leave_bases(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_annual_leave_base_user_year ON annual_leave_bases(user_id, effective_year);
