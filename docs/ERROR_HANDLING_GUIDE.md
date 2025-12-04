# 错误处理系统使用指南

## 概述

本系统实现了完善的全局错误处理机制，提供统一的错误响应格式、错误信息脱敏、详细的错误日志记录等功能。

## 错误响应格式

所有API错误响应都遵循统一的JSON格式：

```json
{
  "code": "ERROR_CODE",
  "message": "用户友好的错误消息",
  "detail": "详细信息（仅DEBUG模式）"
}
```

### 字段说明

- **code**: 错误代码，用于程序化处理错误
- **message**: 用户友好的错误消息，可直接展示给用户
- **detail**: 详细的错误信息（仅在DEBUG模式下返回，生产环境不返回）

## 自定义异常类

系统提供了多种自定义异常类，位于 `backend/exceptions/__init__.py`：

### 1. BusinessException（业务异常基类）

所有业务异常的基类。

```python
from backend.exceptions import BusinessException

# 抛出业务异常
raise BusinessException("操作失败", status_code=400)
```

**HTTP状态码**: 400（可自定义）  
**错误代码**: BUSINESS_ERROR

### 2. ValidationException（验证异常）

用于数据验证失败的场景。

```python
from backend.exceptions import ValidationException

# 验证失败
raise ValidationException("用户名格式不正确")
```

**HTTP状态码**: 422  
**错误代码**: BUSINESS_ERROR

### 3. NotFoundException（资源不存在异常）

用于请求的资源不存在的场景。

```python
from backend.exceptions import NotFoundException

# 资源不存在
raise NotFoundException("用户不存在")
# 或使用默认消息
raise NotFoundException()  # "资源不存在"
```

**HTTP状态码**: 404  
**错误代码**: BUSINESS_ERROR

### 4. PermissionDeniedException（权限拒绝异常）

用于用户没有权限执行操作的场景。

```python
from backend.exceptions import PermissionDeniedException

# 权限不足
raise PermissionDeniedException("您没有权限删除此记录")
# 或使用默认消息
raise PermissionDeniedException()  # "没有权限执行此操作"
```

**HTTP状态码**: 403  
**错误代码**: BUSINESS_ERROR

### 5. ConflictException（冲突异常）

用于数据冲突的场景，如乐观锁冲突。

```python
from backend.exceptions import ConflictException

# 数据冲突
raise ConflictException("数据已被其他用户修改")
# 或使用默认消息
raise ConflictException()  # "数据已被修改，请刷新后重试"
```

**HTTP状态码**: 409  
**错误代码**: BUSINESS_ERROR

### 6. AuthenticationException（认证异常）

用于认证失败的场景。

```python
from backend.exceptions import AuthenticationException

# 认证失败
raise AuthenticationException("用户名或密码错误")
# 或使用默认消息
raise AuthenticationException()  # "认证失败"
```

**HTTP状态码**: 401  
**错误代码**: BUSINESS_ERROR

### 7. RateLimitException（频率限制异常）

用于请求频率超限的场景。

```python
from backend.exceptions import RateLimitException

# 请求过于频繁
raise RateLimitException("请求过于频繁，请1分钟后再试")
# 或使用默认消息
raise RateLimitException()  # "请求过于频繁，请稍后再试"
```

**HTTP状态码**: 429  
**错误代码**: BUSINESS_ERROR

## 使用示例

### 在路由中使用

```python
from fastapi import APIRouter, Depends
from backend.exceptions import NotFoundException, PermissionDeniedException
from backend.dependencies import get_current_user

router = APIRouter()

@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    current_user = Depends(get_current_user)
):
    # 查询用户
    user = db.query(User).filter(User.id == user_id).first()
    
    # 用户不存在
    if not user:
        raise NotFoundException(f"用户ID {user_id} 不存在")
    
    # 权限检查
    if not current_user.is_admin and user.id != current_user.id:
        raise PermissionDeniedException("您只能查看自己的信息")
    
    return user
```

### 在服务层使用

