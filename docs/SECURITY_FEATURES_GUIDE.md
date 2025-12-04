# 安全功能使用指南

本指南介绍如何使用系统中新增的安全功能。

## 目录
1. [密码安全](#密码安全)
2. [API频率限制](#api频率限制)
3. [时区处理](#时区处理)
4. [并发控制](#并发控制)

---

## 密码安全

### 功能概述
系统提供了密码强度验证和安全的密码哈希功能。

### 密码要求
- 最少8个字符
- 至少包含一个大写字母
- 至少包含一个小写字母
- 至少包含一个数字

### 使用示例

#### 1. 用户注册时验证密码

```python
from fastapi import APIRouter, HTTPException
from backend.security import validate_password_strength, get_password_hash

router = APIRouter()

@router.post("/register")
def register_user(username: str, password: str):
    # 验证密码强度
    is_valid, error_msg = validate_password_strength(password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # 生成密码哈希
    hashed_password = get_password_hash(password)
    
    # 创建用户
    user = User(username=username, hashed_password=hashed_password)
    db.add(user)
    db.commit()
    
    return {"message": "注册成功"}
```

#### 2. 修改密码

```python
@router.post("/change-password")
def change_password(
    old_password: str,
    new_password: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 验证旧密码
    if not verify_password(old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="旧密码错误")
    
    # 验证新密码强度
    is_valid, error_msg = validate_password_strength(new_password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # 更新密码
    current_user.hashed_password = get_password_hash(new_password)
    db.commit()
    
    return {"message": "密码修改成功"}
```

### 前端集成

在前端添加密码强度提示：

```javascript
function validatePassword(password) {
    const errors = [];
    
    if (password.length < 8) {
        errors.push("密码长度至少8个字符");
    }
    if (!/[A-Z]/.test(password)) {
        errors.push("密码必须包含至少一个大写字母");
    }
    if (!/[a-z]/.test(password)) {
        errors.push("密码必须包含至少一个小写字母");
    }
    if (!/[0-9]/.test(password)) {
        errors.push("密码必须包含至少一个数字");
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

// 使用示例
const result = validatePassword("MyPass123");
if (!result.isValid) {
    alert(result.errors.join("\n"));
}
```

---

## API频率限制

### 功能概述
系统自动限制API请求频率，防止暴力破解和DDoS攻击。

### 限制规则
- 每分钟最多60次请求
- 每小时最多1000次请求
- 超过限制返回429状态码

### 白名单路径
以下路径不受频率限制：
- `/docs` - API文档
- `/redoc` - ReDoc文档
- `/openapi.json` - OpenAPI规范
- `/api/health` - 健康检查
- `/` - 根路径

### 响应头
系统会在响应中添加以下头部：
- `X-RateLimit-Limit-Minute` - 每分钟限制
- `X-RateLimit-Limit-Hour` - 每小时限制

### 前端处理

```javascript
async function apiRequest(url, options) {
    try {
        const response = await fetch(url, options);
        
        if (response.status === 429) {
            // 频率限制
            const data = await response.json();
            alert(data.detail);
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error("请求失败:", error);
        return null;
    }
}
```

### 配置修改

如需修改频率限制，编辑 `backend/main.py`：

```python
app.add_middleware(
    RateLimitMiddleware,
    requests_per_minute=100,  # 修改为100次/分钟
    requests_per_hour=2000    # 修改为2000次/小时
)
```

---

## 时区处理

### 功能概述
系统统一使用UTC时间存储，本地时间显示，避免时区混乱。

### 设计原则
- **数据库存储**：始终使用UTC时间
- **前端显示**：转换为本地时间（Asia/Shanghai, UTC+8）
- **API传输**：使用ISO 8601格式，带时区信息

### 后端使用

#### 1. 存储时间到数据库

```python
from backend.utils.timezone import to_utc, now_utc

# 方式1：使用当前UTC时间
attendance = Attendance(
    user_id=user_id,
    check_in_time=now_utc(),
    created_at=now_utc()
)

# 方式2：将本地时间转换为UTC
from datetime import datetime
local_time = datetime(2024, 1, 1, 9, 0, 0)  # 本地时间 9:00
utc_time = to_utc(local_time)  # 转换为UTC 1:00

attendance = Attendance(
    user_id=user_id,
    check_in_time=utc_time
)
```

#### 2. 返回时间给前端

```python
from backend.utils.timezone import to_local

@router.get("/attendance/{id}")
def get_attendance(id: int, db: Session = Depends(get_db)):
    attendance = db.query(Attendance).filter(Attendance.id == id).first()
    
    return {
        "id": attendance.id,
        "user_id": attendance.user_id,
        # 转换为本地时间
        "check_in_time": to_local(attendance.check_in_time).isoformat(),
        "created_at": to_local(attendance.created_at).isoformat()
    }
```

#### 3. 日期范围查询

```python
from backend.utils.timezone import get_date_range_utc
from datetime import date

@router.get("/attendance/range")
def get_attendance_range(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db)
):
    # 获取日期范围的UTC时间
    start_utc, end_utc = get_date_range_utc(start_date, end_date)
    
    # 查询数据库
    attendances = db.query(Attendance).filter(
        Attendance.check_in_time >= start_utc,
        Attendance.check_in_time <= end_utc
    ).all()
    
    return attendances
```

### 前端使用

#### JavaScript时区处理

```javascript
// 将服务器返回的UTC时间转换为本地时间显示
function formatDateTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// 将本地时间转换为ISO格式发送给服务器
function toISOString(localDate) {
    return localDate.toISOString();
}

// 使用示例
const serverTime = "2024-01-01T01:00:00Z";  // UTC时间
const displayTime = formatDateTime(serverTime);  // "2024-01-01 09:00:00"
```

---

## 并发控制

### 功能概述
使用乐观锁防止并发更新冲突，确保数据一致性。

### 工作原理
1. 每个实体有一个`version`字段
2. 更新前检查版本号
3. 版本不匹配则拒绝更新（返回409状态码）
4. 更新成功后版本号+1

### 后端使用

#### 1. 在模型中添加version字段

```python
from sqlalchemy import Column, Integer

class LeaveApplication(Base):
    __tablename__ = "leave_applications"
    
    id = Column(Integer, primary_key=True)
    version = Column(Integer, default=1, nullable=False)  # 添加版本字段
    # 其他字段...
```

#### 2. 在Service中使用乐观锁

```python
from backend.utils.optimistic_lock import (
    with_optimistic_lock,
    check_version,
    increment_version
)

class LeaveService:
    @with_optimistic_lock
    def approve_leave(
        self,
        leave_id: int,
        expected_version: int,
        approver_id: int,
        comment: str
    ):
        # 查询请假申请
        leave = self.db.query(LeaveApplication).filter(
            LeaveApplication.id == leave_id
        ).first()
        
        if not leave:
            raise NotFoundException("请假申请不存在")
        
        # 检查版本（防止并发修改）
        check_version(leave, expected_version)
        
        # 更新状态
        leave.status = "approved"
        leave.approver_id = approver_id
        leave.comment = comment
        leave.approved_at = now_utc()
        
        # 增加版本号
        increment_version(leave)
        
        self.db.commit()
        return leave
```

#### 3. 在路由中调用

```python
@router.post("/leave/{leave_id}/approve")
def approve_leave(
    leave_id: int,
    version: int,  # 前端传递的版本号
    comment: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    service = LeaveService(db)
    
    try:
        leave = service.approve_leave(
            leave_id=leave_id,
            expected_version=version,
            approver_id=current_user.id,
            comment=comment
        )
        return {"message": "审批成功", "version": leave.version}
    except HTTPException as e:
        if e.status_code == 409:
            # 并发冲突
            return {"error": "数据已被其他用户修改，请刷新后重试"}
        raise
```

### 前端使用

#### 1. 获取数据时保存版本号

```javascript
let currentLeave = null;

async function loadLeave(leaveId) {
    const response = await fetch(`/api/leave/${leaveId}`);
    currentLeave = await response.json();
    
    // 保存版本号
    console.log("当前版本:", currentLeave.version);
}
```

#### 2. 更新时传递版本号

```javascript
async function approveLeave(leaveId, comment) {
    const response = await fetch(`/api/leave/${leaveId}/approve`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            version: currentLeave.version,  // 传递版本号
            comment: comment
        })
    });
    
    if (response.status === 409) {
        // 并发冲突
        alert("数据已被其他用户修改，请刷新后重试");
        await loadLeave(leaveId);  // 重新加载数据
        return false;
    }
    
    const result = await response.json();
    // 更新本地版本号
    currentLeave.version = result.version;
    
    return true;
}
```

#### 3. 处理冲突

```javascript
async function handleUpdate(leaveId, data) {
    let retries = 3;
    
    while (retries > 0) {
        try {
            const success = await approveLeave(leaveId, data.comment);
            if (success) {
                return true;
            }
            
            // 冲突，重试
            retries--;
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error("更新失败:", error);
            return false;
        }
    }
    
    alert("更新失败，请稍后重试");
    return false;
}
```

---

## 最佳实践

### 1. 密码安全
- ✅ 始终在前端和后端都验证密码强度
- ✅ 提供实时的密码强度提示
- ✅ 定期提醒用户修改密码
- ✅ 记录密码修改日志

### 2. API安全
- ✅ 合理设置频率限制
- ✅ 为重要接口设置更严格的限制
- ✅ 监控异常请求模式
- ✅ 提供友好的错误提示

### 3. 时区处理
- ✅ 数据库始终存储UTC时间
- ✅ API传输使用ISO 8601格式
- ✅ 前端显示转换为本地时间
- ✅ 日志记录包含时区信息

### 4. 并发控制
- ✅ 关键数据表添加version字段
- ✅ 更新操作使用乐观锁
- ✅ 提供友好的冲突提示
- ✅ 前端实现自动重试机制

---

## 故障排查

### 密码验证失败
**问题**：用户无法注册，提示密码不符合要求

**解决方案**：
1. 检查密码是否满足所有要求（长度、大小写、数字）
2. 查看具体的错误消息
3. 确认前端验证逻辑与后端一致

### 频率限制触发
**问题**：正常用户被限制访问

**解决方案**：
1. 检查是否有自动化脚本频繁请求
2. 调整频率限制参数
3. 将特定路径添加到白名单
4. 检查是否有代理导致IP识别错误

### 时区显示错误
**问题**：时间显示不正确

**解决方案**：
1. 确认数据库存储的是UTC时间
2. 检查前端是否正确转换时区
3. 验证服务器时区设置
4. 使用时区工具类进行转换

### 并发冲突频繁
**问题**：用户频繁遇到"数据已被修改"提示

**解决方案**：
1. 实现前端自动重试机制
2. 减少数据刷新频率
3. 优化更新逻辑，减少冲突可能
4. 考虑使用悲观锁（数据库锁）

---

## 相关文档

- [安全优化总结](../SECURITY_OPTIMIZATION_SUMMARY.md)
- [API文档](http://localhost:8000/docs)
- [开发者指南](./developer_guide.md)

---

**最后更新**：2024年12月4日
