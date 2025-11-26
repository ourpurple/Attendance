# 新架构下测试指南

## 目录

1. [测试概述](#测试概述)
2. [测试环境配置](#测试环境配置)
3. [测试架构](#测试架构)
4. [测试类型](#测试类型)
5. [编写测试](#编写测试)
6. [运行测试](#运行测试)
7. [测试最佳实践](#测试最佳实践)
8. [常见问题](#常见问题)

## 测试概述

在新架构下，测试体系采用分层测试策略，针对不同的架构层次编写相应的测试用例：

- **Repository层测试**：测试数据访问逻辑
- **Service层测试**：测试业务逻辑
- **API层测试**：测试HTTP端点
- **工具类测试**：测试通用工具函数

## 测试环境配置

### 1. 安装测试依赖

```bash
pip install -r requirements.txt
```

测试相关依赖已包含在 `requirements.txt` 中：
- `pytest==7.4.3` - 测试框架
- `pytest-asyncio==0.21.1` - 异步测试支持
- `pytest-cov==4.1.0` - 代码覆盖率

### 2. 测试配置文件

`pytest.ini` 配置文件包含：
- 测试路径配置
- 覆盖率配置
- 测试标记（markers）
- 输出格式配置

### 3. 测试数据库

测试使用内存SQLite数据库（`sqlite:///:memory:`），每个测试函数使用独立的数据库实例，确保测试隔离。

## 测试架构

### 测试文件结构

```
tests/
├── __init__.py
├── conftest.py              # 测试配置和fixtures
├── test_utils.py            # 工具类测试
├── test_repositories.py     # Repository层测试
├── test_services.py         # Service层测试
├── test_leave_service.py    # 请假服务测试
├── test_overtime_service.py # 加班服务测试
├── test_api.py              # API端点测试
└── test_config.py           # 配置管理测试
```

### 测试Fixtures

`conftest.py` 提供了以下测试fixtures：

#### 数据库相关

- `test_db`: 测试数据库会话（每个测试函数独立）
- `db_session`: 数据库会话别名（兼容性）

#### 测试客户端

- `client`: FastAPI测试客户端（已配置测试数据库）

#### 测试数据

- `sample_user_data`: 示例用户数据
- `sample_attendance_data`: 示例考勤数据
- `test_user_employee`: 测试员工用户
- `test_user_dept_head`: 测试部门主任用户
- `test_leave_type`: 测试请假类型

## 测试类型

### 1. Repository层测试

测试数据访问层的CRUD操作和查询方法。

**示例**：`tests/test_repositories.py`

```python
import pytest
from backend.repositories import UserRepository
from backend.models import User, UserRole
from backend.security import get_password_hash

class TestUserRepository:
    """UserRepository测试"""
    
    def test_create_user(self, test_db):
        """测试创建用户"""
        repo = UserRepository(test_db)
        user = repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            email="test@example.com",
            role=UserRole.EMPLOYEE
        )
        test_db.commit()
        
        assert user.id is not None
        assert user.username == "testuser"
        assert user.real_name == "测试用户"
    
    def test_get_by_username(self, test_db):
        """测试根据用户名获取用户"""
        repo = UserRepository(test_db)
        # 先创建用户
        repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        test_db.commit()
        
        # 查询用户
        user = repo.get_by_username("testuser")
        assert user is not None
        assert user.username == "testuser"
```

**测试要点**：
- 测试CRUD操作
- 测试查询方法
- 测试边界情况（不存在、重复等）

### 2. Service层测试

测试业务逻辑层的功能，包括业务规则验证、权限检查等。

**示例**：`tests/test_leave_service.py`

```python
import pytest
from datetime import datetime, timedelta
from backend.services.leave_service import LeaveService
from backend.exceptions import ValidationException, NotFoundException
from backend.models import LeaveStatus

def test_create_leave_application_employee(db_session, test_user_employee, test_leave_type):
    """测试员工创建请假申请"""
    service = LeaveService(db_session)
    
    start_date = datetime.now() + timedelta(days=1)
    end_date = datetime.now() + timedelta(days=2)
    
    leave = service.create_leave_application(
        user=test_user_employee,
        start_date=start_date,
        end_date=end_date,
        days=1.0,
        reason="测试请假",
        leave_type_id=test_leave_type.id
    )
    
    assert leave is not None
    assert leave.user_id == test_user_employee.id
    assert leave.days == 1.0
    assert leave.reason == "测试请假"
    assert leave.status == LeaveStatus.PENDING.value
    assert leave.leave_type_id == test_leave_type.id

def test_create_leave_application_invalid_date(db_session, test_user_employee, test_leave_type):
    """测试创建请假申请时结束日期早于开始日期"""
    service = LeaveService(db_session)
    
    start_date = datetime.now() + timedelta(days=2)
    end_date = datetime.now() + timedelta(days=1)
    
    with pytest.raises(ValidationException):
        service.create_leave_application(
            user=test_user_employee,
            start_date=start_date,
            end_date=end_date,
            days=1.0,
            reason="测试请假",
            leave_type_id=test_leave_type.id
        )
```

**测试要点**：
- 测试业务逻辑正确性
- 测试异常情况（验证失败、权限不足等）
- 测试事务管理
- 测试边界条件

### 3. API层测试

测试HTTP端点的完整流程，包括请求/响应、认证、错误处理等。

**示例**：`tests/test_api.py`

```python
import pytest
from backend.repositories import UserRepository
from backend.models import User, UserRole
from backend.security import get_password_hash, create_access_token

class TestAuthAPI:
    """认证API测试"""
    
    def test_login_success(self, client, test_db):
        """测试登录成功"""
        # 创建用户
        user_repo = UserRepository(test_db)
        user = user_repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        test_db.commit()
        
        # 登录
        response = client.post(
            "/api/auth/login",
            json={
                "username": "testuser",
                "password": "password123"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
    
    def test_login_invalid_credentials(self, client):
        """测试无效凭据登录"""
        response = client.post(
            "/api/auth/login",
            json={
                "username": "nonexistent",
                "password": "wrongpassword"
            }
        )
        
        assert response.status_code == 401
```

**测试要点**：
- 测试HTTP状态码
- 测试响应格式
- 测试认证和授权
- 测试错误处理

### 4. 工具类测试

测试通用工具函数的功能。

**示例**：`tests/test_utils.py`

```python
import pytest
from datetime import datetime, date
from backend.utils.date_utils import DateUtils
from backend.utils.permission_utils import PermissionUtils
from backend.models import User, UserRole

class TestDateUtils:
    """DateUtils测试"""
    
    def test_format_datetime(self):
        """测试格式化日期时间"""
        dt = datetime(2025, 1, 15, 14, 30, 0)
        result = DateUtils.format_datetime(dt)
        assert result == "2025-01-15 14:30:00"
    
    def test_format_date(self):
        """测试格式化日期"""
        d = date(2025, 1, 15)
        result = DateUtils.format_date(d)
        assert result == "2025-01-15"

class TestPermissionUtils:
    """PermissionUtils测试"""
    
    def test_require_admin_success(self, test_db):
        """测试管理员权限检查（成功）"""
        admin = User(
            username="admin",
            password_hash="hash",
            real_name="管理员",
            role=UserRole.ADMIN
        )
        PermissionUtils.require_admin(admin)
        # 不应该抛出异常
```

## 编写测试

### 1. 创建新的测试文件

在 `tests/` 目录下创建新的测试文件，命名格式：`test_*.py`

```python
"""
Service层测试示例
"""
import pytest
from backend.services.your_service import YourService
from backend.exceptions import ValidationException

def test_your_service_method(db_session, test_user_employee):
    """测试Service方法"""
    service = YourService(db_session)
    
    # 执行操作
    result = service.some_method(test_user_employee)
    
    # 断言
    assert result is not None
    assert result.some_field == "expected_value"
```

### 2. 使用Fixtures

使用 `conftest.py` 中定义的fixtures：

```python
def test_example(test_db, test_user_employee, test_leave_type):
    """使用多个fixtures"""
    # test_db: 数据库会话
    # test_user_employee: 测试员工用户
    # test_leave_type: 测试请假类型
    pass
```

### 3. 测试异常情况

使用 `pytest.raises` 测试异常：

```python
def test_validation_exception(db_session, test_user_employee):
    """测试验证异常"""
    service = YourService(db_session)
    
    with pytest.raises(ValidationException) as exc_info:
        service.invalid_operation(test_user_employee)
    
    assert "错误信息" in str(exc_info.value)
```

### 4. 创建自定义Fixtures

在测试文件中创建自定义fixtures：

```python
@pytest.fixture
def custom_test_data(test_db):
    """自定义测试数据"""
    # 创建测试数据
    data = create_test_data(test_db)
    return data
```

## 运行测试

### 1. 运行所有测试

```bash
# 运行所有测试
pytest

# 显示详细输出
pytest -v

# 显示更详细的输出
pytest -vv
```

### 2. 运行特定测试

```bash
# 运行特定文件
pytest tests/test_leave_service.py

# 运行特定测试类
pytest tests/test_repositories.py::TestUserRepository

# 运行特定测试函数
pytest tests/test_leave_service.py::test_create_leave_application_employee
```

### 3. 运行带标记的测试

```bash
# 运行单元测试
pytest -m unit

# 运行集成测试
pytest -m integration

# 排除慢速测试
pytest -m "not slow"
```

### 4. 查看代码覆盖率

```bash
# 生成覆盖率报告（终端）
pytest --cov=backend --cov-report=term-missing

# 生成HTML覆盖率报告
pytest --cov=backend --cov-report=html

# 查看HTML报告
# 打开 htmlcov/index.html
```

### 5. 并行运行测试

```bash
# 安装pytest-xdist
pip install pytest-xdist

# 并行运行测试（4个进程）
pytest -n 4
```

### 6. 只运行失败的测试

```bash
# 运行上次失败的测试
pytest --lf

# 运行失败的测试，然后运行其他测试
pytest --ff
```

## 测试最佳实践

### 1. 测试隔离

- ✅ 每个测试函数使用独立的数据库实例
- ✅ 测试之间不共享状态
- ✅ 使用fixtures确保测试数据隔离

### 2. 测试命名

- ✅ 使用描述性的测试函数名
- ✅ 遵循 `test_<功能>_<场景>` 命名模式
- ✅ 使用文档字符串说明测试目的

```python
def test_create_leave_application_employee(db_session, test_user_employee, test_leave_type):
    """测试员工创建请假申请"""
    pass

def test_create_leave_application_invalid_date(db_session, test_user_employee, test_leave_type):
    """测试创建请假申请时结束日期早于开始日期"""
    pass
```

### 3. 测试结构

遵循AAA模式（Arrange-Act-Assert）：

```python
def test_example(db_session, test_user_employee):
    # Arrange: 准备测试数据
    service = LeaveService(db_session)
    start_date = datetime.now() + timedelta(days=1)
    end_date = datetime.now() + timedelta(days=2)
    
    # Act: 执行操作
    leave = service.create_leave_application(
        user=test_user_employee,
        start_date=start_date,
        end_date=end_date,
        days=1.0,
        reason="测试",
        leave_type_id=1
    )
    
    # Assert: 验证结果
    assert leave is not None
    assert leave.days == 1.0
```

### 4. 测试覆盖

- ✅ 测试正常流程
- ✅ 测试异常情况
- ✅ 测试边界条件
- ✅ 测试权限验证

### 5. Mock外部依赖

对于外部API调用（如微信API），使用mock：

```python
from unittest.mock import patch, MagicMock

@patch('backend.services.wechat_message.get_access_token')
def test_send_message(mock_get_token, db_session):
    """测试发送消息（mock微信API）"""
    mock_get_token.return_value = "mock_token"
    
    # 测试代码
    pass
```

### 6. 测试数据管理

- ✅ 使用fixtures创建测试数据
- ✅ 避免硬编码测试数据
- ✅ 确保测试数据可重复

## 测试示例

### Repository层测试示例

```python
"""
Repository层测试示例
"""
import pytest
from backend.repositories import UserRepository
from backend.models import User, UserRole
from backend.security import get_password_hash

class TestUserRepository:
    """UserRepository测试"""
    
    def test_create_user(self, test_db):
        """测试创建用户"""
        repo = UserRepository(test_db)
        user = repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            email="test@example.com",
            role=UserRole.EMPLOYEE
        )
        test_db.commit()
        
        assert user.id is not None
        assert user.username == "testuser"
    
    def test_get_by_username_not_found(self, test_db):
        """测试获取不存在的用户"""
        repo = UserRepository(test_db)
        user = repo.get_by_username("nonexistent")
        assert user is None
```

### Service层测试示例

```python
"""
Service层测试示例
"""
import pytest
from datetime import datetime, timedelta
from backend.services.leave_service import LeaveService
from backend.exceptions import ValidationException, NotFoundException

def test_create_leave_application_employee(db_session, test_user_employee, test_leave_type):
    """测试员工创建请假申请"""
    service = LeaveService(db_session)
    
    start_date = datetime.now() + timedelta(days=1)
    end_date = datetime.now() + timedelta(days=2)
    
    leave = service.create_leave_application(
        user=test_user_employee,
        start_date=start_date,
        end_date=end_date,
        days=1.0,
        reason="测试请假",
        leave_type_id=test_leave_type.id
    )
    
    assert leave is not None
    assert leave.user_id == test_user_employee.id
    assert leave.status == LeaveStatus.PENDING.value

def test_create_leave_application_invalid_date(db_session, test_user_employee, test_leave_type):
    """测试创建请假申请时结束日期早于开始日期"""
    service = LeaveService(db_session)
    
    start_date = datetime.now() + timedelta(days=2)
    end_date = datetime.now() + timedelta(days=1)
    
    with pytest.raises(ValidationException):
        service.create_leave_application(
            user=test_user_employee,
            start_date=start_date,
            end_date=end_date,
            days=1.0,
            reason="测试请假",
            leave_type_id=test_leave_type.id
        )
```

### API层测试示例

```python
"""
API层测试示例
"""
import pytest
from backend.repositories import UserRepository
from backend.models import User, UserRole
from backend.security import get_password_hash, create_access_token

class TestLeaveAPI:
    """请假API测试"""
    
    def test_create_leave_application(self, client, test_db, test_user_employee, test_leave_type):
        """测试创建请假申请"""
        # 创建token
        token = create_access_token(data={"sub": test_user_employee.username})
        
        # 发送请求
        response = client.post(
            "/api/leave/",
            json={
                "start_date": "2025-01-20T09:00:00",
                "end_date": "2025-01-21T17:00:00",
                "days": 1.0,
                "reason": "测试请假",
                "leave_type_id": test_leave_type.id
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["days"] == 1.0
        assert data["reason"] == "测试请假"
```

## 常见问题

### 1. 数据库会话问题

**问题**：测试中数据库操作没有生效

**解决**：
- 确保使用 `test_db` fixture
- 需要提交的操作调用 `test_db.commit()`
- Service层使用 `@transaction` 装饰器会自动提交

### 2. 依赖注入问题

**问题**：测试API端点时依赖注入失败

**解决**：
- 使用 `client` fixture，它已配置好依赖覆盖
- 如需自定义依赖，使用 `app.dependency_overrides`

```python
def test_custom_dependency(client, test_db):
    """自定义依赖注入"""
    def override_get_current_user():
        return test_user_employee
    
    app.dependency_overrides[get_current_user] = override_get_current_user
    
    try:
        # 测试代码
        pass
    finally:
        app.dependency_overrides.clear()
```

### 3. 异步测试

**问题**：如何测试异步函数

**解决**：
- 使用 `pytest-asyncio`
- 测试函数使用 `async def`
- 使用 `@pytest.mark.asyncio` 标记

```python
import pytest

@pytest.mark.asyncio
async def test_async_function():
    """测试异步函数"""
    result = await async_function()
    assert result is not None
```

### 4. 测试隔离

**问题**：测试之间相互影响

**解决**：
- 每个测试函数使用独立的数据库实例（`test_db` fixture）
- 避免使用全局变量
- 使用fixtures管理测试数据

### 5. 测试性能

**问题**：测试运行太慢

**解决**：
- 使用内存数据库（已配置）
- 并行运行测试（`pytest-xdist`）
- 标记慢速测试，使用 `-m "not slow"` 跳过

## 测试覆盖率目标

建议的测试覆盖率目标：

- **Repository层**：> 90%
- **Service层**：> 80%
- **API层**：> 70%
- **工具类**：> 90%

查看覆盖率报告：

```bash
pytest --cov=backend --cov-report=html
# 打开 htmlcov/index.html 查看详细报告
```

## 持续集成

### GitHub Actions示例

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
      - name: Run tests
        run: |
          pytest --cov=backend --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

## 总结

新架构下的测试体系：

1. **分层测试**：针对不同架构层次编写测试
2. **测试隔离**：每个测试使用独立的数据库实例
3. **Fixtures管理**：使用pytest fixtures管理测试数据和配置
4. **覆盖率监控**：使用pytest-cov监控代码覆盖率
5. **最佳实践**：遵循测试最佳实践，确保测试质量

通过完善的测试体系，可以：
- ✅ 确保代码质量
- ✅ 快速发现bug
- ✅ 支持重构
- ✅ 提供文档作用

---

**测试文档版本**：1.0  
**最后更新**：2024年
