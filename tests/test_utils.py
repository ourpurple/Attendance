"""
工具类测试
"""
import pytest
from datetime import datetime, date
from backend.utils.date_utils import DateUtils
from backend.utils.response_utils import ResponseUtils
from backend.utils.permission_utils import PermissionUtils
from backend.models import User, UserRole


class TestDateUtils:
    """DateUtils测试"""
    
    def test_format_datetime(self):
        """测试日期时间格式化"""
        dt = datetime(2025, 1, 15, 14, 30)
        result = DateUtils.format_datetime(dt)
        assert result == "2025-01-15 14:30"
    
    def test_format_datetime_none(self):
        """测试None值处理"""
        result = DateUtils.format_datetime(None)
        assert result == ""
    
    def test_format_date(self):
        """测试日期格式化"""
        d = date(2025, 1, 15)
        result = DateUtils.format_date(d)
        assert result == "2025-01-15"
    
    def test_format_time(self):
        """测试时间格式化"""
        dt = datetime(2025, 1, 15, 14, 30)
        result = DateUtils.format_time(dt)
        assert result == "14:30"
    
    def test_parse_date(self):
        """测试日期解析"""
        result = DateUtils.parse_date("2025-01-15")
        assert result == date(2025, 1, 15)
    
    def test_parse_date_invalid(self):
        """测试无效日期解析"""
        result = DateUtils.parse_date("invalid")
        assert result is None
    
    def test_parse_datetime(self):
        """测试日期时间解析"""
        result = DateUtils.parse_datetime("2025-01-15 14:30:00")
        assert result == datetime(2025, 1, 15, 14, 30)


class TestPermissionUtils:
    """PermissionUtils测试"""
    
    def test_require_admin_success(self):
        """测试管理员权限检查（成功）"""
        user = User(role=UserRole.ADMIN)
        # 不应该抛出异常
        PermissionUtils.require_admin(user)
    
    def test_require_admin_failure(self):
        """测试管理员权限检查（失败）"""
        user = User(role=UserRole.EMPLOYEE)
        with pytest.raises(Exception):  # PermissionDeniedException
            PermissionUtils.require_admin(user)
    
    def test_can_view_statistics(self):
        """测试统计权限检查"""
        admin = User(role=UserRole.ADMIN)
        employee = User(role=UserRole.EMPLOYEE)
        
        assert PermissionUtils.can_view_statistics(admin) is True
        assert PermissionUtils.can_view_statistics(employee) is False
    
    def test_can_manage_users(self):
        """测试用户管理权限检查"""
        admin = User(role=UserRole.ADMIN)
        employee = User(role=UserRole.EMPLOYEE)
        
        assert PermissionUtils.can_manage_users(admin) is True
        assert PermissionUtils.can_manage_users(employee) is False

