"""假期额度计算（单一来源）。

集中管理"加班调休"和"年假调休"的额度计算，供 users.py / leave.py / vacation.py 复用，
避免在多处重复实现，口径不一致。
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import (
    CompLeaveAdjustment,
    LeaveApplication,
    LeaveStatus,
    LeaveType,
    OvertimeApplication,
    OvertimeStatus,
    OvertimeType,
    User,
)

COMP_LEAVE_TYPE_NAME = "加班调休"
ANNUAL_LEAVE_TYPE_NAME = "年假调休"

# 占用额度的请假状态：待审批/审批中也计入占用，避免在途申请导致超支。
# 与 users.py 现有年假统计口径保持一致。
OCCUPYING_LEAVE_STATUSES = [
    LeaveStatus.PENDING,
    LeaveStatus.DEPT_APPROVED,
    LeaveStatus.VP_APPROVED,
    LeaveStatus.APPROVED,
]


def get_leave_type_by_name(db: Session, name: str) -> Optional[LeaveType]:
    return db.query(LeaveType).filter(
        LeaveType.name == name,
        LeaveType.is_active == True,
    ).first()


def _year_range(year: int):
    return datetime(year, 1, 1), datetime(year, 12, 31, 23, 59, 59)


def compute_comp_leave(
    db: Session,
    user: User,
    yearly_reset: bool = False,
    year: Optional[int] = None,
) -> dict:
    """加班调休额度：主动加班折算(earned) + 期初/调整(adjustment) - 加班调休请假(used) = 剩余(remaining)。

    yearly_reset=True 时只统计自然年（默认当年），否则永久累计。
    期初/调整(CompLeaveAdjustment)按 effective_date 计入对应自然年，与 earned/used 的日期口径一致。
    """
    if year is None:
        year = datetime.now().year

    earned_query = db.query(func.sum(OvertimeApplication.days)).filter(
        OvertimeApplication.user_id == user.id,
        OvertimeApplication.overtime_type == OvertimeType.ACTIVE,
        OvertimeApplication.status == OvertimeStatus.APPROVED,
    )

    comp_type = get_leave_type_by_name(db, COMP_LEAVE_TYPE_NAME)
    used_query = None
    if comp_type:
        used_query = db.query(func.sum(LeaveApplication.days)).filter(
            LeaveApplication.user_id == user.id,
            LeaveApplication.leave_type_id == comp_type.id,
            LeaveApplication.status.in_(OCCUPYING_LEAVE_STATUSES),
        )

    adj_query = db.query(func.sum(CompLeaveAdjustment.days)).filter(
        CompLeaveAdjustment.user_id == user.id,
    )

    if yearly_reset:
        year_start, year_end = _year_range(year)
        earned_query = earned_query.filter(
            OvertimeApplication.start_time >= year_start,
            OvertimeApplication.start_time <= year_end,
        )
        if used_query is not None:
            used_query = used_query.filter(
                LeaveApplication.start_date >= year_start,
                LeaveApplication.start_date <= year_end,
            )
        adj_query = adj_query.filter(
            CompLeaveAdjustment.effective_date >= year_start,
            CompLeaveAdjustment.effective_date <= year_end,
        )

    earned = float(earned_query.scalar() or 0.0)
    used = float(used_query.scalar() or 0.0) if used_query is not None else 0.0
    adjustment = float(adj_query.scalar() or 0.0)
    remaining = max(0.0, earned - used + adjustment)
    return {
        "earned_days": earned,
        "used_days": used,
        "adjustment_days": adjustment,
        "remaining_days": remaining,
    }


def compute_annual_leave(db: Session, user: User, year: Optional[int] = None) -> dict:
    """年假额度：年假总数(annual_leave_days) - 本年度年假调休(used) = 剩余。

    抽取自 users.py 现有 /users/me/annual-leave 逻辑，便于后台批量复用。
    """
    if year is None:
        year = datetime.now().year
    total = float(user.annual_leave_days if user.annual_leave_days is not None else 10.0)

    annual_type = get_leave_type_by_name(db, ANNUAL_LEAVE_TYPE_NAME)
    used = 0.0
    if annual_type:
        year_start, year_end = _year_range(year)
        used = float(db.query(func.sum(LeaveApplication.days)).filter(
            LeaveApplication.user_id == user.id,
            LeaveApplication.leave_type_id == annual_type.id,
            LeaveApplication.status.in_(OCCUPYING_LEAVE_STATUSES),
            LeaveApplication.start_date >= year_start,
            LeaveApplication.start_date <= year_end,
        ).scalar() or 0.0)

    remaining = max(0.0, total - used)
    return {"total_days": total, "used_days": used, "remaining_days": remaining}
