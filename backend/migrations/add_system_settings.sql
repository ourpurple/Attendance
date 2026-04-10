-- 系统设置表：用于后台可配置开关
CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key VARCHAR(100) NOT NULL UNIQUE,
    value VARCHAR(255) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- 默认关闭“总经理审批自动通过”
INSERT OR IGNORE INTO system_settings (key, value, description)
VALUES ('auto_approve_gm_level', 'false', '开启后，任何流转到总经理审批节点的申请将自动批准');
