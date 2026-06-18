"""假期额度计算（单一来源）。

集中管理"加班调休"和"年假调休"的额度计算，供 users.py / leave.py / vacation.py 复用，
避免在多处重复实现，口径不一致。
"""
from datetime import datetime
import calendar
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import (
    AnnualLeaveAdjustment,
    CompLeaveAdjustment,
    LeaveApplication,
    LeaveStatus,
    LeaveType,
    OvertimeApplication,
    OvertimeStatus,
    OvertimeType,
    PassiveOvertimeAdjustment,
    User,
)

COMP_LEAVE_TYPE_NAME = "加班调休"
ANNUAL_LEAVE_TYPE_NAME = "年假调休"
ANNUAL_LEAVE_DEFAULT_START_YEAR = 2025

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


def _period_range(year: int, month: Optional[int] = None):
    if month:
        last_day = calendar.monthrange(year, month)[1]
        return datetime(year, month, 1), datetime(year, month, last_day, 23, 59, 59)
    return _year_range(year)


def _sum_adjustments(db: Session, model, user_id: int, year: Optional[int] = None, month: Optional[int] = None) -> float:
    query = db.query(func.sum(model.days)).filter(model.user_id == user_id)
    if year is not None:
        start, end = _period_range(year, month)
        query = query.filter(
            model.effective_date >= start,
            model.effective_date <= end,
        )
    return float(query.scalar() or 0.0)


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

    earned = float(earned_query.scalar() or 0.0)
    used = float(used_query.scalar() or 0.0) if used_query is not None else 0.0
    adjustment = _sum_adjustments(db, CompLeaveAdjustment, user.id, year if yearly_reset else None)
    remaining = max(0.0, earned - used + adjustment)
    return {
        "earned_days": earned,
        "used_days": used,
        "adjustment_days": adjustment,
        "remaining_days": remaining,
    }


def compute_annual_leave(
    db: Session,
    user: User,
    year: Optional[int] = None,
    yearly_reset: bool = False,
    start_year: Optional[int] = None,
) -> dict:
    """年假额度。

    yearly_reset=True：按自然年隔离清零，剩余 = 基础年假 + 当年期初/调整 − 当年年假调休。
    yearly_reset=False（默认，结转）：自 start_year 起逐年发放一份基础年假，并把上一年
    未休余额 max(0, 上年剩余) 结转累计到下一年；返回所选 year 的明细，含 carryover_days。
    """
    if year is None:
        year = datetime.now().year
    if start_year is None:
        start_year = ANNUAL_LEAVE_DEFAULT_START_YEAR
    base = float(user.annual_leave_days if user.annual_leave_days is not None else 10.0)

    annual_type = get_leave_type_by_name(db, ANNUAL_LEAVE_TYPE_NAME)

    if yearly_reset:
        adjustment = _sum_adjustments(db, AnnualLeaveAdjustment, user.id, year)
        total = max(0.0, base + adjustment)
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
        return {
            "base_days": base,
            "carryover_days": 0.0,
            "adjustment_days": adjustment,
            "total_days": total,
            "used_days": used,
            "remaining_days": remaining,
        }

    # 结转模式：逐年累计。预取按年聚合的期初/调整与已用年假。
    adj_by_year: dict = {}
    for eff_date, days in db.query(
        AnnualLeaveAdjustment.effective_date, AnnualLeaveAdjustment.days
    ).filter(AnnualLeaveAdjustment.user_id == user.id).all():
        adj_by_year[eff_date.year] = adj_by_year.get(eff_date.year, 0.0) + float(days or 0.0)

    used_by_year: dict = {}
    if annual_type:
        for start_date, days in db.query(
            LeaveApplication.start_date, LeaveApplication.days
        ).filter(
            LeaveApplication.user_id == user.id,
            LeaveApplication.leave_type_id == annual_type.id,
            LeaveApplication.status.in_(OCCUPYING_LEAVE_STATUSES),
        ).all():
            used_by_year[start_date.year] = used_by_year.get(start_date.year, 0.0) + float(days or 0.0)

    floor_year = min(start_year, year)
    carryover_in = 0.0
    result = None
    for y in range(floor_year, year + 1):
        if y == floor_year:
            # 起始年汇总该年及更早的全部期初/调整与已用（含上线前补录的期初）。
            adj_y = sum(v for yr, v in adj_by_year.items() if yr <= floor_year)
            used_y = sum(v for yr, v in used_by_year.items() if yr <= floor_year)
        else:
            adj_y = adj_by_year.get(y, 0.0)
            used_y = used_by_year.get(y, 0.0)
        total_y = max(0.0, base + carryover_in + adj_y)
        remaining_y = max(0.0, total_y - used_y)
        if y == year:
            result = {
                "base_days": base,
                "carryover_days": carryover_in,
                "adjustment_days": adj_y,
                "total_days": total_y,
                "used_days": used_y,
                "remaining_days": remaining_y,
            }
        carryover_in = remaining_y

    if result is None:
        result = {
            "base_days": base,
            "carryover_days": 0.0,
            "adjustment_days": 0.0,
            "total_days": base,
            "used_days": 0.0,
            "remaining_days": base,
        }
    return result


def compute_passive_overtime_adjustment(
    db: Session,
    user: User,
    year: int,
    month: Optional[int] = None,
) -> float:
    """被动加班期初/调整天数，按生效日期计入指定自然年/月。"""
    return _sum_adjustments(db, PassiveOvertimeAdjustment, user.id, year, month)
