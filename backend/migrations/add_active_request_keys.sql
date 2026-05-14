-- 为请假/加班申请增加活动去重键字段与唯一索引
-- 说明：字段允许为 NULL，仅“活动中的申请”写入去重键；已撤销/已拒绝申请会清空该键

ALTER TABLE leave_applications ADD COLUMN active_request_key VARCHAR(64);
ALTER TABLE overtime_applications ADD COLUMN active_request_key VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_applications_active_request_key
ON leave_applications(active_request_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_overtime_applications_active_request_key
ON overtime_applications(active_request_key);
