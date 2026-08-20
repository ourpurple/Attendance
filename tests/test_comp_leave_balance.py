"""加班调休余额跨年结转回归测试。"""

from datetime import datetime

from backend.models import (
    CompLeaveAdjustment,
    LeaveApplication,
    LeaveStatus,
    LeaveType,
    OvertimeApplication,
    OvertimeStatus,
    OvertimeType,
    SystemSetting,
    User,
    UserRole,
)
from backend.routers.leave import validate_comp_leave_balance
from backend.security import create_access_token, get_password_hash


def test_comp_leave_views_and_validation_use_yearly_carryover_balance(client, test_db):
    """历史超额不应冲减次年录入的期初余额，三个使用入口都应返回可用2天。"""
    employee = User(
        username="cross_year_comp_leave_user",
        password_hash=get_password_hash("password123"),
        real_name="跨年调休测试员工",
        role=UserRole.EMPLOYEE,
        is_active=True,
        enable_attendance=False,
    )
    comp_leave_type = LeaveType(name="加班调休", is_active=True)
    reset_setting = SystemSetting(
        key="comp_leave_yearly_reset",
        value="false",
        description="测试关闭加班调休跨年清零",
    )
    test_db.add_all([employee, comp_leave_type, reset_setting])
    test_db.flush()

    test_db.add_all(
        [
            OvertimeApplication(
                user_id=employee.id,
                start_time=datetime(2026, 6, 9, 17, 30),
                end_time=datetime(2026, 6, 9, 22, 0),
                hours=4.5,
                days=2.0,
                reason="主动加班",
                status=OvertimeStatus.APPROVED,
                overtime_type=OvertimeType.ACTIVE,
            ),
            CompLeaveAdjustment(
                user_id=employee.id,
                days=3.0,
                effective_date=datetime(2026, 7, 7),
                reason="期初及调整净额",
            ),
            LeaveApplication(
                user_id=employee.id,
                start_date=datetime(2025, 12, 30, 9, 0),
                end_date=datetime(2025, 12, 31, 17, 30),
                days=2.0,
                reason="上年加班调休",
                status=LeaveStatus.APPROVED,
                leave_type_id=comp_leave_type.id,
            ),
            LeaveApplication(
                user_id=employee.id,
                start_date=datetime(2026, 6, 1, 9, 0),
                end_date=datetime(2026, 6, 3, 17, 30),
                days=3.0,
                reason="当年加班调休",
                status=LeaveStatus.APPROVED,
                leave_type_id=comp_leave_type.id,
            ),
        ]
    )
    test_db.commit()

    token = create_access_token(data={"sub": employee.username})
    headers = {"Authorization": f"Bearer {token}"}
    application_response = client.get("/api/users/me/comp-leave", headers=headers)
    statistics_response = client.get(
        "/api/statistics/my?start_date=2026-08-01&end_date=2026-08-31",
        headers=headers,
    )

    assert application_response.status_code == 200
    assert statistics_response.status_code == 200
    assert application_response.json() == {
        "earned_days": 2.0,
        "used_days": 3.0,
        "adjustment_days": 3.0,
        "remaining_days": 2.0,
        "yearly_reset": False,
    }
    assert statistics_response.json()["comp_leave_remaining_days"] == 2.0

    validate_comp_leave_balance(
        test_db,
        employee,
        comp_leave_type,
        days=2.0,
        year=2026,
    )
