from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from typing import List, Optional
from datetime import datetime, timedelta, date
from ..database import get_db
from ..models import User, Attendance, LeaveApplication, OvertimeApplication, UserRole, LeaveStatus, OvertimeStatus, Holiday, LeaveType, AttendanceStatus, OvertimeType
from ..permissions import can_view_user_records
from ..schemas import (
    AttendanceStatistics, PeriodStatistics, LeaveApplicationResponse, OvertimeApplicationResponse,
    DailyAttendanceStatisticsResponse, DailyAttendanceStatistics, DailyAttendanceItem
)
from ..leave_balance import compute_annual_leave, compute_comp_leave, compute_passive_overtime_adjustment
from .attendance import get_leave_period_for_date
def serialize_leave_response(leave: LeaveApplication) -> LeaveApplicationResponse:
    data = LeaveApplicationResponse.from_orm(leave).model_dump()
    data["leave_type_name"] = leave.leave_type.name if leave.leave_type else None
    return LeaveApplicationResponse(**data)
from ..security import get_current_user, get_current_active_admin
from ..services.excel_export import build_excel_stream

router = APIRouter(prefix="/statistics", tags=["统计分析"])


def calculate_workdays(start_date: date, end_date: date, db: Session) -> int:
    """
    计算日期范围内的工作日天数
    - 排除周末（周六、周日）
    - 排除法定节假日
    - 包含调休工作日
    """
    # 获取日期范围内的所有节假日配置
    holidays_config = db.query(Holiday).filter(
        Holiday.date >= start_date.isoformat(),
        Holiday.date <= end_date.isoformat()
    ).all()
    
    # 创建节假日字典 {日期字符串: 类型}
    holidays_dict = {h.date: h.type for h in holidays_config}
    
    workdays = 0
    current_date = start_date
    
    while current_date <= end_date:
        date_str = current_date.isoformat()
        
        # 检查是否有节假日配置
        if date_str in holidays_dict:
            if holidays_dict[date_str] == 'workday':
                # 调休工作日，算作工作日
                workdays += 1
            # 如果是 'holiday' 或 'company_holiday' 类型，不算工作日
        else:
            # 没有配置，按周几判断
            weekday = current_date.weekday()  # 0=周一, 6=周日
            if weekday < 5:  # 周一到周五
                workdays += 1
        
        current_date += timedelta(days=1)
    
    return workdays


