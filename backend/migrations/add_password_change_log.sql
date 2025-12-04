-- 创建密码修改日志表
-- 执行日期: 2024-12-04

CREATE TABLE IF NOT EXISTS password_change_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    changed_by_id INTEGER NOT NULL,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    change_type VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (changed_by_id) REFERENCES users(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_password_change_logs_user_id ON password_change_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_password_change_logs_created_at ON password_change_logs(created_at);
