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
from ..leave_balance import (
    ANNUAL_LEAVE_TYPE_NAME,
    COMP_LEAVE_TYPE_NAME,
    OCCUPYING_LEAVE_STATUSES,
    compute_annual_leave,
    compute_comp_leave,
    get_leave_type_by_name,
)
from ..models import (
    AnnualLeaveAdjustment,
    CompLeaveAdjustment,
    LeaveApplication,
    OvertimeApplication,
    OvertimeStatus,
    OvertimeType,
    PassiveOvertimeAdjustment,
    User,
)
from ..schemas import (
    AnnualLeaveAdjustmentCreate,
    AnnualLeaveAdjustmentResponse,
    AnnualLeaveDetailResponse,
    CompLeaveAdjustmentCreate,
    CompLeaveAdjustmentResponse,
    CompLeaveDetailEntry,
    CompLeaveDetailResponse,
    PassiveOvertimeAdjustmentCreate,
    PassiveOvertimeAdjustmentResponse,
    PassiveOvertimeDetailItem,
    PassiveOvertimeMonthlyItem,
    PassiveOvertimeStat,
    VacationAnnualLeaveItem,
    VacationCompLeaveItem,
)
from ..security import get_current_active_admin
from ..services.excel_export import build_excel_stream
from .system_settings import (
    get_annual_leave_start_year,
    is_annual_leave_yearly_reset_enabled,
    is_comp_leave_yearly_reset_enabled,
)

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


def _datetime_range(year: int, month: Optional[int] = None):
    start, end = _date_range(year, month)
    return datetime.combine(start, datetime.min.time()), datetime.combine(end, datetime.max.time())


def _adjustment_response(row, response_cls, created_by_name: Optional[str] = None):
    return response_cls(
        id=row.id,
        user_id=row.user_id,
        days=row.days,
        effective_date=row.effective_date,
        reason=row.reason,
        created_by_name=created_by_name if created_by_name is not None else (
            row.created_by.real_name if row.created_by else None
        ),
        created_at=row.created_at,
    )


def _list_adjustments(db: Session, model, response_cls, user_id: int):
    rows = db.query(model).filter(
        model.user_id == user_id,
    ).order_by(
        model.effective_date.desc(),
        model.id.desc(),
    ).all()
    return [_adjustment_response(row, response_cls) for row in rows]


def _create_adjustment(db: Session, model, response_cls, payload, current_user: User):
    if payload.days == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="调整天数不能为 0")
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写调整原因")
    target = db.query(User).filter(
        User.id == payload.user_id,
        User.username != "admin",
        User.is_active == True,
    ).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="员工不存在")

    adj = model(
        user_id=payload.user_id,
        days=payload.days,
        effective_date=datetime.combine(payload.effective_date, datetime.min.time()),
        reason=payload.reason.strip(),
        created_by_id=current_user.id,
    )
    db.add(adj)
    db.commit()
    db.refresh(adj)
    return _adjustment_response(adj, response_cls, current_user.real_name)


def _delete_adjustment(db: Session, model, adjustment_id: int):
    adj = db.query(model).filter(model.id == adjustment_id).first()
    if not adj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="调整记录不存在")
    db.delete(adj)
    db.commit()
    return {"message": "已删除"}


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
    return _list_adjustments(db, CompLeaveAdjustment, CompLeaveAdjustmentResponse, user_id)


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
    return _create_adjustment(db, CompLeaveAdjustment, CompLeaveAdjustmentResponse, payload, current_user)


