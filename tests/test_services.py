"""
Service层测试
"""
import pytest
from datetime import datetime, date, timedelta
from backend.services import AttendanceService, UserService, LeaveService
from backend.models import User, UserRole, AttendancePolicy, LeaveType, LeaveStatus
from backend.repositories import UserRepository
from backend.security import get_password_hash
from backend.exceptions import ValidationException, NotFoundException, ConflictException


class TestAttendanceService:
    """AttendanceService测试"""
    
    def test_get_policy_for_date(self, test_db):
        """测试获取日期策略"""
        # 创建策略
        policy = AttendancePolicy(
            name="测试策略",
            work_start_time="09:00",
            work_end_time="17:30",
            checkin_start_time="08:00",
            checkin_end_time="09:30",
            checkout_start_time="17:00",
            checkout_end_time="20:00",
            is_active=True
        )
        test_db.add(policy)
        test_db.commit()
        
        service = AttendanceService(test_db)
        check_date = datetime.now()
        rules = service.get_policy_for_date(policy, check_date)
        
        assert rules['work_start_time'] == "09:00"
        assert rules['work_end_time'] == "17:30"
    
    def test_calculate_work_hours(self):
        """测试计算工作时长"""
        checkin = datetime(2025, 1, 15, 9, 0)
        checkout = datetime(2025, 1, 15, 17, 30)
        
        hours = AttendanceService.calculate_work_hours(checkin, checkout)
        assert hours == 8.5
    
    def test_get_leave_period_for_date_no_leave(self, test_db):
        """测试获取请假时段（无请假）"""
        # 创建用户
        user_repo = UserRepository(test_db)
        user = user_repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        test_db.commit()
        
        service = AttendanceService(test_db)
        result = service.get_leave_period_for_date(user.id, date.today())
        
        assert result['has_leave'] is False
        assert result['morning_leave'] is False
        assert result['afternoon_leave'] is False


class TestUserService:
    """UserService测试"""
    
    def test_create_user(self, test_db):
        """测试创建用户"""
        service = UserService(test_db)
        user = service.create_user(
            username="testuser",
            password="Password123",
            real_name="测试用户",
            email="test@example.com",
            role=UserRole.EMPLOYEE
        )
        
        assert user.id is not None
        assert user.username == "testuser"
        assert user.real_name == "测试用户"
    
    def test_create_user_duplicate_username(self, test_db):
        """测试创建重复用户名"""
        service = UserService(test_db)
        service.create_user(
            username="testuser",
            password="Password123",
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        
        # 尝试创建同名用户
        with pytest.raises(ConflictException):
            service.create_user(
                username="testuser",
                password="password123",
                real_name="另一个用户",
                role=UserRole.EMPLOYEE
            )
    
    def test_get_user_not_found(self, test_db):
        """测试获取不存在的用户"""
        service = UserService(test_db)
        with pytest.raises(NotFoundException):
            service.get_user(999)
    
    def test_update_user(self, test_db):
        """测试更新用户"""
        service = UserService(test_db)
        user = service.create_user(
            username="testuser",
            password="Password123",
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        
        updated = service.update_user(user.id, real_name="更新后的名字")
        assert updated.real_name == "更新后的名字"
    
    def test_delete_user_with_records(self, test_db):
        """测试删除有关联记录的用户"""
        service = UserService(test_db)
        user = service.create_user(
            username="testuser",
            password="Password123",
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        
        # 创建考勤记录
        from backend.repositories import AttendanceRepository
        attendance_repo = AttendanceRepository(test_db)
        attendance_repo.create(
            user_id=user.id,
            date=datetime.combine(date.today(), datetime.min.time()),
            checkin_time=datetime.now()
        )
        test_db.commit()
        
        # 尝试删除
        with pytest.raises(ValidationException):
            service.delete_user(user.id, 999)  # current_user_id=999

