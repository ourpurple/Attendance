# 安全功能快速开始指南

本指南帮助你快速了解和使用新增的安全功能。

## 📋 前置要求

- Python 3.8+
- SQLite数据库
- 已安装项目依赖

## 🚀 快速开始

### 1. 安装新依赖

```bash
pip install pytz
```

### 2. 执行数据库迁移

```bash
# 执行所有迁移（推荐）
python run_all_migrations.py
```

预期输出：
```
======================================================================
开始执行所有数据库迁移
======================================================================

【迁移1】添加version字段到关键表
----------------------------------------------------------------------
  ➕ 为 users 添加version字段...
  ✅ users.version 添加成功
  ➕ 为 leave_applications 添加version字段...
  ✅ leave_applications.version 添加成功
  ➕ 为 overtime_applications 添加version字段...
  ✅ overtime_applications.version 添加成功

【迁移2】创建密码修改日志表
----------------------------------------------------------------------
  ➕ 创建password_change_logs表...
  ➕ 创建索引...
  ✅ password_change_logs表创建成功

======================================================================
验证迁移结果
======================================================================
✅ users.version 字段存在
✅ leave_applications.version 字段存在
✅ overtime_applications.version 字段存在
✅ password_change_logs表存在

======================================================================
迁移执行总结
======================================================================
✅ 应用的迁移: 4
⏭️  跳过的迁移: 0
📊 总计: 4

🎉 所有迁移成功完成！
======================================================================
```

### 3. 运行测试

```bash
# 运行安全功能测试
python run_security_tests.py
```

或使用pytest：
```bash
pytest tests/test_security.py tests/test_timezone.py tests/test_optimistic_lock.py -v
```

### 4. 启动应用

```bash
python run.py
```

## 🔒 功能验证

### 1. 密码强度验证

访问 http://localhost:8000/docs，测试修改密码API：

**端点**：`POST /api/users/me/change-password`

**请求体**：
```json
{
  "old_password": "旧密码",
  "new_password": "NewPass123"
}
```

**测试场景**：

✅ **成功案例**：
- 新密码：`NewPass123` → 应该成功
- 新密码：`MySecure2024` → 应该成功

❌ **失败案例**：
- 新密码：`short` → 错误：密码长度至少8个字符
- 新密码：`alllowercase123` → 错误：密码必须包含至少一个大写字母
- 新密码：`ALLUPPERCASE123` → 错误：密码必须包含至少一个小写字母
- 新密码：`NoNumbers` → 错误：密码必须包含至少一个数字

### 2. API频率限制

使用curl或Postman快速连续发送请求：

```bash
# 快速发送100个请求
for i in {1..100}; do
  curl http://localhost:8000/api/health
done
```

**预期结果**：
- 前60个请求：正常返回200
- 第61个请求开始：返回429状态码
- 响应体：`{"detail": "请求过于频繁，每分钟最多60次请求"}`

**响应头**：
```
X-RateLimit-Limit-Minute: 60
X-RateLimit-Limit-Hour: 1000
```

### 3. 请求体大小限制

尝试上传超过10MB的文件：

```bash
# 创建一个11MB的测试文件
dd if=/dev/zero of=test_large.bin bs=1M count=11

# 尝试上传
curl -X POST http://localhost:8000/api/some-endpoint \
  -F "file=@test_large.bin"
```

**预期结果**：
- 状态码：413
- 响应体：`{"detail": "请求体过大，最大允许10MB"}`

### 4. 并发控制

使用两个终端同时更新同一条记录：

**终端1**：
```bash
curl -X PUT http://localhost:8000/api/leave/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"version": 1, "status": "approved"}'
```

**终端2**（立即执行）：
```bash
curl -X PUT http://localhost:8000/api/leave/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"version": 1, "status": "rejected"}'
```

**预期结果**：
- 第一个请求：成功，返回200
- 第二个请求：失败，返回409
- 响应体：`{"detail": "数据已被其他用户修改，请刷新后重试"}`

### 5. 密码修改日志

修改密码后，可以查询日志（需要添加查询API）：

```sql
-- 直接查询数据库
SELECT 
    pcl.id,
    u1.real_name as user_name,
    u2.real_name as changed_by,
    pcl.change_type,
    pcl.ip_address,
    pcl.created_at
FROM password_change_logs pcl
JOIN users u1 ON pcl.user_id = u1.id
JOIN users u2 ON pcl.changed_by_id = u2.id
ORDER BY pcl.created_at DESC
LIMIT 10;
```

## 📊 监控和调试

### 查看日志

应用启动后会输出日志：

```
✓ 配置验证通过
✓ 数据库初始化完成
✓ Admin前端已挂载: /path/to/frontend/admin
✓ Mobile前端已挂载: /path/to/frontend/mobile
```

### 频率限制日志

当用户触发频率限制时：

```
WARNING - Rate limit exceeded for IP: 192.168.1.100, path: /api/some-endpoint
```

### 密码修改日志

当用户修改密码时：

```
INFO - Password change logged: user_id=1, changed_by=1, type=self_change, ip=192.168.1.100
```

## 🛠️ 配置调整

### 修改频率限制

编辑 `backend/main.py`：

```python
app.add_middleware(
    RateLimitMiddleware,
    requests_per_minute=100,  # 改为100次/分钟
    requests_per_hour=2000    # 改为2000次/小时
)
```

### 修改请求体大小限制

编辑 `backend/main.py`：

```python
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    max_size = 20 * 1024 * 1024  # 改为20MB
    # ...
```

### 添加白名单路径

编辑 `backend/middleware/rate_limit.py`：

```python
self.whitelist_paths = [
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/health",
    "/",
    "/api/public",  # 添加新的白名单路径
]
```

## 🐛 故障排查

### 问题1：迁移失败

**错误**：`数据库文件不存在`

**解决**：
```bash
# 确保在项目根目录执行
cd /path/to/project
python run_all_migrations.py
```

### 问题2：测试失败

**错误**：`ModuleNotFoundError: No module named 'pytz'`

**解决**：
```bash
pip install pytz
```

### 问题3：频率限制不生效

**原因**：可能在白名单路径中

**解决**：检查请求路径是否在白名单中，或修改白名单配置

### 问题4：密码修改日志未记录

**原因**：数据库表未创建

**解决**：
```bash
python run_migration_password_log.py
```

## 📚 更多文档

- [完整优化总结](./OPTIMIZATION_COMPLETE_SUMMARY.md)
- [安全功能使用指南](./docs/SECURITY_FEATURES_GUIDE.md)
- [优化进度报告](./OPTIMIZATION_PROGRESS.md)
- [TODO清单](./TODO.md)

## 🆘 获取帮助

如果遇到问题：

1. 查看日志输出
2. 检查数据库迁移状态
3. 运行测试验证功能
4. 查阅详细文档

---

**最后更新**：2024年12月4日
