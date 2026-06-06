"""假期管理（后台聚合接口）。

汇总加班调休额度、年假概况、被动加班时长，供后台"假期管理"模块展示与导出。
仅管理员可访问。
"""
import calendar
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..leave_balance import compute_annual_leave, compute_comp_leave
from ..models import CompLeaveAdjustment, OvertimeApplication, OvertimeStatus, OvertimeType, User
from ..schemas import (
    CompLeaveAdjustmentCreate,
    CompLeaveAdjustmentResponse,
    PassiveOvertimeDetailItem,
    PassiveOvertimeMonthlyItem,
    PassiveOvertimeStat,
    VacationAnnualLeaveItem,
    VacationCompLeaveItem,
)
from ..security import get_current_active_admin
from ..services.excel_export import build_excel_stream
from .system_settings import is_comp_leave_yearly_reset_enabled

router = APIRouter(prefix="/vacation", tags=["假期管理"])


def _eligible_users(db: Session, department_id: Optional[int] = None) -> List[User]:
    """参与假期统计的用户：排除 admin 账户与已停用账户。"""
    query = db.query(User).filter(
        User.username != "admin",
        User.is_active == True,
    )
    if department_id:
        query = query.filter(User.department_id == department_id)
    return query.order_by(User.department_id, User.id).all()


def _date_range(year: int, month: Optional[int]):
    if month:
        last_day = calendar.monthrange(year, month)[1]
        return date(year, month, 1), date(year, month, last_day)
    return date(year, 1, 1), date(year, 12, 31)


