"""
加班服务测试
"""
import pytest
from datetime import datetime, timedelta
from backend.models import User, OvertimeApplication, OvertimeStatus, OvertimeType, UserRole, Department
from backend.services.overtime_service import OvertimeService
from backend.exceptions import ValidationException, NotFoundException, PermissionDeniedException


def test_create_overtime_application_employee(db_session, test_user_employee):
    """测试员工创建加班申请"""
    service = OvertimeService(db_session)
    
    start_time = datetime.now() + timedelta(days=1, hours=18)
    end_time = datetime.now() + timedelta(days=1, hours=20)
    
    overtime = service.create_overtime_application(
        user=test_user_employee,
        start_time=start_time,
        end_time=end_time,
        hours=2.0,
        days=0.25,
        reason="测试加班",
        overtime_type=OvertimeType.ACTIVE
    )
    
    assert overtime is not None
    assert overtime.user_id == test_user_employee.id
    assert overtime.hours == 2.0
    assert overtime.days == 0.25
    assert overtime.reason == "测试加班"
    assert overtime.status == OvertimeStatus.PENDING.value
    assert overtime.overtime_type == OvertimeType.ACTIVE


def test_create_overtime_application_invalid_time(db_session, test_user_employee):
    """测试创建加班申请时结束时间早于开始时间"""
    service = OvertimeService(db_session)
    
    start_time = datetime.now() + timedelta(days=1, hours=20)
    end_time = datetime.now() + timedelta(days=1, hours=18)
    
    with pytest.raises(ValidationException):
        service.create_overtime_application(
            user=test_user_employee,
            start_time=start_time,
            end_time=end_time,
            hours=2.0,
            days=0.25,
            reason="测试加班",
            overtime_type=OvertimeType.ACTIVE
        )


def test_get_user_overtimes(db_session, test_user_employee):
    """测试获取用户的加班申请列表"""
    service = OvertimeService(db_session)
    
    # 创建几个加班申请
    for i in range(3):
        start_time = datetime.now() + timedelta(days=i+1, hours=18)
        end_time = datetime.now() + timedelta(days=i+1, hours=20)
        service.create_overtime_application(
            user=test_user_employee,
            start_time=start_time,
            end_time=end_time,
            hours=2.0,
            days=0.25,
            reason=f"测试加班{i}",
            overtime_type=OvertimeType.ACTIVE
        )
    
    overtimes = service.get_user_overtimes(
        user_id=test_user_employee.id,
        skip=0,
        limit=10
    )
    
    assert len(overtimes) == 3


def test_approve_overtime(db_session, test_user_employee, test_user_dept_head):
    """测试审批加班申请"""
    service = OvertimeService(db_session)
    
    # 创建加班申请
    start_time = datetime.now() + timedelta(days=1, hours=18)
    end_time = datetime.now() + timedelta(days=1, hours=20)
    overtime = service.create_overtime_application(
        user=test_user_employee,
        start_time=start_time,
        end_time=end_time,
        hours=2.0,
        days=0.25,
        reason="测试加班",
        overtime_type=OvertimeType.ACTIVE
    )
    
    # 审批人审批
    approved_overtime = service.approve_overtime(
        overtime_id=overtime.id,
        approver=test_user_dept_head,
        approved=True,
        comment="同意"
    )
    
    assert approved_overtime.status == OvertimeStatus.APPROVED.value
    assert approved_overtime.approver_id == test_user_dept_head.id
    assert approved_overtime.comment == "同意"


def test_cancel_overtime(db_session, test_user_employee):
    """测试取消加班申请"""
    service = OvertimeService(db_session)
    
    # 创建加班申请
    start_time = datetime.now() + timedelta(days=1, hours=18)
    end_time = datetime.now() + timedelta(days=1, hours=20)
    overtime = service.create_overtime_application(
        user=test_user_employee,
        start_time=start_time,
        end_time=end_time,
        hours=2.0,
        days=0.25,
        reason="测试加班",
        overtime_type=OvertimeType.ACTIVE
    )
    
    # 取消申请
    cancelled_overtime = service.cancel_overtime(
        overtime_id=overtime.id,
        user=test_user_employee
    )
    
    assert cancelled_overtime.status == OvertimeStatus.CANCELLED.value


def test_cancel_overtime_permission_denied(db_session, test_user_employee, test_user_dept_head):
    """测试取消他人加班申请（权限不足）"""
    service = OvertimeService(db_session)
    
    # 创建加班申请
    start_time = datetime.now() + timedelta(days=1, hours=18)
    end_time = datetime.now() + timedelta(days=1, hours=20)
    overtime = service.create_overtime_application(
        user=test_user_employee,
        start_time=start_time,
        end_time=end_time,
        hours=2.0,
        days=0.25,
        reason="测试加班",
        overtime_type=OvertimeType.ACTIVE
    )
    
    # 尝试用其他用户取消
    with pytest.raises(PermissionDeniedException):
        service.cancel_overtime(
            overtime_id=overtime.id,
            user=test_user_dept_head
        )

