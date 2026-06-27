"""
pytest配置文件
提供测试用的fixtures和配置
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from backend.database import Base, get_db
from backend.main import app
from backend.config import settings


# 测试数据库URL（使用内存SQLite）
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="function")
def test_db():
    """
    创建测试数据库会话
    每个测试函数使用独立的数据库
    """
    # 创建内存数据库引擎
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    
    # 创建表
    Base.metadata.create_all(bind=engine)
    
    # 创建会话
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    # 创建数据库会话
    db = TestingSessionLocal()
    
    try:
        yield db
    finally:
        db.close()
        # 清理表
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(test_db):
    """
    创建测试客户端
    使用测试数据库覆盖get_db依赖
    """
    def override_get_db():
        try:
            yield test_db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as test_client:
        yield test_client
    
    # 清理依赖覆盖
    app.dependency_overrides.clear()


@pytest.fixture
def sample_user_data():
    """示例用户数据"""
    return {
        "username": "testuser",
        "password": "testpass123",
        "real_name": "测试用户",
        "email": "test@example.com",
        "phone": "13800138000",
        "role": "employee",
        "department_id": 1,
    }


@pytest.fixture
def sample_attendance_data():
    """示例考勤数据"""
    from datetime import datetime, date
    return {
        "user_id": 1,
        "date": datetime.combine(date.today(), datetime.min.time()),
        "checkin_time": datetime.now(),
        "checkin_location": "测试地点",
        "checkin_latitude": 39.9042,
        "checkin_longitude": 116.4074,
    }


@pytest.fixture
def test_user_employee(test_db):
    """创建测试员工用户"""
    from backend.models import User, UserRole
    from backend.security import get_password_hash
    
    user = User(
        username="test_employee",
        password_hash=get_password_hash("password123"),
        real_name="测试员工",
        role=UserRole.EMPLOYEE,
        is_active=True
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def test_user_dept_head(test_db):
    """创建测试部门主任用户"""
    from backend.models import User, UserRole
    from backend.security import get_password_hash
    
    user = User(
        username="test_dept_head",
        password_hash=get_password_hash("password123"),
        real_name="测试部门主任",
        role=UserRole.DEPARTMENT_HEAD,
        is_active=True
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def test_leave_type(test_db):
    """创建测试请假类型"""
    from backend.models import LeaveType
    
    leave_type = LeaveType(
        name="年假",
        is_active=True
    )
    test_db.add(leave_type)
    test_db.commit()
    test_db.refresh(leave_type)
    return leave_type


@pytest.fixture
def db_session(test_db):
    """数据库会话别名（用于兼容性）"""
    return test_db