@router.get("/attendance", response_model=List[AttendanceStatistics])
def get_attendance_statistics(
    start_date: date,
    end_date: date,
    department_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取考勤统计（按用户）"""
    # 权限检查
    if current_user.role not in [UserRole.ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    # 构建查询（排除admin账户、禁用考勤的员工）
    query = db.query(User).filter(
        User.username != "admin",
        User.enable_attendance == True
    )
    
    # 如果是部门主任，只能查看本部门
    if current_user.role == UserRole.DEPARTMENT_HEAD:
        query = query.filter(User.department_id == current_user.department_id)
    elif department_id:
        query = query.filter(User.department_id == department_id)
    
    users = query.all()
    
    # 计算日期范围内的实际工作日天数（排除周末和法定节假日）
    total_days = calculate_workdays(start_date, end_date, db)
    
    leave_types = db.query(LeaveType).filter(LeaveType.is_active == True).all()
    leave_type_map = {lt.id: lt.name for lt in leave_types}
    statistics = []
    for user in users:
        # 获取考勤记录
        attendances = db.query(Attendance).filter(
            and_(
                Attendance.user_id == user.id,
                func.date(Attendance.date) >= start_date,
                func.date(Attendance.date) <= end_date
            )
        ).all()
        
        # 获取请假记录
        leaves = db.query(LeaveApplication).options(joinedload(LeaveApplication.leave_type)).filter(
            and_(
                LeaveApplication.user_id == user.id,
                LeaveApplication.status == LeaveStatus.APPROVED,
                LeaveApplication.start_date <= datetime.combine(end_date, datetime.max.time()),
                LeaveApplication.end_date >= datetime.combine(start_date, datetime.min.time())
            )
        ).all()
        
        # 获取加班记录（只要加班日期在统计范围内即可）
        overtimes = db.query(OvertimeApplication).filter(
            and_(
                OvertimeApplication.user_id == user.id,
                OvertimeApplication.status == OvertimeStatus.APPROVED,
                func.date(OvertimeApplication.start_time) <= end_date,
                func.date(OvertimeApplication.start_time) >= start_date
            )
        ).all()
        
        # 计算统计数据
        present_days = len(attendances)
        late_days = sum(1 for a in attendances if a.is_late)
        early_leave_days = sum(1 for a in attendances if a.is_early_leave)
        leave_days = sum(l.days for l in leaves if l.days is not None)
        leave_count = len(leaves)  # 请假次数（只统计已批准的）
        leave_type_totals = {}
        for leave in leaves:
            lt_id = leave.leave_type_id if hasattr(leave, "leave_type_id") else None
            if lt_id:
                if lt_id not in leave_type_totals:
                    leave_type_totals[lt_id] = {"leave_type_id": lt_id, "leave_type_name": leave_type_map.get(lt_id, "未分类"), "total_days": 0.0, "total_count": 0}
                leave_type_totals[lt_id]["total_days"] += leave.days or 0
                leave_type_totals[lt_id]["total_count"] += 1
        leave_type_breakdown = list(leave_type_totals.values())
        
        # 按类型分类统计加班数据
        active_overtimes = [o for o in overtimes if o.overtime_type == OvertimeType.ACTIVE]
        passive_overtimes = [o for o in overtimes if o.overtime_type == OvertimeType.PASSIVE]
        
        active_overtime_days = sum(o.days for o in active_overtimes if o.days is not None)
        active_overtime_count = len(active_overtimes)
        passive_overtime_days = sum(o.days for o in passive_overtimes if o.days is not None)
        passive_overtime_count = len(passive_overtimes)
        
        overtime_days = active_overtime_days + passive_overtime_days
        overtime_count = active_overtime_count + passive_overtime_count
        
        work_hours = sum(a.work_hours for a in attendances if a.work_hours is not None)
        absence_days = total_days - present_days - int(leave_days)
        
        stat = AttendanceStatistics(
            user_id=user.id,
            user_name=user.real_name,
            department=user.department.name if user.department else None,
            total_days=total_days,
            present_days=present_days,
            late_days=late_days,
            early_leave_days=early_leave_days,
            absence_days=max(0, absence_days),
            leave_days=leave_days,
            leave_count=leave_count,
            overtime_days=overtime_days,
            overtime_count=overtime_count,
            active_overtime_days=active_overtime_days,
            active_overtime_count=active_overtime_count,
            passive_overtime_days=passive_overtime_days,
            passive_overtime_count=passive_overtime_count,
            work_hours=work_hours,
            leave_type_breakdown=leave_type_breakdown
        )
        statistics.append(stat)
    
    return statistics


@router.get("/period", response_model=PeriodStatistics)
def get_period_statistics(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取周期统计（管理员）"""
    # 总用户数 = 激活的系统用户数 - 1（admin账户）
    # 方法：查询所有用户，在Python中过滤
    all_users = db.query(User).all()
    
    # 统计激活且开启考勤的用户（排除admin）
    enabled_users = [
        user for user in all_users
        if user.is_active
        and user.username != "admin"
        and (user.enable_attendance is None or user.enable_attendance is True)
    ]
    total_users = len(enabled_users)
    enabled_user_ids = [user.id for user in enabled_users]
    # 计算实际工作日天数（排除周末和法定节假日）
    total_days = calculate_workdays(start_date, end_date, db)
    
    # 应出勤次数
    expected_attendance = total_users * total_days
    
    # 实际出勤次数（排除admin账户的考勤记录）
    if enabled_user_ids:
        actual_attendance = db.query(Attendance).filter(
            and_(
                func.date(Attendance.date) >= start_date,
                func.date(Attendance.date) <= end_date,
                Attendance.user_id.in_(enabled_user_ids)
            )
        ).count()
    else:
        actual_attendance = 0
    
    # 出勤率
    attendance_rate = (actual_attendance / expected_attendance * 100) if expected_attendance > 0 else 0
    
    # 总请假天数（排除admin账户）
    if enabled_user_ids:
        leaves = db.query(LeaveApplication).options(joinedload(LeaveApplication.leave_type)).filter(
            and_(
                LeaveApplication.status == LeaveStatus.APPROVED,
                LeaveApplication.start_date <= datetime.combine(end_date, datetime.max.time()),
                LeaveApplication.end_date >= datetime.combine(start_date, datetime.min.time()),
                LeaveApplication.user_id.in_(enabled_user_ids)
            )
        ).all()
    else:
        leaves = []
    total_leave_days = sum(l.days for l in leaves)
    
    # 总加班天数（排除admin账户，只要加班日期在统计范围内即可）
    if enabled_user_ids:
        overtimes = db.query(OvertimeApplication).filter(
            and_(
                OvertimeApplication.status == OvertimeStatus.APPROVED,
                func.date(OvertimeApplication.start_time) <= end_date,
                func.date(OvertimeApplication.start_time) >= start_date,
                OvertimeApplication.user_id.in_(enabled_user_ids)
            )
        ).all()
    else:
        overtimes = []
    total_overtime_days = sum(o.days for o in overtimes if o.days is not None)
    
    leave_type_totals = {}
    for leave in leaves:
        lt = leave.leave_type
        lt_id = lt.id if lt else 0
        lt_name = lt.name if lt else "未分类"
        if lt_id not in leave_type_totals:
            leave_type_totals[lt_id] = {
                "leave_type_id": lt_id,
                "leave_type_name": lt_name,
                "total_days": 0.0,
                "total_count": 0
            }
        leave_type_totals[lt_id]["total_days"] += leave.days or 0
        leave_type_totals[lt_id]["total_count"] += 1
    
    leave_type_summary = list(leave_type_totals.values())
    
    return PeriodStatistics(
        start_date=datetime.combine(start_date, datetime.min.time()),
        end_date=datetime.combine(end_date, datetime.max.time()),
        total_users=total_users,
        attendance_rate=round(attendance_rate, 2),
        total_leave_days=total_leave_days,
        total_overtime_days=total_overtime_days,
        leave_type_summary=leave_type_summary
    )


@router.get("/my", response_model=AttendanceStatistics)
def get_my_statistics(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取我的统计数据"""
    stats_year = start_date.year
    comp_leave_balance = compute_comp_leave(
        db,
        current_user,
        yearly_reset=True,
        year=stats_year,
    )
    annual_leave_balance = compute_annual_leave(db, current_user, year=stats_year)
    year_start = datetime(stats_year, 1, 1)
    year_end = datetime(stats_year, 12, 31, 23, 59, 59)
    year_passive_overtime_days = float(db.query(func.sum(OvertimeApplication.days)).filter(
        OvertimeApplication.user_id == current_user.id,
        OvertimeApplication.status == OvertimeStatus.APPROVED,
        OvertimeApplication.overtime_type == OvertimeType.PASSIVE,
        OvertimeApplication.start_time >= year_start,
        OvertimeApplication.start_time <= year_end
    ).scalar() or 0.0)
    year_passive_overtime_days = max(
        0.0,
        year_passive_overtime_days + compute_passive_overtime_adjustment(db, current_user, stats_year),
    )

    if current_user.enable_attendance is False:
        return AttendanceStatistics(
            user_id=current_user.id,
            user_name=current_user.real_name,
            department=current_user.department.name if current_user.department else None,
            total_days=0,
            present_days=0,
            late_days=0,
            early_leave_days=0,
            absence_days=0,
            leave_days=0.0,
            leave_count=0,
            overtime_days=0.0,
            overtime_count=0,
            active_overtime_days=0.0,
            active_overtime_count=0,
            passive_overtime_days=0.0,
            passive_overtime_count=0,
            year_passive_overtime_days=year_passive_overtime_days,
            comp_leave_remaining_days=comp_leave_balance["remaining_days"],
            annual_leave_remaining_days=annual_leave_balance["remaining_days"],
            work_hours=0.0,
            leave_type_breakdown=[]
        )
    # 计算日期范围内的实际工作日天数（排除周末和法定节假日）
    total_days = calculate_workdays(start_date, end_date, db)
    
    # 获取考勤记录
    attendances = db.query(Attendance).filter(
        and_(
            Attendance.user_id == current_user.id,
            func.date(Attendance.date) >= start_date,
            func.date(Attendance.date) <= end_date
        )
    ).all()
    
    # 获取请假记录
    leaves = db.query(LeaveApplication).options(joinedload(LeaveApplication.leave_type)).filter(
        and_(
            LeaveApplication.user_id == current_user.id,
            LeaveApplication.status == LeaveStatus.APPROVED,
            LeaveApplication.start_date <= datetime.combine(end_date, datetime.max.time()),
            LeaveApplication.end_date >= datetime.combine(start_date, datetime.min.time())
        )
    ).all()
    
    # 获取加班记录（只要加班日期在统计范围内即可）
    overtimes = db.query(OvertimeApplication).filter(
        and_(
            OvertimeApplication.user_id == current_user.id,
            OvertimeApplication.status == OvertimeStatus.APPROVED,
            func.date(OvertimeApplication.start_time) <= end_date,
            func.date(OvertimeApplication.start_time) >= start_date
        )
    ).all()
    
    # 计算统计数据
    present_days = len(attendances)
    late_days = sum(1 for a in attendances if a.is_late)
    early_leave_days = sum(1 for a in attendances if a.is_early_leave)
    leave_days = sum(l.days for l in leaves if l.days is not None)
    leave_count = len(leaves)  # 请假次数（只统计已批准的）
    
    # 按类型分类统计加班数据
    active_overtimes = [o for o in overtimes if o.overtime_type == OvertimeType.ACTIVE]
    passive_overtimes = [o for o in overtimes if o.overtime_type == OvertimeType.PASSIVE]
    
    active_overtime_days = sum(o.days for o in active_overtimes if o.days is not None)
    active_overtime_count = len(active_overtimes)
    passive_overtime_days = sum(o.days for o in passive_overtimes if o.days is not None)
    passive_overtime_count = len(passive_overtimes)
    
    overtime_days = active_overtime_days + passive_overtime_days
    overtime_count = active_overtime_count + passive_overtime_count
    
    work_hours = sum(a.work_hours for a in attendances if a.work_hours is not None) or 0.0
    absence_days = total_days - present_days - int(leave_days)
    
    return AttendanceStatistics(
        user_id=current_user.id,
        user_name=current_user.real_name,
        department=current_user.department.name if current_user.department else None,
        total_days=total_days,
        present_days=present_days,
        late_days=late_days,
        early_leave_days=early_leave_days,
        absence_days=max(0, absence_days),
        leave_days=leave_days,
        leave_count=leave_count,
        overtime_days=overtime_days,
        overtime_count=overtime_count,
        active_overtime_days=active_overtime_days,
        active_overtime_count=active_overtime_count,
        passive_overtime_days=passive_overtime_days,
        passive_overtime_count=passive_overtime_count,
        year_passive_overtime_days=year_passive_overtime_days,
        comp_leave_remaining_days=comp_leave_balance["remaining_days"],
        annual_leave_remaining_days=annual_leave_balance["remaining_days"],
        work_hours=work_hours
    )


@router.get("/user/{user_id}/leave-details", response_model=List[LeaveApplicationResponse])
def get_user_leave_details(
    user_id: int,
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取指定用户的请假明细（只返回已批准的）"""
    # 权限检查
    if current_user.role not in [UserRole.ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    if not can_view_user_records(db, current_user, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    # 获取已批准的请假记录
    leaves = db.query(LeaveApplication).filter(
        and_(
            LeaveApplication.user_id == user_id,
            LeaveApplication.status == LeaveStatus.APPROVED,
            LeaveApplication.start_date <= datetime.combine(end_date, datetime.max.time()),
            LeaveApplication.end_date >= datetime.combine(start_date, datetime.min.time())
        )
    ).order_by(LeaveApplication.start_date.desc()).all()
    
    return [serialize_leave_response(leave) for leave in leaves]


@router.get("/user/{user_id}/overtime-details", response_model=List[OvertimeApplicationResponse])
def get_user_overtime_details(
    user_id: int,
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取指定用户的加班明细（只返回已批准的）"""
    # 权限检查
    if current_user.role not in [UserRole.ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    if not can_view_user_records(db, current_user, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    # 获取已批准的加班记录
    overtimes = db.query(OvertimeApplication).filter(
        and_(
            OvertimeApplication.user_id == user_id,
            OvertimeApplication.status == OvertimeStatus.APPROVED,
            func.date(OvertimeApplication.start_time) <= end_date,
            func.date(OvertimeApplication.start_time) >= start_date
        )
    ).order_by(OvertimeApplication.start_time.desc()).all()
    
    return overtimes



def _daily_status_display(status: Optional[str], target_date_str: str, period: str, is_late: bool = False, is_early_leave: bool = False) -> str:
    """与前端 getStatusDisplay 保持一致的导出文案。"""
    today = date.today()
    item_date = datetime.fromisoformat(target_date_str).date()

    if item_date == today and status == AttendanceStatus.ABSENT.value:
        if period == 'afternoon':
            now = datetime.now().time()
            if now >= datetime.strptime('17:00', '%H:%M').time():
                return '缺勤'
            return ''
        return ''

    if item_date > today and status == AttendanceStatus.ABSENT.value:
        return ''

    if not status:
        return '/'

    if status == AttendanceStatus.NORMAL.value and period == 'morning' and is_late:
        return '迟到'

    if status == AttendanceStatus.NORMAL.value and period == 'afternoon' and is_early_leave:
        return '早退'

    status_map = {
        AttendanceStatus.NORMAL.value: '正常',
        AttendanceStatus.CITY_BUSINESS.value: '市区办事',
        AttendanceStatus.BUSINESS_TRIP.value: '出差',
        AttendanceStatus.LEAVE.value: '请假',
        AttendanceStatus.ABSENT.value: '缺勤',
        AttendanceStatus.OVERTIME_PUNCH.value: '加班',
    }
    return status_map.get(status, status)

def is_workday(target_date: date, db: Session) -> bool:
    """判断指定日期是否为工作日"""
    date_str = target_date.isoformat()
    holiday = db.query(Holiday).filter(Holiday.date == date_str).first()
    
    if holiday:
        if holiday.type == "workday":
            return True
        elif holiday.type in ["holiday", "company_holiday"]:
            return False
    
    weekday = target_date.weekday()
    return weekday < 5  # 周一到周五


def get_weekday_name(target_date: date) -> str:
    """获取星期几的中文名称"""
    weekday_names = ["一", "二", "三", "四", "五", "六", "日"]
    return weekday_names[target_date.weekday()]


@router.get("/attendance/daily", response_model=DailyAttendanceStatisticsResponse)
def get_daily_attendance_statistics(
    start_date: date,
    end_date: date,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取每日上下午考勤详细统计（默认工作日；非工作日仅在有加班打卡时显示）"""
    if current_user.role not in [UserRole.ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )

    query = db.query(User).filter(
        User.username != "admin",
        User.is_active == True,
        User.enable_attendance == True
    )

    if current_user.role == UserRole.DEPARTMENT_HEAD:
        query = query.filter(User.department_id == current_user.department_id)
    elif department_id:
        query = query.filter(User.department_id == department_id)

    users = query.all()
    user_ids = [u.id for u in users]

    workdays = []
    current_date = start_date
    while current_date <= end_date:
        if is_workday(current_date, db):
            workdays.append(current_date)
        current_date += timedelta(days=1)

    attendances_query = db.query(Attendance).filter(
        and_(
            func.date(Attendance.date) >= start_date,
            func.date(Attendance.date) <= end_date
        )
    )
    if user_ids:
        attendances_query = attendances_query.filter(Attendance.user_id.in_(user_ids))

    attendances = attendances_query.all()

    attendance_dict = {}
    non_workday_overtime_dates = set()
    for att in attendances:
        att_date = att.date.date() if isinstance(att.date, datetime) else att.date
        key = (att.user_id, att_date)
        attendance_dict[key] = att

        if (
            att.checkin_status == AttendanceStatus.OVERTIME_PUNCH.value
            and not is_workday(att_date, db)
        ):
            non_workday_overtime_dates.add(att_date)

    display_dates = sorted(set(workdays) | non_workday_overtime_dates)

    statistics_list = []

    for user in users:
        items = []

        for target_day in display_dates:
            att = attendance_dict.get((user.id, target_day))
            has_overtime_punch = bool(att and att.checkin_status == AttendanceStatus.OVERTIME_PUNCH.value)

            if target_day in non_workday_overtime_dates:
                items.append(DailyAttendanceItem(
                    date=target_day.isoformat(),
                    weekday=get_weekday_name(target_day),
                    day_type="overtime_non_workday",
                    morning_status=None,
                    afternoon_status=None,
                    has_overtime_punch=has_overtime_punch,
                    is_late=False,
                    is_early_leave=False
                ))
                continue

            leave_info = get_leave_period_for_date(user.id, target_day, db)

            morning_status = None
            if leave_info['morning_leave'] or leave_info['full_day_leave']:
                morning_status = AttendanceStatus.LEAVE.value
            elif att and att.morning_status:
                morning_status = att.morning_status
            elif att and att.checkin_time:
                checkin_time_only = att.checkin_time.time() if att.checkin_time else None
                if checkin_time_only and (checkin_time_only.hour < 14 or (checkin_time_only.hour == 14 and checkin_time_only.minute < 10)):
                    morning_status = att.checkin_status or AttendanceStatus.NORMAL.value
                else:
                    morning_status = AttendanceStatus.ABSENT.value
            else:
                morning_status = AttendanceStatus.ABSENT.value

            afternoon_status = None
            if leave_info['afternoon_leave'] or leave_info['full_day_leave']:
                afternoon_status = AttendanceStatus.LEAVE.value
            elif att and att.afternoon_status:
                afternoon_status = att.afternoon_status
            elif att and att.checkout_time:
                afternoon_status = att.checkin_status or AttendanceStatus.NORMAL.value
            else:
                afternoon_status = AttendanceStatus.ABSENT.value

            items.append(DailyAttendanceItem(
                date=target_day.isoformat(),
                weekday=get_weekday_name(target_day),
                day_type="workday",
                morning_status=morning_status,
                afternoon_status=afternoon_status,
                has_overtime_punch=has_overtime_punch,
                is_late=att.is_late if att else False,
                is_early_leave=att.is_early_leave if att else False
            ))

        statistics_list.append(DailyAttendanceStatistics(
            user_id=user.id,
            user_name=user.username,
            real_name=user.real_name,
            department=user.department.name if user.department else None,
            items=items
        ))

    return DailyAttendanceStatisticsResponse(
        start_date=start_date.isoformat(),
        end_date=end_date.isoformat(),
        statistics=statistics_list
    )

@router.get("/attendance/daily/export")
def export_daily_attendance_statistics(
    start_date: date,
    end_date: date,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """导出每日详细统计（Excel，扁平格式，仅管理员）。"""
    daily_data = get_daily_attendance_statistics(
        start_date=start_date,
        end_date=end_date,
        department_id=department_id,
        db=db,
        current_user=current_user,
    )

    headers = [
        '姓名', '用户名', '部门', '日期', '星期', '日期类型',
        '上午状态', '下午状态', '是否迟到', '是否早退', '是否加班打卡'
    ]

    rows = []
    for stat in daily_data.statistics:
        for item in stat.items:
            if item.day_type == 'overtime_non_workday':
                morning_text = '加班' if item.has_overtime_punch else ''
                afternoon_text = '-'
                day_type_text = '非工作日'
            else:
                morning_text = _daily_status_display(
                    item.morning_status,
                    item.date,
                    'morning',
                    bool(item.is_late),
                    bool(item.is_early_leave),
                )
                afternoon_text = _daily_status_display(
                    item.afternoon_status,
                    item.date,
                    'afternoon',
                    bool(item.is_late),
                    bool(item.is_early_leave),
                )
                day_type_text = '工作日'

            rows.append([
                stat.real_name or stat.user_name,
                stat.user_name,
                stat.department or '-',
                item.date,
                item.weekday,
                day_type_text,
                morning_text,
                afternoon_text,
                '是' if item.is_late else '否',
                '是' if item.is_early_leave else '否',
                '是' if item.has_overtime_punch else '否',
            ])

    filename = f"每日详细_{start_date.isoformat()}_{end_date.isoformat()}.xlsx"
    return build_excel_stream('每日详细', headers, rows, filename)