@router.delete("/comp-leave/adjustments/{adjustment_id}")
def delete_comp_leave_adjustment(
    adjustment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """删除加班调休调整记录。"""
    return _delete_adjustment(db, CompLeaveAdjustment, adjustment_id)


@router.get("/comp-leave/detail", response_model=CompLeaveDetailResponse)
def get_comp_leave_detail(
    user_id: int,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """某员工调休明细：主动加班挣得、加班调休使用、期初/调整。

    过滤口径与 /comp-leave 汇总完全一致：不传 year 时沿用"系统设置"的跨年清零
    口径；指定 year 时按该自然年隔离。保证明细之和与汇总数字对得上。
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="员工不存在")

    use_yearly_reset = True if year is not None else is_comp_leave_yearly_reset_enabled(db)
    bal = compute_comp_leave(db, user, yearly_reset=use_yearly_reset, year=year)

    earned_query = db.query(OvertimeApplication).filter(
        OvertimeApplication.user_id == user_id,
        OvertimeApplication.overtime_type == OvertimeType.ACTIVE,
        OvertimeApplication.status == OvertimeStatus.APPROVED,
    )
    comp_type = get_leave_type_by_name(db, COMP_LEAVE_TYPE_NAME)
    used_query = None
    if comp_type:
        used_query = db.query(LeaveApplication).filter(
            LeaveApplication.user_id == user_id,
            LeaveApplication.leave_type_id == comp_type.id,
            LeaveApplication.status.in_(OCCUPYING_LEAVE_STATUSES),
        )

    if use_yearly_reset:
        target_year = year if year is not None else datetime.now().year
        year_start = datetime(target_year, 1, 1)
        year_end = datetime(target_year, 12, 31, 23, 59, 59)
        earned_query = earned_query.filter(
            OvertimeApplication.start_time >= year_start,
            OvertimeApplication.start_time <= year_end,
        )
        if used_query is not None:
            used_query = used_query.filter(
                LeaveApplication.start_date >= year_start,
                LeaveApplication.start_date <= year_end,
            )

    earned_rows = earned_query.order_by(OvertimeApplication.start_time.asc()).all()
    used_rows = (
        used_query.order_by(LeaveApplication.start_date.asc()).all()
        if used_query is not None else []
    )
    adjustments = _list_adjustments(db, CompLeaveAdjustment, CompLeaveAdjustmentResponse, user_id)
    if use_yearly_reset:
        target_year = year if year is not None else datetime.now().year
        adjustments = [a for a in adjustments if a.effective_date.year == target_year]

    earned_items = [
        CompLeaveDetailEntry(
            id=r.id,
            start=r.start_time,
            end=r.end_time,
            days=r.days or 0.0,
            hours=r.hours or 0.0,
            reason=r.reason,
            status=r.status,
        )
        for r in earned_rows
    ]
    used_items = [
        CompLeaveDetailEntry(
            id=r.id,
            start=r.start_date,
            end=r.end_date,
            days=r.days or 0.0,
            reason=r.reason,
            status=r.status,
        )
        for r in used_rows
    ]

    return CompLeaveDetailResponse(
        user_id=user.id,
        user_name=user.real_name,
        earned_days=bal["earned_days"],
        used_days=bal["used_days"],
        adjustment_days=bal["adjustment_days"],
        remaining_days=bal["remaining_days"],
        earned_items=earned_items,
        used_items=used_items,
        adjustments=adjustments,
    )


@router.get("/annual-leave", response_model=List[VacationAnnualLeaveItem])
def list_annual_leave(
    year: Optional[int] = None,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """全员年假概况。不传 year 则按当年。

    是否跨年结转由"系统设置"的开关控制：关闭(默认)逐年发放基础年假并把未休结转累计，
    开启则按自然年清零、不结转。
    """
    use_yearly_reset = is_annual_leave_yearly_reset_enabled(db)
    start_year = get_annual_leave_start_year(db)
    result = []
    for user in _eligible_users(db, department_id):
        bal = compute_annual_leave(db, user, year=year, yearly_reset=use_yearly_reset, start_year=start_year)
        result.append(VacationAnnualLeaveItem(
            user_id=user.id,
            user_name=user.real_name,
            department=user.department.name if user.department else None,
            hire_date=user.hire_date,
            base_days=bal["base_days"],
            carryover_days=bal["carryover_days"],
            adjustment_days=bal["adjustment_days"],
            total_days=bal["total_days"],
            used_days=bal["used_days"],
            remaining_days=bal["remaining_days"],
        ))
    return result


@router.get("/annual-leave/adjustments", response_model=List[AnnualLeaveAdjustmentResponse])
def list_annual_leave_adjustments(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """列出某员工的年假调整记录（按生效日期倒序）。"""
    return _list_adjustments(db, AnnualLeaveAdjustment, AnnualLeaveAdjustmentResponse, user_id)


@router.post(
    "/annual-leave/adjustments",
    response_model=AnnualLeaveAdjustmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_annual_leave_adjustment(
    payload: AnnualLeaveAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """新增年假调整记录（期初余额 / 人工增减）。"""
    return _create_adjustment(db, AnnualLeaveAdjustment, AnnualLeaveAdjustmentResponse, payload, current_user)


@router.delete("/annual-leave/adjustments/{adjustment_id}")
def delete_annual_leave_adjustment(
    adjustment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """删除年假调整记录。"""
    return _delete_adjustment(db, AnnualLeaveAdjustment, adjustment_id)


@router.get("/annual-leave/detail", response_model=AnnualLeaveDetailResponse)
def get_annual_leave_detail(
    user_id: int,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """某员工年假明细：年假调休使用、期初/调整。

    使用明细仅展示所选年份当年的"年假调休"请假；期初/调整在所选年为起始年(或更早)时
    并入该年及更早的记录(承接上线前补录的期初)，其余仅取当年。上一年结转单列 carryover_days。
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="员工不存在")

    use_yearly_reset = is_annual_leave_yearly_reset_enabled(db)
    start_year = get_annual_leave_start_year(db)
    target_year = year if year is not None else datetime.now().year
    bal = compute_annual_leave(db, user, year=target_year, yearly_reset=use_yearly_reset, start_year=start_year)

    # 结转模式且所选年为起始年(或更早)时，期初/调整并入该年及更早(承接上线前期初)。
    fold_earlier_adjustments = (not use_yearly_reset) and target_year <= start_year

    annual_type = get_leave_type_by_name(db, ANNUAL_LEAVE_TYPE_NAME)
    used_items = []
    if annual_type:
        year_start = datetime(target_year, 1, 1)
        year_end = datetime(target_year, 12, 31, 23, 59, 59)
        used_rows = db.query(LeaveApplication).filter(
            LeaveApplication.user_id == user_id,
            LeaveApplication.leave_type_id == annual_type.id,
            LeaveApplication.status.in_(OCCUPYING_LEAVE_STATUSES),
            LeaveApplication.start_date >= year_start,
            LeaveApplication.start_date <= year_end,
        ).order_by(LeaveApplication.start_date.asc()).all()
        used_items = [
            CompLeaveDetailEntry(
                id=r.id,
                start=r.start_date,
                end=r.end_date,
                days=r.days or 0.0,
                reason=r.reason,
                status=r.status,
            )
            for r in used_rows
        ]

    adjustments = _list_adjustments(db, AnnualLeaveAdjustment, AnnualLeaveAdjustmentResponse, user_id)
    if fold_earlier_adjustments:
        adjustments = [a for a in adjustments if a.effective_date.year <= target_year]
    else:
        adjustments = [a for a in adjustments if a.effective_date.year == target_year]

    return AnnualLeaveDetailResponse(
        user_id=user.id,
        user_name=user.real_name,
        base_days=bal["base_days"],
        carryover_days=bal["carryover_days"],
        adjustment_days=bal["adjustment_days"],
        total_days=bal["total_days"],
        used_days=bal["used_days"],
        remaining_days=bal["remaining_days"],
        used_items=used_items,
        adjustments=adjustments,
    )


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

    adjustment_start, adjustment_end = _datetime_range(year, month)
    adjustments = db.query(PassiveOvertimeAdjustment).filter(
        PassiveOvertimeAdjustment.user_id.in_(list(user_map.keys())),
        PassiveOvertimeAdjustment.effective_date >= adjustment_start,
        PassiveOvertimeAdjustment.effective_date <= adjustment_end,
    ).all()

    agg = {}
    for ot in overtimes:
        a = agg.setdefault(ot.user_id, {
            "hours": 0.0,
            "overtime_days": 0.0,
            "adjustment_days": 0.0,
            "count": 0,
            "months": {},
        })
        hours = ot.hours or 0.0
        days = ot.days or 0.0
        a["hours"] += hours
        a["overtime_days"] += days
        a["count"] += 1
        m = ot.start_time.month
        ma = a["months"].setdefault(m, {
            "hours": 0.0,
            "overtime_days": 0.0,
            "adjustment_days": 0.0,
            "count": 0,
        })
        ma["hours"] += hours
        ma["overtime_days"] += days
        ma["count"] += 1

    for adj in adjustments:
        a = agg.setdefault(adj.user_id, {
            "hours": 0.0,
            "overtime_days": 0.0,
            "adjustment_days": 0.0,
            "count": 0,
            "months": {},
        })
        days = adj.days or 0.0
        a["adjustment_days"] += days
        m = adj.effective_date.month
        ma = a["months"].setdefault(m, {
            "hours": 0.0,
            "overtime_days": 0.0,
            "adjustment_days": 0.0,
            "count": 0,
        })
        ma["adjustment_days"] += days

    result = []
    for uid, user in user_map.items():
        a = agg.get(uid)
        if not a:
            continue  # 只列有被动加班的员工
        monthly = [
            PassiveOvertimeMonthlyItem(
                month=m,
                total_hours=round(v["hours"], 2),
                overtime_days=v["overtime_days"],
                adjustment_days=v["adjustment_days"],
                total_days=max(0.0, v["overtime_days"] + v["adjustment_days"]),
                count=v["count"],
            )
            for m, v in sorted(a["months"].items())
        ]
        total_days = max(0.0, a["overtime_days"] + a["adjustment_days"])
        result.append(PassiveOvertimeStat(
            user_id=uid,
            user_name=user.real_name,
            department=user.department.name if user.department else None,
            total_hours=round(a["hours"], 2),
            overtime_days=a["overtime_days"],
            adjustment_days=a["adjustment_days"],
            total_days=total_days,
            count=a["count"],
            monthly=monthly,
        ))
    return result


@router.get("/passive-overtime/adjustments", response_model=List[PassiveOvertimeAdjustmentResponse])
def list_passive_overtime_adjustments(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """列出某员工的被动加班调整记录（按生效日期倒序）。"""
    return _list_adjustments(db, PassiveOvertimeAdjustment, PassiveOvertimeAdjustmentResponse, user_id)


@router.post(
    "/passive-overtime/adjustments",
    response_model=PassiveOvertimeAdjustmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_passive_overtime_adjustment(
    payload: PassiveOvertimeAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """新增被动加班调整记录（期初余额 / 人工增减）。"""
    return _create_adjustment(db, PassiveOvertimeAdjustment, PassiveOvertimeAdjustmentResponse, payload, current_user)


@router.delete("/passive-overtime/adjustments/{adjustment_id}")
def delete_passive_overtime_adjustment(
    adjustment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin),
):
    """删除被动加班调整记录。"""
    return _delete_adjustment(db, PassiveOvertimeAdjustment, adjustment_id)


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
    headers = ['姓名', '部门', '月份/合计', '被动加班记录(天)', '期初/调整(天)', '合计(天)', '次数']
    period_label = f"{year}年" + (f"{month}月" if month else "全年")

    rows = []
    for s in stats:
        if not month:
            for m in s.monthly:
                rows.append([
                    s.user_name,
                    s.department or '-',
                    f"{m.month}月",
                    m.overtime_days,
                    m.adjustment_days,
                    m.total_days,
                    m.count,
                ])
        rows.append([
            s.user_name,
            s.department or '-',
            f"{period_label}合计",
            s.overtime_days,
            s.adjustment_days,
            s.total_days,
            s.count,
        ])

    suffix = f"_{month:02d}" if month else ""
    filename = f"被动加班统计_{year}{suffix}.xlsx"
    return build_excel_stream('被动加班统计', headers, rows, filename)
