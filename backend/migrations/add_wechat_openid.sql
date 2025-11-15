-- 添加微信OpenID字段到用户表
-- 如果使用SQLite，可以直接运行此SQL
-- 如果使用其他数据库，请根据实际情况调整

ALTER TABLE users ADD COLUMN wechat_openid VARCHAR(128) UNIQUE;

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_users_wechat_openid ON users(wechat_openid);

