BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS leave_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO leave_types (name, description) VALUES
('普通请假', '常规事假或病假'),
('加班调休', '加班折算的调休假'),
('年假调休', '年假或年假调休');

ALTER TABLE leave_applications ADD COLUMN leave_type_id INTEGER NOT NULL DEFAULT 1 REFERENCES leave_types(id);

COMMIT;