@router.get("/comp-leave", response_model=List[VacationCompLeaveItem])
def list_comp_leave(
    year: Optional[int] = None,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """全员加班调休额度概况。

    不传 year：沿用"系统设置"的跨年清零口径（关闭=永久累计，开启=当年）。
    指定 year：按该自然年隔离统计（当年挣得−当年使用），不含往年结转。
    """
    use_yearly_reset = True if year is not None else is_comp_leave_yearly_reset_enabled(db)
    result = []
    for user in _eligible_users(db, department_id):
        bal = compute_comp_leave(db, user, yearly_reset=use_yearly_reset, year=year)
        result.append(VacationCompLeaveItem(
            user_id=user.id,
            user_name=user.real_name,
            department=user.department.name if user.department else None,
            earned_days=bal["earned_days"],
            used_days=bal["used_days"],
            adjustment_days=bal["adjustment_days"],
            remaining_days=bal["remaining_days"],
        ))
    return result


@router.get("/comp-leave/adjustments", response_model=List[CompLeaveAdjustmentResponse])
def list_comp_leave_adjustments(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """列出某员工的加班调休调整记录（按生效日期倒序）。"""
    rows = db.query(CompLeaveAdjustment).filter(
        CompLeaveAdjustment.user_id == user_id,
    ).order_by(
        CompLeaveAdjustment.effective_date.desc(),
        CompLeaveAdjustment.id.desc(),
    ).all()
    return [
        CompLeaveAdjustmentResponse(
            id=r.id,
            user_id=r.user_id,
            days=r.days,
            effective_date=r.effective_date,
            reason=r.reason,
            created_by_name=r.created_by.real_name if r.created_by else None,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post(
    "/comp-leave/adjustments",
    response_model=CompLeaveAdjustmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_comp_leave_adjustment(
    payload: CompLeaveAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """新增加班调休调整记录（期初余额 / 人工增减）。"""
    if payload.days == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="调整天数不能为 0")
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写调整原因")
    target = db.query(User).filter(User.id == payload.user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="员工不存在")

    adj = CompLeaveAdjustment(
        user_id=payload.user_id,
        days=payload.days,
        effective_date=datetime.combine(payload.effective_date, datetime.min.time()),
        reason=payload.reason.strip(),
        created_by_id=current_user.id,
    )
    db.add(adj)
    db.commit()
    db.refresh(adj)
    return CompLeaveAdjustmentResponse(
        id=adj.id,
        user_id=adj.user_id,
        days=adj.days,
        effective_date=adj.effective_date,
        reason=adj.reason,
        created_by_name=current_user.real_name,
        created_at=adj.created_at,
    )


@router.delete("/comp-leave/adjustments/{adjustment_id}")
def delete_comp_leave_adjustment(
    adjustment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """删除加班调休调整记录。"""
    adj = db.query(CompLeaveAdjustment).filter(CompLeaveAdjustment.id == adjustment_id).first()
    if not adj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="调整记录不存在")
    db.delete(adj)
    db.commit()
    return {"message": "已删除"}


@router.get("/annual-leave", response_model=List[VacationAnnualLeaveItem])
def list_annual_leave(
    year: Optional[int] = None,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """全员年假概况。不传 year 则按当年；年假每年清零、不结转。"""
    result = []
    for user in _eligible_users(db, department_id):
        bal = compute_annual_leave(db, user, year=year)
        result.append(VacationAnnualLeaveItem(
            user_id=user.id,
            user_name=user.real_name,
            department=user.department.name if user.department else None,
            hire_date=user.hire_date,
            total_days=bal["total_days"],
            used_days=bal["used_days"],
            remaining_days=bal["remaining_days"],
        ))
    return result


def _passive_overtime_stats(
    db: Session,
    year: int,
    month: Optional[int],
    department_id: Optional[int],
) -> List[PassiveOvertimeStat]:
    """按员工聚合指定年(可选月)的被动加班时长。仅统计已批准的被动加班。"""
    users = _eligible_users(db, department_id)
    user_map = {u.id: u for u in users}
    if not user_map:
        return []

    start, end = _date_range(year, month)
    overtimes = db.query(OvertimeApplication).filter(
        OvertimeApplication.user_id.in_(list(user_map.keys())),
        OvertimeApplication.overtime_type == OvertimeType.PASSIVE,
        OvertimeApplication.status == OvertimeStatus.APPROVED,
        func.date(OvertimeApplication.start_time) >= start,
        func.date(OvertimeApplication.start_time) <= end,
    ).all()

    agg = {}
    for ot in overtimes:
        a = agg.setdefault(ot.user_id, {"hours": 0.0, "days": 0.0, "count": 0, "months": {}})
        hours = ot.hours or 0.0
        days = ot.days or 0.0
        a["hours"] += hours
        a["days"] += days
        a["count"] += 1
        m = ot.start_time.month
        ma = a["months"].setdefault(m, {"hours": 0.0, "days": 0.0, "count": 0})
        ma["hours"] += hours
        ma["days"] += days
        ma["count"] += 1

    result = []
    for uid, user in user_map.items():
        a = agg.get(uid)
        if not a:
            continue  # 只列有被动加班的员工
        monthly = [
            PassiveOvertimeMonthlyItem(
                month=m,
                total_hours=round(v["hours"], 2),
                total_days=v["days"],
                count=v["count"],
            )
            for m, v in sorted(a["months"].items())
        ]
        result.append(PassiveOvertimeStat(
            user_id=uid,
            user_name=user.real_name,
            department=user.department.name if user.department else None,
            total_hours=round(a["hours"], 2),
            total_days=a["days"],
            count=a["count"],
            monthly=monthly,
        ))
    return result


@router.get("/passive-overtime", response_model=List[PassiveOvertimeStat])
def list_passive_overtime(
    year: int,
    month: Optional[int] = None,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """被动加班时长统计（加班费依据）。不传 month 则按全年并附每月明细。"""
    return _passive_overtime_stats(db, year, month, department_id)


@router.get("/passive-overtime/detail", response_model=List[PassiveOvertimeDetailItem])
def list_passive_overtime_detail(
    user_id: int,
    year: int,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """某员工逐条被动加班明细（仅已批准）。

    过滤口径与 /passive-overtime 汇总完全一致（被动加班 + 已批准 + 同一年/可选月的
    日期范围），保证明细行的时长、天数、条数之和与汇总数字对得上。
    """
    start, end = _date_range(year, month)
    rows = db.query(OvertimeApplication).filter(
        OvertimeApplication.user_id == user_id,
        OvertimeApplication.overtime_type == OvertimeType.PASSIVE,
        OvertimeApplication.status == OvertimeStatus.APPROVED,
        func.date(OvertimeApplication.start_time) >= start,
        func.date(OvertimeApplication.start_time) <= end,
    ).order_by(OvertimeApplication.start_time.asc()).all()
    return [
        PassiveOvertimeDetailItem(
            id=r.id,
            start_time=r.start_time,
            end_time=r.end_time,
            hours=r.hours or 0.0,
            days=r.days or 0.0,
            reason=r.reason,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/passive-overtime/export")
def export_passive_overtime(
    year: int,
    month: Optional[int] = None,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """导出被动加班时长统计（Excel）。"""
    stats = _passive_overtime_stats(db, year, month, department_id)
    headers = ['姓名', '部门', '月份/合计', '被动加班天数', '次数']
    period_label = f"{year}年" + (f"{month}月" if month else "全年")

    rows = []
    for s in stats:
        if not month:
            for m in s.monthly:
                rows.append([s.user_name, s.department or '-', f"{m.month}月", m.total_days, m.count])
        rows.append([s.user_name, s.department or '-', f"{period_label}合计", s.total_days, s.count])

    suffix = f"_{month:02d}" if month else ""
    filename = f"被动加班统计_{year}{suffix}.xlsx"
    return build_excel_stream('被动加班统计', headers, rows, filename)
