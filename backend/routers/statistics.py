from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import List
from datetime import datetime, timedelta, date
from ..database import get_db
from ..models import User, Attendance, LeaveApplication, OvertimeApplication, UserRole, LeaveStatus, OvertimeStatus, Holiday
from ..schemas import AttendanceStatistics, PeriodStatistics, LeaveApplicationResponse, OvertimeApplicationResponse
from ..security import get_current_user, get_current_active_admin

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
    
    # 构建查询（排除admin账户）
    query = db.query(User).filter(User.username != "admin")
    
    # 如果是部门主任，只能查看本部门
    if current_user.role == UserRole.DEPARTMENT_HEAD:
        query = query.filter(User.department_id == current_user.department_id)
    elif department_id:
        query = query.filter(User.department_id == department_id)
    
    users = query.all()
    
    # 计算日期范围内的实际工作日天数（排除周末和法定节假日）
    total_days = calculate_workdays(start_date, end_date, db)
    
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
        leaves = db.query(LeaveApplication).filter(
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
        overtime_days = sum(o.days for o in overtimes if o.days is not None)
        overtime_count = len(overtimes)  # 加班次数（只统计已批准的）
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
            work_hours=work_hours
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
    
    # 统计激活用户（排除admin）
    total_users = 0
    admin_found = False
    for user in all_users:
        if user.is_active:
            if user.username == "admin":
                admin_found = True
            else:
                total_users += 1
    
    # 调试信息（生产环境可删除）
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"总用户数统计: 总用户数={len(all_users)}, 激活用户数={sum(1 for u in all_users if u.is_active)}, admin存在={admin_found}, 总员工数={total_users}")
    
    # 计算实际工作日天数（排除周末和法定节假日）
    total_days = calculate_workdays(start_date, end_date, db)
    
    # 应出勤次数
    expected_attendance = total_users * total_days
    
    # 实际出勤次数（排除admin账户的考勤记录）
    admin_user = db.query(User).filter(User.username == "admin").first()
    admin_user_id = admin_user.id if admin_user else None
    
    actual_attendance_query = db.query(Attendance).filter(
        and_(
            func.date(Attendance.date) >= start_date,
            func.date(Attendance.date) <= end_date
        )
    )
    if admin_user_id:
        actual_attendance_query = actual_attendance_query.filter(Attendance.user_id != admin_user_id)
    actual_attendance = actual_attendance_query.count()
    
    # 出勤率
    attendance_rate = (actual_attendance / expected_attendance * 100) if expected_attendance > 0 else 0
    
    # 总请假天数（排除admin账户）
    leaves_query = db.query(LeaveApplication).filter(
        and_(
            LeaveApplication.status == LeaveStatus.APPROVED,
            LeaveApplication.start_date <= datetime.combine(end_date, datetime.max.time()),
            LeaveApplication.end_date >= datetime.combine(start_date, datetime.min.time())
        )
    )
    if admin_user_id:
        leaves_query = leaves_query.filter(LeaveApplication.user_id != admin_user_id)
    leaves = leaves_query.all()
    total_leave_days = sum(l.days for l in leaves)
    
    # 总加班天数（排除admin账户，只要加班日期在统计范围内即可）
    overtimes_query = db.query(OvertimeApplication).filter(
        and_(
            OvertimeApplication.status == OvertimeStatus.APPROVED,
            func.date(OvertimeApplication.start_time) <= end_date,
            func.date(OvertimeApplication.start_time) >= start_date
        )
    )
    if admin_user_id:
        overtimes_query = overtimes_query.filter(OvertimeApplication.user_id != admin_user_id)
    overtimes = overtimes_query.all()
    total_overtime_days = sum(o.days for o in overtimes if o.days is not None)
    
    return PeriodStatistics(
        start_date=datetime.combine(start_date, datetime.min.time()),
        end_date=datetime.combine(end_date, datetime.max.time()),
        total_users=total_users,
        attendance_rate=round(attendance_rate, 2),
        total_leave_days=total_leave_days,
        total_overtime_days=total_overtime_days
    )


@router.get("/my", response_model=AttendanceStatistics)
def get_my_statistics(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取我的统计数据"""
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
    leaves = db.query(LeaveApplication).filter(
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
    overtime_days = sum(o.days for o in overtimes if o.days is not None)
    overtime_count = len(overtimes)  # 加班次数（只统计已批准的）
    work_hours = sum(a.work_hours for a in attendances if a.work_hours is not None)
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
    
    # 如果是部门主任，只能查看本部门
    if current_user.role == UserRole.DEPARTMENT_HEAD:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or user.department_id != current_user.department_id:
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
    
    return leaves


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
    
    # 如果是部门主任，只能查看本部门
    if current_user.role == UserRole.DEPARTMENT_HEAD:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or user.department_id != current_user.department_id:
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