```python
from backend.exceptions import ValidationException, ConflictException

class UserService:
    def update_user(self, user_id: int, data: dict, version: int):
        user = self.get_user(user_id)
        
        # 验证数据
        if not data.get("username"):
            raise ValidationException("用户名不能为空")
        
        # 乐观锁检查
        if user.version != version:
            raise ConflictException("用户信息已被修改，请刷新后重试")
        
        # 更新用户
        user.username = data["username"]
        user.version += 1
        db.commit()
        
        return user
```

## 数据库异常处理

系统自动处理SQLAlchemy异常，并转换为友好的错误消息：

### 唯一约束冲突

```python
# 数据库抛出 IntegrityError (UNIQUE constraint)
# 自动转换为：
{
  "code": "DUPLICATE_ERROR",
  "message": "数据已存在，不能重复创建",
  "detail": "..." // 仅DEBUG模式
}
```

**HTTP状态码**: 409

### 外键约束错误

```python
# 数据库抛出 IntegrityError (FOREIGN KEY constraint)
# 自动转换为：
{
  "code": "FOREIGN_KEY_ERROR",
  "message": "关联数据不存在",
  "detail": "..." // 仅DEBUG模式
}
```

**HTTP状态码**: 400

### 非空约束错误

```python
# 数据库抛出 IntegrityError (NOT NULL constraint)
# 自动转换为：
{
  "code": "NULL_VALUE_ERROR",
  "message": "必填字段不能为空",
  "detail": "..." // 仅DEBUG模式
}
```

**HTTP状态码**: 400

### 其他数据库错误

```python
# 其他SQLAlchemy错误
# 自动转换为：
{
  "code": "DATABASE_ERROR",
  "message": "数据库操作失败",
  "detail": "..." // 仅DEBUG模式
}
```

**HTTP状态码**: 500

## 请求验证错误

FastAPI的请求验证错误会自动处理：

```python
# Pydantic验证失败
# 自动转换为：
{
  "code": "VALIDATION_ERROR",
  "message": "请求参数验证失败",
  "detail": [
    "body.username: field required",
    "body.age: value is not a valid integer"
  ] // 仅DEBUG模式
}
```

**HTTP状态码**: 422

## 通用异常处理

所有未被捕获的异常都会被全局异常处理器捕获：

```python
# 任何未处理的异常
# 自动转换为：
{
  "code": "INTERNAL_ERROR",
  "message": "服务器内部错误",
  "detail": "完整的堆栈跟踪..." // 仅DEBUG模式
}
```

**HTTP状态码**: 500

## 错误日志

所有错误都会被记录到日志中，包含以下信息：

- 错误类型和消息
- 请求路径
- HTTP方法
- 客户端IP地址
- 完整的堆栈跟踪（ERROR级别）

### 日志级别

- **WARNING**: 业务异常、验证异常（预期的错误）
- **ERROR**: 数据库异常、通用异常（非预期的错误）

### 日志示例

```
2024-12-04 21:45:26,581 - backend.middleware.exception_handler - WARNING - 业务异常: 用户不存在 (路径: /api/users/999, 方法: GET, 客户端: 192.168.1.100)

2024-12-04 21:45:26,899 - backend.middleware.exception_handler - ERROR - 未处理的异常: ZeroDivisionError: division by zero (路径: /api/calculate, 方法: POST, 客户端: 192.168.1.100)
Traceback (most recent call last):
  ...
```

## 安全特性

### 1. 错误信息脱敏

生产环境下，敏感的错误信息（如堆栈跟踪、数据库错误详情）不会返回给客户端，只会记录到日志中。

```python
# 开发环境 (DEBUG=True)
{
  "code": "DATABASE_ERROR",
  "message": "数据库操作失败",
  "detail": "IntegrityError: UNIQUE constraint failed: users.username"
}

# 生产环境 (DEBUG=False)
{
  "code": "DATABASE_ERROR",
  "message": "数据库操作失败"
  // detail字段不返回
}
```

### 2. 统一错误格式

所有错误都使用统一的JSON格式，避免泄露系统内部信息。

### 3. 详细的日志记录

