"""
Repository层测试
"""
import pytest
from datetime import datetime, date
from backend.repositories import (
    UserRepository,
    AttendanceRepository,
    LeaveRepository,
    OvertimeRepository,
    DepartmentRepository
)
from backend.models import User, Attendance, LeaveApplication, OvertimeApplication, Department, UserRole, LeaveStatus, OvertimeStatus
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
        repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        test_db.commit()
        
        user = repo.get_by_username("testuser")
        assert user is not None
        assert user.username == "testuser"
    
    def test_get_by_username_not_found(self, test_db):
        """测试获取不存在的用户"""
        repo = UserRepository(test_db)
        user = repo.get_by_username("nonexistent")
        assert user is None
    
    def test_update_user(self, test_db):
        """测试更新用户"""
        repo = UserRepository(test_db)
        user = repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        test_db.commit()
        
        updated = repo.update(user.id, real_name="更新后的名字")
        test_db.commit()
        
        assert updated.real_name == "更新后的名字"
    
    def test_delete_user(self, test_db):
        """测试删除用户"""
        repo = UserRepository(test_db)
        user = repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        test_db.commit()
        
        result = repo.delete(user.id)
        test_db.commit()
        
        assert result is True
        assert repo.get(user.id) is None


class TestAttendanceRepository:
    """AttendanceRepository测试"""
    
    def test_create_attendance(self, test_db):
        """测试创建考勤记录"""
        # 先创建用户
        user_repo = UserRepository(test_db)
        user = user_repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        test_db.commit()
        
        # 创建考勤记录
        repo = AttendanceRepository(test_db)
        attendance = repo.create(
            user_id=user.id,
            date=datetime.combine(date.today(), datetime.min.time()),
            checkin_time=datetime.now()
        )
        test_db.commit()
        
        assert attendance.id is not None
        assert attendance.user_id == user.id
    
    def test_get_by_user_and_date(self, test_db):
        """测试根据用户和日期获取考勤记录"""
        # 创建用户和考勤记录
        user_repo = UserRepository(test_db)
        user = user_repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        test_db.commit()
        
        repo = AttendanceRepository(test_db)
        today = date.today()
        attendance = repo.create(
            user_id=user.id,
            date=datetime.combine(today, datetime.min.time()),
            checkin_time=datetime.now()
        )
        test_db.commit()
        
        found = repo.get_by_user_and_date(user.id, today)
        assert found is not None
        assert found.id == attendance.id

