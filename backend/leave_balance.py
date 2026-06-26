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
    AnnualLeaveBase,
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


def _comp_components(db: Session, user: User, comp_type, start=None, end=None):
    """在 [start, end] 日期窗口内汇总主动加班挣得、加班调休已用、期初/调整。

    start/end 为 None 表示该侧不设边界（即全部历史）。
    """
    eq = db.query(func.sum(OvertimeApplication.days)).filter(
        OvertimeApplication.user_id == user.id,
        OvertimeApplication.overtime_type == OvertimeType.ACTIVE,
        OvertimeApplication.status == OvertimeStatus.APPROVED,
    )
    if start is not None:
        eq = eq.filter(OvertimeApplication.start_time >= start)
    if end is not None:
        eq = eq.filter(OvertimeApplication.start_time <= end)
    earned = float(eq.scalar() or 0.0)

    used = 0.0
    if comp_type:
        uq = db.query(func.sum(LeaveApplication.days)).filter(
            LeaveApplication.user_id == user.id,
            LeaveApplication.leave_type_id == comp_type.id,
            LeaveApplication.status.in_(OCCUPYING_LEAVE_STATUSES),
        )
        if start is not None:
            uq = uq.filter(LeaveApplication.start_date >= start)
        if end is not None:
            uq = uq.filter(LeaveApplication.start_date <= end)
        used = float(uq.scalar() or 0.0)

    aq = db.query(func.sum(CompLeaveAdjustment.days)).filter(
        CompLeaveAdjustment.user_id == user.id,
    )
    if start is not None:
        aq = aq.filter(CompLeaveAdjustment.effective_date >= start)
    if end is not None:
        aq = aq.filter(CompLeaveAdjustment.effective_date <= end)
    adjustment = float(aq.scalar() or 0.0)
    return earned, used, adjustment


def compute_comp_leave(
    db: Session,
    user: User,
    yearly_reset: bool = False,
    year: Optional[int] = None,
) -> dict:
    """加班调休额度：上年结转 + 当年主动加班折算(earned) + 当年期初/调整(adjustment) − 当年加班调休请假(used) = 剩余。

    yearly_reset=True：按自然年隔离清零（默认当年），上年结转视为 0。
    yearly_reset=False（默认）：
      - 指定 year：上年结转 = max(0, 截至上一年末的累计余额)，再叠加当年挣得/调整/已用（逐年结转）。
      - 不指定 year（累计全部）：永久累计，所有时间的挣得−已用+调整，上年结转列为 0。
    挣得不像年假那样逐年定额发放，而是按实际加班事件累积，因此无需"起始年"配置。
    """
    comp_type = get_leave_type_by_name(db, COMP_LEAVE_TYPE_NAME)

    if yearly_reset:
        y = year if year is not None else datetime.now().year
        year_start, year_end = _year_range(y)
        earned, used, adjustment = _comp_components(db, user, comp_type, year_start, year_end)
        remaining = max(0.0, earned - used + adjustment)
        return {
            "earned_days": earned,
            "used_days": used,
            "adjustment_days": adjustment,
            "carryover_days": 0.0,
            "remaining_days": remaining,
        }

    if year is None:
        # 累计(全部)：所有时间合计，不分年。
        earned, used, adjustment = _comp_components(db, user, comp_type, None, None)
        remaining = max(0.0, earned - used + adjustment)
        return {
            "earned_days": earned,
            "used_days": used,
            "adjustment_days": adjustment,
            "carryover_days": 0.0,
            "remaining_days": remaining,
        }

    # 指定年份 + 结转：上年结转(截至上一年末的累计) + 当年。
    prior_end = _year_range(year - 1)[1]
    p_earned, p_used, p_adjustment = _comp_components(db, user, comp_type, None, prior_end)
    carryover = max(0.0, p_earned - p_used + p_adjustment)
    year_start, year_end = _year_range(year)
    earned, used, adjustment = _comp_components(db, user, comp_type, year_start, year_end)
    remaining = max(0.0, carryover + earned + adjustment - used)
    return {
        "earned_days": earned,
        "used_days": used,
        "adjustment_days": adjustment,
        "carryover_days": carryover,
        "remaining_days": remaining,
    }


def _load_annual_base_tiers(db: Session, user_id: int):
    """取某员工全部基础年假分档，按生效年份升序返回 [(effective_year, days), ...]。"""
    rows = db.query(AnnualLeaveBase.effective_year, AnnualLeaveBase.days).filter(
        AnnualLeaveBase.user_id == user_id,
    ).order_by(AnnualLeaveBase.effective_year.asc()).all()
    return [(int(r[0]), float(r[1])) for r in rows]


def _base_for_year(tiers, default: float, year: int) -> float:
    """某年的基础年假：生效年份 <= year 中年份最大的一档；无则返回 default。"""
    chosen = None
    for eff_year, days in tiers:  # tiers 已按 effective_year 升序
        if eff_year <= year:
            chosen = days
        else:
            break
    return chosen if chosen is not None else default


def compute_annual_leave(
    db: Session,
    user: User,
    year: Optional[int] = None,
    yearly_reset: bool = False,
    start_year: Optional[int] = None,
) -> dict:
    """年假额度。

    基础年假按生效年份分档（AnnualLeaveBase）阶梯取值，无分档时回退 user.annual_leave_days。
    yearly_reset=True：按自然年隔离清零，剩余 = 基础年假 + 当年期初/调整 − 当年年假调休。
    yearly_reset=False（默认，结转）：自 start_year 起逐年发放当年基础年假，并把上一年
    未休余额 max(0, 上年剩余) 结转累计到下一年；返回所选 year 的明细，含 carryover_days。
    """
    if year is None:
        year = datetime.now().year
    if start_year is None:
        start_year = ANNUAL_LEAVE_DEFAULT_START_YEAR
    default_base = float(user.annual_leave_days if user.annual_leave_days is not None else 10.0)
    base_tiers = _load_annual_base_tiers(db, user.id)

    annual_type = get_leave_type_by_name(db, ANNUAL_LEAVE_TYPE_NAME)

    if yearly_reset:
        base = _base_for_year(base_tiers, default_base, year)
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
        base_y = _base_for_year(base_tiers, default_base, y)
        if y == floor_year:
            # 起始年汇总该年及更早的期初/调整（含上线前补录的期初余额）；
            # 已用只计当年，起始年之前的历史请假视为上线前、由期初统一抵充。
            adj_y = sum(v for yr, v in adj_by_year.items() if yr <= floor_year)
            used_y = used_by_year.get(floor_year, 0.0)
        else:
            adj_y = adj_by_year.get(y, 0.0)
            used_y = used_by_year.get(y, 0.0)
        total_y = max(0.0, base_y + carryover_in + adj_y)
        remaining_y = max(0.0, total_y - used_y)
        if y == year:
            result = {
                "base_days": base_y,
                "carryover_days": carryover_in,
                "adjustment_days": adj_y,
                "total_days": total_y,
                "used_days": used_y,
                "remaining_days": remaining_y,
            }
        carryover_in = remaining_y

    if result is None:
        fallback_base = _base_for_year(base_tiers, default_base, year)
        result = {
            "base_days": fallback_base,
            "carryover_days": 0.0,
            "adjustment_days": 0.0,
            "total_days": fallback_base,
            "used_days": 0.0,
            "remaining_days": fallback_base,
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