所有错误都会记录到日志中，便于问题排查，同时不会暴露给客户端。

## 配置

错误处理系统的行为由环境变量控制：

```bash
# .env文件
DEBUG=False  # 生产环境设置为False，开发环境设置为True
```

- **DEBUG=True**: 返回详细的错误信息（detail字段）
- **DEBUG=False**: 只返回用户友好的错误消息，不返回敏感信息

## 最佳实践

### 1. 使用合适的异常类型

根据错误场景选择合适的异常类型：

- 资源不存在 → `NotFoundException`
- 权限不足 → `PermissionDeniedException`
- 数据验证失败 → `ValidationException`
- 数据冲突 → `ConflictException`
- 认证失败 → `AuthenticationException`
- 频率限制 → `RateLimitException`
- 其他业务错误 → `BusinessException`

### 2. 提供清晰的错误消息

错误消息应该：
- 清晰描述问题
- 提供解决建议（如果可能）
- 避免技术术语（面向用户）

```python
# 好的错误消息
raise NotFoundException("用户ID 123 不存在")
raise ValidationException("密码长度必须至少8位")
raise PermissionDeniedException("您没有权限删除此记录，请联系管理员")

# 不好的错误消息
raise NotFoundException("Not found")
raise ValidationException("Invalid input")
raise PermissionDeniedException("Access denied")
```

### 3. 在合适的层级抛出异常

- **路由层**: 处理HTTP相关的错误（如认证、权限）
- **服务层**: 处理业务逻辑错误（如验证、冲突）
- **仓储层**: 让数据库异常向上传播，由全局处理器处理

### 4. 不要捕获所有异常

避免使用 `except Exception` 捕获所有异常，让全局异常处理器处理未预期的错误。

```python
# 不推荐
try:
    user = get_user(user_id)
except Exception:
    return {"error": "Something went wrong"}

# 推荐
user = get_user(user_id)  # 让异常向上传播
if not user:
    raise NotFoundException(f"用户ID {user_id} 不存在")
```

### 5. 记录重要的上下文信息

在抛出异常时，包含有助于调试的上下文信息：

```python
# 包含上下文信息
raise ValidationException(f"用户名 '{username}' 已被使用")
raise ConflictException(f"订单 {order_id} 已被处理，当前状态: {order.status}")
```

## 测试

系统提供了完整的测试用例，位于 `tests/test_exception_handler.py`：

```bash
# 运行异常处理测试
pytest tests/test_exception_handler.py -v

# 运行所有测试
pytest tests/ -v
```

测试覆盖：
- 7种自定义异常类型
- 异常处理器功能
- 错误响应格式
- HTTP状态码正确性

## 故障排查

### 问题：错误信息没有返回detail字段

**原因**: 生产环境下（DEBUG=False），detail字段不会返回。

**解决**: 
- 开发环境：设置 `DEBUG=True`
- 生产环境：查看日志文件获取详细信息

### 问题：异常没有被正确处理

**原因**: 可能是异常类型不在处理器列表中。

**解决**: 
- 检查是否使用了自定义异常类
- 查看日志确认异常类型
- 如需要，添加新的异常处理器

### 问题：日志中没有错误记录

**原因**: 日志级别配置不正确。

**解决**: 
- 检查 `backend/main.py` 中的日志配置
- 确保日志级别设置为 `INFO` 或更低

## 相关文档

- [API文档](http://localhost:8000/docs) - 查看所有API端点和错误响应
- [安全功能指南](./SECURITY_FEATURES_GUIDE.md) - 安全相关功能
- [开发者指南](./developer_guide.md) - 开发规范和最佳实践

## 总结

本系统的错误处理机制提供了：

✅ 统一的错误响应格式  
✅ 7种自定义异常类型  
✅ 自动的数据库异常处理  
✅ 错误信息脱敏（生产环境）  
✅ 详细的错误日志记录  
✅ 完整的测试覆盖  
✅ 清晰的使用文档

通过使用这套错误处理系统，可以：
- 提供一致的用户体验
- 简化错误处理代码
- 提高系统安全性
- 便于问题排查和调试
