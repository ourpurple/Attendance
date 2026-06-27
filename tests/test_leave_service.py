"""
请假服务测试
"""
import pytest
from datetime import datetime, date, timedelta
from backend.models import User, LeaveApplication, LeaveStatus, LeaveType, UserRole, Department
from backend.services.leave_service import LeaveService
from backend.exceptions import ValidationException, NotFoundException, PermissionDeniedException


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


def test_create_leave_application_invalid_type(db_session, test_user_employee):
    """测试创建请假申请时使用无效的请假类型"""
    service = LeaveService(db_session)
    
    start_date = datetime.now() + timedelta(days=1)
    end_date = datetime.now() + timedelta(days=2)
    
    with pytest.raises(NotFoundException):
        service.create_leave_application(
            user=test_user_employee,
            start_date=start_date,
            end_date=end_date,
            days=1.0,
            reason="测试请假",
            leave_type_id=99999  # 不存在的ID
        )


def test_get_user_leaves(db_session, test_user_employee, test_leave_type):
    """测试获取用户的请假申请列表"""
    service = LeaveService(db_session)
    
    # 创建几个请假申请
    for i in range(3):
        start_date = datetime.now() + timedelta(days=i+1)
        end_date = datetime.now() + timedelta(days=i+2)
        service.create_leave_application(
            user=test_user_employee,
            start_date=start_date,
            end_date=end_date,
            days=1.0,
            reason=f"测试请假{i}",
            leave_type_id=test_leave_type.id
        )
    
    leaves = service.get_user_leaves(
        user_id=test_user_employee.id,
        skip=0,
        limit=10
    )
    
    assert len(leaves) == 3


def test_approve_leave(db_session, test_user_employee, test_user_dept_head, test_leave_type):
    """测试审批请假申请"""
    service = LeaveService(db_session)
    
    # 创建请假申请
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
    
    # 部门主任审批
    approved_leave = service.approve_leave(
        leave_id=leave.id,
        approver=test_user_dept_head,
        approved=True,
        comment="同意"
    )
    
    assert approved_leave.status == LeaveStatus.APPROVED.value
    assert approved_leave.dept_approver_id == test_user_dept_head.id
    assert approved_leave.dept_comment == "同意"


def test_cancel_leave(db_session, test_user_employee, test_leave_type):
    """测试取消请假申请"""
    service = LeaveService(db_session)
    
    # 创建请假申请
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
    
    # 取消申请
    cancelled_leave = service.cancel_leave(
        leave_id=leave.id,
        user=test_user_employee
    )
    
    assert cancelled_leave.status == LeaveStatus.CANCELLED.value


def test_cancel_leave_permission_denied(db_session, test_user_employee, test_user_dept_head, test_leave_type):
    """测试取消他人请假申请（权限不足）"""
    service = LeaveService(db_session)
    
    # 创建请假申请
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
    
    # 尝试用其他用户取消
    with pytest.raises(PermissionDeniedException):
        service.cancel_leave(
            leave_id=leave.id,
            user=test_user_dept_head
        )


def test_get_required_approval_level():
    """测试获取所需审批层级"""
    service = LeaveService(None)  # db不需要用于这个方法
    
    # 1天及以下：只需要部门主任
    levels = service.get_required_approval_level(1.0)
    assert levels == ["department_head"]
    
    # 1-3天：需要部门主任和副总
    levels = service.get_required_approval_level(2.0)
    assert levels == ["department_head", "vice_president"]
    
    # 3天以上：需要部门主任、副总和总经理
    levels = service.get_required_approval_level(4.0)
    assert levels == ["department_head", "vice_president", "general_manager"]

