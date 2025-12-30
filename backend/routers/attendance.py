from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import List, Optional, Dict, Any
from datetime import datetime, date, timedelta
import json
import httpx
from ..database import get_db
from ..models import Attendance, User, AttendancePolicy, UserRole, AttendanceViewer, LeaveApplication, OvertimeApplication, Department, Holiday, LeaveStatus, CheckinStatusConfig
from ..schemas import (
    AttendanceCheckin, AttendanceCheckout, AttendanceResponse, AttendanceUpdate, 
    AttendancePolicyResponse, AttendancePolicyCreate, AttendancePolicyUpdate,
    BatchGeocodeRequest, BatchGeocodeResponse, GeocodeResult, LocationPoint,
    AttendanceOverviewResponse, AttendanceOverviewItem, LeaveStatusResponse,
    CheckinStatusConfigResponse, CheckinStatusConfigCreate, CheckinStatusConfigUpdate
)
from ..security import get_current_user, get_current_active_admin
from ..config import settings
from ..geocode_cache import get_cached_address, set_cached_address

router = APIRouter(prefix="/attendance", tags=["考勤管理"])


def get_policy_for_date(policy: AttendancePolicy, check_date: datetime) -> Dict[str, Any]:
    """
    获取指定日期的策略规则
    
    Args:
        policy: 打卡策略对象
        check_date: 检查日期
        
    Returns:
        包含策略规则的字典
    """
    # 获取星期几（0=周一, 6=周日）
    weekday = check_date.weekday()
    
    # 默认规则
    rules = {
        'work_start_time': policy.work_start_time,
        'work_end_time': policy.work_end_time,
        'checkin_start_time': policy.checkin_start_time,
        'checkin_end_time': policy.checkin_end_time,
        'checkout_start_time': policy.checkout_start_time,
        'checkout_end_time': policy.checkout_end_time,
        'late_threshold_minutes': policy.late_threshold_minutes,
        'early_threshold_minutes': policy.early_threshold_minutes,
    }
    
    # 如果有每周规则，则应用特定规则
    if policy.weekly_rules:
        try:
            weekly_rules = json.loads(policy.weekly_rules)
            if str(weekday) in weekly_rules:
                day_rules = weekly_rules[str(weekday)]
                rules.update(day_rules)
        except (json.JSONDecodeError, TypeError):
            pass  # 使用默认规则
    
    return rules


def calculate_work_hours(checkin_time: datetime, checkout_time: datetime) -> float:
    """计算工作时长（小时）"""
    delta = checkout_time - checkin_time
    return round(delta.total_seconds() / 3600, 2)


def is_late(checkin_time: datetime, policy: AttendancePolicy) -> bool:
    """判断是否迟到"""
    rules = get_policy_for_date(policy, checkin_time)
    work_start = datetime.strptime(rules['work_start_time'], "%H:%M").time()
    checkin = checkin_time.time()
    
    # 加上迟到阈值
    work_start_with_threshold = (
        datetime.combine(date.today(), work_start) + 
        timedelta(minutes=rules['late_threshold_minutes'])
    ).time()
    
    return checkin > work_start_with_threshold


def is_early_leave(checkout_time: datetime, policy: AttendancePolicy) -> bool:
    """判断是否早退"""
    rules = get_policy_for_date(policy, checkout_time)
    work_end = datetime.strptime(rules['work_end_time'], "%H:%M").time()
    checkout = checkout_time.time()
    
    # 减去早退阈值
    work_end_with_threshold = (
        datetime.combine(date.today(), work_end) - 
        timedelta(minutes=rules['early_threshold_minutes'])
    ).time()
    
    return checkout < work_end_with_threshold


def get_leave_period_for_date(user_id: int, target_date: date, db: Session) -> Dict[str, bool]:
    """
    获取指定用户在指定日期的请假时段
    
    Args:
        user_id: 用户ID
        target_date: 目标日期
        db: 数据库会话
        
    Returns:
        包含请假信息的字典: {
            'has_leave': bool,  # 是否有请假
            'morning_leave': bool,  # 是否上午请假
            'afternoon_leave': bool,  # 是否下午请假
            'full_day_leave': bool  # 是否全天请假
        }
    """
    result = {
        'has_leave': False,
        'morning_leave': False,
        'afternoon_leave': False,
        'full_day_leave': False
    }
    
    # 查询该日期范围内的有效请假（排除已拒绝和已取消的请假）
    # 只要有请假申请（无论是否被核准），都应该按请假计算
    target_datetime_start = datetime.combine(target_date, datetime.min.time())
    target_datetime_end = datetime.combine(target_date, datetime.max.time())
    
    leaves = db.query(LeaveApplication).filter(
        and_(
            LeaveApplication.user_id == user_id,
            LeaveApplication.status.notin_([LeaveStatus.REJECTED.value, LeaveStatus.CANCELLED.value]),
            LeaveApplication.start_date <= target_datetime_end,
            LeaveApplication.end_date >= target_datetime_start
        )
    ).all()
    
    if not leaves:
        return result
    
    result['has_leave'] = True
    
    for leave in leaves:
        start_date_only = leave.start_date.date() if isinstance(leave.start_date, datetime) else leave.start_date
        end_date_only = leave.end_date.date() if isinstance(leave.end_date, datetime) else leave.end_date
        start_time = leave.start_date.time() if isinstance(leave.start_date, datetime) else datetime.min.time()
        end_time = leave.end_date.time() if isinstance(leave.end_date, datetime) else datetime.max.time()
        
        # 判断规则1: 起始时间为9点且时长为0.5天的 → 上午请假
        if (start_time.hour == 9 and start_time.minute == 0 and 
            leave.days == 0.5 and start_date_only == target_date):
            result['morning_leave'] = True
            continue
        
        # 判断规则2: 起始时间为14点的，请假起始的当天记录为 下午请假
        if (start_time.hour == 14 and start_time.minute == 0 and 
            start_date_only == target_date):
            result['afternoon_leave'] = True
            continue
        
        # 判断规则3: 假期时长大于等于一天的且请假结束时间为12点的，假期结束当天上午记录为请假
        if (leave.days >= 1.0 and end_time.hour == 12 and end_time.minute == 0 and 
            end_date_only == target_date):
            result['morning_leave'] = True
            continue
        
        # 如果请假跨天，且目标日期在中间，则全天请假
        if start_date_only < target_date < end_date_only:
            result['full_day_leave'] = True
            result['morning_leave'] = True
            result['afternoon_leave'] = True
            continue
        
        # 如果请假开始日期和结束日期都是目标日期
        if start_date_only == target_date == end_date_only:
            # 根据开始和结束时间判断
            if start_time.hour < 12:  # 上午开始
                if end_time.hour < 14:  # 上午结束
                    result['morning_leave'] = True
                else:  # 下午或全天结束
                    result['full_day_leave'] = True
                    result['morning_leave'] = True
                    result['afternoon_leave'] = True
            elif start_time.hour >= 14:  # 下午开始
                result['afternoon_leave'] = True
            else:  # 中午开始
                result['afternoon_leave'] = True
        elif start_date_only == target_date:
            # 请假开始日期是目标日期
            if start_time.hour < 12:
                result['morning_leave'] = True
            else:
                result['afternoon_leave'] = True
        elif end_date_only == target_date:
            # 请假结束日期是目标日期
            if end_time.hour < 14:
                result['morning_leave'] = True
            else:
                result['afternoon_leave'] = True
    
    # 如果上午和下午都请假，则全天请假
    if result['morning_leave'] and result['afternoon_leave']:
        result['full_day_leave'] = True
    
    return result


@router.post("/checkin", response_model=AttendanceResponse)
def checkin(
    checkin_data: AttendanceCheckin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """上班打卡"""
    from ..models import AttendanceStatus
    
    # 获取当前日期和时间
    today = datetime.now().date()
    checkin_time = datetime.now()
    checkin_time_only = checkin_time.time()
    
    # 检查今天是否已经打过卡
    existing_attendance = db.query(Attendance).filter(
        and_(
            Attendance.user_id == current_user.id,
            func.date(Attendance.date) == today
        )
    ).first()
    
    if existing_attendance and existing_attendance.checkin_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="今天已经打过上班卡"
        )
    
    # 获取活跃的打卡策略
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
    
    # 检查请假情况
    leave_info = get_leave_period_for_date(current_user.id, today, db)
    
    # 如果全天请假，不允许打卡
    if leave_info['full_day_leave']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="今天全天请假，无需打卡"
        )
    
    # 如果上午请假，检查是否在14:10前
    if leave_info['morning_leave']:
        # 上午请假时，14:10前可以正常签到
        afternoon_checkin_deadline = datetime.strptime("14:10", "%H:%M").time()
        if checkin_time_only > afternoon_checkin_deadline:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="上午请假，签到时间已过（14:10后不可签到）"
            )
    
    # 验证打卡时间是否在策略允许的范围内
    if policy:
        rules = get_policy_for_date(policy, checkin_time)
        checkin_start = datetime.strptime(rules['checkin_start_time'], "%H:%M").time()
        checkin_end = datetime.strptime(rules['checkin_end_time'], "%H:%M").time()
        
        # 如果上午请假，允许在14:10前签到，否则按正常时间范围检查
        if not leave_info['morning_leave']:
            if checkin_time_only < checkin_start or checkin_time_only > checkin_end:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"当前时间不在上班打卡时间范围内（{rules['checkin_start_time']} - {rules['checkin_end_time']}）"
                )
    
    # 判断是否迟到（只有在非上午请假的情况下才判断）
    late = False
    if not leave_info['morning_leave'] and policy:
        late = is_late(checkin_time, policy)
    
    # 获取签到状态，默认为normal
    checkin_status = checkin_data.checkin_status or AttendanceStatus.NORMAL.value
    
    # 根据打卡时间和请假情况确定上下午状态
    morning_status = None
    afternoon_status = None
    
    # 判断是上午还是下午打卡
    if checkin_time_only.hour < 14 or (checkin_time_only.hour == 14 and checkin_time_only.minute < 10):
        # 上午或14:10前打卡
        if leave_info['morning_leave']:
            morning_status = AttendanceStatus.LEAVE.value
        else:
            morning_status = checkin_status
    else:
        # 下午打卡（理论上不应该到这里，因为checkin_end_time是11:30）
        afternoon_status = checkin_status
    
    if existing_attendance:
        # 更新现有记录
        existing_attendance.checkin_time = checkin_time
        existing_attendance.checkin_location = checkin_data.address or checkin_data.location
        existing_attendance.checkin_latitude = checkin_data.latitude
        existing_attendance.checkin_longitude = checkin_data.longitude
        existing_attendance.is_late = late
        existing_attendance.checkin_status = checkin_status
        if morning_status:
            existing_attendance.morning_status = morning_status
        if afternoon_status:
            existing_attendance.afternoon_status = afternoon_status
        existing_attendance.morning_leave = leave_info['morning_leave']
        existing_attendance.afternoon_leave = leave_info['afternoon_leave']
        attendance = existing_attendance
    else:
        # 创建新记录
        attendance = Attendance(
            user_id=current_user.id,
            checkin_time=checkin_time,
            checkin_location=checkin_data.address or checkin_data.location,
            checkin_latitude=checkin_data.latitude,
            checkin_longitude=checkin_data.longitude,
            is_late=late,
            checkin_status=checkin_status,
            morning_status=morning_status,
            afternoon_status=afternoon_status,
            morning_leave=leave_info['morning_leave'],
            afternoon_leave=leave_info['afternoon_leave'],
            date=datetime.combine(today, datetime.min.time())
        )
        db.add(attendance)
    
    db.commit()
    db.refresh(attendance)
    
    return attendance


@router.post("/checkout", response_model=AttendanceResponse)
def checkout(
    checkout_data: AttendanceCheckout,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """下班打卡"""
    from ..models import AttendanceStatus
    
    # 获取当前日期和时间
    today = datetime.now().date()
    checkout_time = datetime.now()
    
    # 查找今天的考勤记录
    attendance = db.query(Attendance).filter(
        and_(
            Attendance.user_id == current_user.id,
            func.date(Attendance.date) == today
        )
    ).first()
    
    if not attendance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先打上班卡"
        )
    
    if attendance.checkout_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="今天已经打过下班卡"
        )
    
    # 检查请假情况
    leave_info = get_leave_period_for_date(current_user.id, today, db)
    
    # 如果下午请假，不允许签退
    if leave_info['afternoon_leave']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="下午请假，无需签退"
        )
    
    # 获取活跃的打卡策略
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
    
    checkout_time_only = checkout_time.time()
    
    # 验证打卡时间是否在策略允许的范围内
    if policy:
        rules = get_policy_for_date(policy, checkout_time)
        checkout_start = datetime.strptime(rules['checkout_start_time'], "%H:%M").time()
        checkout_end = datetime.strptime(rules['checkout_end_time'], "%H:%M").time()
        
        if checkout_time_only < checkout_start or checkout_time_only > checkout_end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"当前时间不在下班打卡时间范围内（{rules['checkout_start_time']} - {rules['checkout_end_time']}）"
            )
    
    early = is_early_leave(checkout_time, policy) if policy else False
    
    # 更新记录
    attendance.checkout_time = checkout_time
    attendance.checkout_location = checkout_data.address or checkout_data.location
    attendance.checkout_latitude = checkout_data.latitude
    attendance.checkout_longitude = checkout_data.longitude
    attendance.is_early_leave = early
    
    # 更新下午状态（如果还没有设置）
    if not attendance.afternoon_status:
        # 使用签到时的状态，如果没有则使用normal
        checkin_status = attendance.checkin_status or AttendanceStatus.NORMAL.value
        attendance.afternoon_status = checkin_status
    
    # 更新请假标记
    attendance.afternoon_leave = leave_info['afternoon_leave']
    
    # 计算工作时长
    if attendance.checkin_time:
        attendance.work_hours = calculate_work_hours(attendance.checkin_time, checkout_time)
    
    db.commit()
    db.refresh(attendance)
    
    return attendance


@router.get("/check-late")
def check_late(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """检查当前时间打卡是否会迟到（打卡前调用）"""
    # 获取活跃的打卡策略
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
    
    if not policy:
        return {"will_be_late": False, "work_start_time": None, "current_time": None}
    
    checkin_time = datetime.now()
    will_be_late = is_late(checkin_time, policy)
    
    # 获取工作开始时间
    rules = get_policy_for_date(policy, checkin_time)
    work_start = rules.get('work_start_time', '09:00')
    
    return {
        "will_be_late": will_be_late,
        "work_start_time": work_start,
        "current_time": checkin_time.strftime("%H:%M:%S")
    }


@router.get("/check-early-leave")
def check_early_leave(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """检查当前时间打卡是否会早退（打卡前调用）"""
    # 获取活跃的打卡策略
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
    
    if not policy:
        return {"will_be_early_leave": False, "work_end_time": None, "current_time": None}
    
    checkout_time = datetime.now()
    will_be_early_leave = is_early_leave(checkout_time, policy)
    
    # 获取工作结束时间
    rules = get_policy_for_date(policy, checkout_time)
    work_end = rules.get('work_end_time', '18:00')
    
    return {
        "will_be_early_leave": will_be_early_leave,
        "work_end_time": work_end,
        "current_time": checkout_time.strftime("%H:%M:%S")
    }


@router.get("/checkin-statuses", response_model=List[CheckinStatusConfigResponse])
def get_checkin_statuses(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取打卡状态列表"""
    from ..models import AttendanceStatus
    from datetime import datetime
    from sqlalchemy.exc import OperationalError
    
    try:
        default_status_configs = [
            {
                "name": "正常签到",
                "code": AttendanceStatus.NORMAL.value,
                "description": "正常签到",
                "is_active": True,
                "sort_order": 0
            },
            {
                "name": "市区办事",
                "code": AttendanceStatus.CITY_BUSINESS.value,
                "description": "市区办事",
                "is_active": True,
                "sort_order": 1
            },
            {
                "name": "出差",
                "code": AttendanceStatus.BUSINESS_TRIP.value,
                "description": "出差",
                "is_active": True,
                "sort_order": 2
            }
        ]

        # 如果是管理员且要求包含非激活状态，或者用于管理后台，返回所有记录
        query = db.query(CheckinStatusConfig)
        if not include_inactive:
            # 普通用户只获取激活的状态
            query = query.filter(CheckinStatusConfig.is_active == True)
        
        statuses = query.order_by(CheckinStatusConfig.sort_order, CheckinStatusConfig.id).all()
        
        # 将SQLAlchemy对象转换为Pydantic模型
        if statuses:
            result = []
            for status in statuses:
                try:
                    # 使用 model_validate 将 SQLAlchemy 对象转换为 Pydantic 模型
                    result.append(CheckinStatusConfigResponse.model_validate(status))
                except Exception as e:
                    # 如果转换失败，手动构建响应对象
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"转换状态配置失败，使用手动构建: {e}")
                    result.append(CheckinStatusConfigResponse(
                        id=status.id,
                        name=status.name,
                        code=status.code,
                        description=status.description,
                        is_active=status.is_active,
                        sort_order=status.sort_order,
                        created_at=status.created_at or datetime.now(),
                        updated_at=status.updated_at or datetime.now()
                    ))
            return result
        
        # 如果没有配置，尝试自动补全默认配置（避免管理后台为空）
        if not statuses:
            inserted = False
            try:
                for config in default_status_configs:
                    exists = db.query(CheckinStatusConfig).filter(CheckinStatusConfig.code == config["code"]).first()
                    if not exists:
                        status_config = CheckinStatusConfig(**config)
                        db.add(status_config)
                        inserted = True
                if inserted:
                    db.commit()
                    query = db.query(CheckinStatusConfig)
                    if not include_inactive:
                        query = query.filter(CheckinStatusConfig.is_active == True)
                    statuses = query.order_by(CheckinStatusConfig.sort_order, CheckinStatusConfig.id).all()
            except Exception as seed_error:
                db.rollback()
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"自动补全默认打卡状态失败: {seed_error}", exc_info=True)

        # 如果没有配置且是普通用户，返回默认状态（使用Pydantic模型）
        if not include_inactive:
            now = datetime.now()
            default_statuses = [
                CheckinStatusConfigResponse(
                    id=0,
                    name=config["name"],
                    code=config["code"],
                    description=config["description"],
                    is_active=config["is_active"],
                    sort_order=config["sort_order"],
                    created_at=now,
                    updated_at=now
                )
                for config in default_status_configs
            ]
            return default_statuses
        
        # 如果没有数据且包含非激活状态，返回空列表
        return []
    except OperationalError as e:
        # 表不存在，返回默认状态
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"CheckinStatusConfig表不存在，返回默认状态: {e}")
        
        now = datetime.now()
        default_statuses = [
            CheckinStatusConfigResponse(
                id=0,
                name="正常签到",
                code=AttendanceStatus.NORMAL.value,
                description="正常签到",
                is_active=True,
                sort_order=0,
                created_at=now,
                updated_at=now
            ),
            CheckinStatusConfigResponse(
                id=0,
                name="市区办事",
                code=AttendanceStatus.CITY_BUSINESS.value,
                description="市区办事",
                is_active=True,
                sort_order=1,
                created_at=now,
                updated_at=now
            ),
            CheckinStatusConfigResponse(
                id=0,
                name="出差",
                code=AttendanceStatus.BUSINESS_TRIP.value,
                description="出差",
                is_active=True,
                sort_order=2,
                created_at=now,
                updated_at=now
            )
        ]
        return default_statuses
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"获取打卡状态列表失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取打卡状态列表失败: {str(e)}"
        )


# ==================== 打卡状态配置管理 ====================
@router.post("/checkin-statuses", response_model=CheckinStatusConfigResponse, status_code=status.HTTP_201_CREATED)
def create_checkin_status(
    status_create: CheckinStatusConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """创建打卡状态配置（管理员）"""
    try:
        status_config = CheckinStatusConfig(**status_create.model_dump())
        db.add(status_config)
        db.commit()
        db.refresh(status_config)
        # 转换为Pydantic模型
        return CheckinStatusConfigResponse.model_validate(status_config)
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"创建打卡状态配置失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"创建打卡状态配置失败: {str(e)}"
        )


@router.put("/checkin-statuses/{status_id}", response_model=CheckinStatusConfigResponse)
def update_checkin_status(
    status_id: int,
    status_update: CheckinStatusConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """更新打卡状态配置（管理员）"""
    status_config = db.query(CheckinStatusConfig).filter(CheckinStatusConfig.id == status_id).first()
    if not status_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="状态配置不存在"
        )
    
    try:
        update_data = status_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(status_config, field, value)
        
        db.commit()
        db.refresh(status_config)
        # 转换为Pydantic模型
        return CheckinStatusConfigResponse.model_validate(status_config)
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"更新打卡状态配置失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新打卡状态配置失败: {str(e)}"
        )


@router.delete("/checkin-statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checkin_status(
    status_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """删除打卡状态配置（管理员）"""
    status_config = db.query(CheckinStatusConfig).filter(CheckinStatusConfig.id == status_id).first()
    if not status_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="状态配置不存在"
        )
    
    db.delete(status_config)
    db.commit()
    return None


@router.get("/leave-status", response_model=LeaveStatusResponse)
def get_leave_status(
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取当天请假状态"""
    if target_date is None:
        target_date = date.today()
    
    leave_info = get_leave_period_for_date(current_user.id, target_date, db)
    
    return LeaveStatusResponse(
        has_leave=leave_info['has_leave'],
        morning_leave=leave_info['morning_leave'],
        afternoon_leave=leave_info['afternoon_leave'],
        full_day_leave=leave_info['full_day_leave']
    )


@router.get("/my", response_model=List[AttendanceResponse])
def get_my_attendance(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    include_absent: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取我的考勤记录
    
    Args:
        start_date: 开始日期
        end_date: 结束日期
        include_absent: 是否包含缺勤日期（没有打卡的工作日）
        skip: 分页偏移
        limit: 分页限制
    """
    from ..models import AttendanceStatus
    
    query = db.query(Attendance).filter(Attendance.user_id == current_user.id)
    
    if start_date:
        query = query.filter(func.date(Attendance.date) >= start_date)
    if end_date:
        query = query.filter(func.date(Attendance.date) <= end_date)
    
    attendances = query.order_by(Attendance.date.desc()).all()
    
    # 如果需要包含缺勤日期
    if include_absent and start_date and end_date:
        # 获取已有打卡记录的日期集合
        existing_dates = set()
        for att in attendances:
            att_date = att.date.date() if isinstance(att.date, datetime) else att.date
            existing_dates.add(att_date)
        
        # 获取工作日列表
        today = date.today()
        current_date = start_date
        absent_records = []
        
        while current_date <= end_date:
            # 跳过未来日期
            if current_date > today:
                current_date += timedelta(days=1)
                continue
            
            # 检查是否为工作日
            workday_status = get_workday_status(db, current_date)
            
            if workday_status["is_workday"] and current_date not in existing_dates:
                # 检查是否请假
                leave_info = get_leave_period_for_date(current_user.id, current_date, db)
                
                # 如果全天请假，不算缺勤
                if leave_info['full_day_leave']:
                    current_date += timedelta(days=1)
                    continue
                
                # 判断是否为今天：今天未打卡显示"未签到"，之前的日期显示"缺勤"
                is_today = current_date == today
                
                # 创建虚拟记录（今天为未签到，之前为缺勤）
                absent_record = Attendance(
                    id=0,  # 虚拟ID
                    user_id=current_user.id,
                    date=datetime.combine(current_date, datetime.min.time()),
                    checkin_time=None,
                    checkout_time=None,
                    checkin_location=None,
                    checkout_location=None,
                    checkin_latitude=None,
                    checkin_longitude=None,
                    checkout_latitude=None,
                    checkout_longitude=None,
                    is_late=False,
                    is_early_leave=False,
                    work_hours=None,
                    checkin_status=None,
                    # 今天：morning_status为None（前端显示"未签到"），之前的日期：标记为absent（前端显示"缺勤"）
                    morning_status=AttendanceStatus.LEAVE.value if leave_info['morning_leave'] else (None if is_today else AttendanceStatus.ABSENT.value),
                    afternoon_status=AttendanceStatus.LEAVE.value if leave_info['afternoon_leave'] else (None if is_today else AttendanceStatus.ABSENT.value),
                    morning_leave=leave_info['morning_leave'],
                    afternoon_leave=leave_info['afternoon_leave'],
                    created_at=datetime.now()
                )
                absent_records.append(absent_record)
            
            current_date += timedelta(days=1)
        
        # 合并记录并按日期降序排序
        all_records = list(attendances) + absent_records
        all_records.sort(key=lambda x: x.date if isinstance(x.date, datetime) else datetime.combine(x.date, datetime.min.time()), reverse=True)
        
        # 应用分页
        return all_records[skip:skip + limit]
    
    return attendances[skip:skip + limit]


@router.get("/user/{user_id}", response_model=List[AttendanceResponse])
def get_user_attendance(
    user_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取指定用户的考勤记录（管理员或部门主任）"""
    # 权限检查
    if current_user.role not in [UserRole.ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    query = db.query(Attendance).filter(Attendance.user_id == user_id)
    
    if start_date:
        query = query.filter(func.date(Attendance.date) >= start_date)
    if end_date:
        query = query.filter(func.date(Attendance.date) <= end_date)
    
    attendances = query.order_by(Attendance.date.desc()).offset(skip).limit(limit).all()
    return attendances


@router.get("/", response_model=List[AttendanceResponse])
def list_attendance(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取所有考勤记录（管理员）"""
    query = db.query(Attendance)
    
    if start_date:
        query = query.filter(func.date(Attendance.date) >= start_date)
    if end_date:
        query = query.filter(func.date(Attendance.date) <= end_date)
    if user_id:
        query = query.filter(Attendance.user_id == user_id)
    
    attendances = query.order_by(Attendance.date.desc()).offset(skip).limit(limit).all()
    return attendances


# ==================== 打卡策略管理 ====================
@router.get("/policies", response_model=List[AttendancePolicyResponse])
def list_policies(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取打卡策略列表"""
    policies = db.query(AttendancePolicy).offset(skip).limit(limit).all()
    return policies


@router.post("/policies", response_model=AttendancePolicyResponse, status_code=status.HTTP_201_CREATED)
def create_policy(
    policy_create: AttendancePolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """创建打卡策略（管理员）"""
    # 如果新策略是活跃的，将其他策略设为非活跃
    if policy_create.is_active:
        db.query(AttendancePolicy).update({"is_active": False})
    
    policy = AttendancePolicy(**policy_create.model_dump())
    db.add(policy)
    db.commit()
    db.refresh(policy)
    
    return policy


@router.put("/policies/{policy_id}", response_model=AttendancePolicyResponse)
def update_policy(
    policy_id: int,
    policy_update: AttendancePolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """更新打卡策略（管理员）"""
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="策略不存在"
        )
    
    update_data = policy_update.model_dump(exclude_unset=True)
    
    # 如果要激活这个策略，先将其他策略设为非活跃
    if update_data.get("is_active"):
        db.query(AttendancePolicy).filter(AttendancePolicy.id != policy_id).update({"is_active": False})
    
    for field, value in update_data.items():
        setattr(policy, field, value)
    
    db.commit()
    db.refresh(policy)
    
    return policy


@router.delete("/policies/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """删除打卡策略（管理员）"""
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="策略不存在"
        )
    
    db.delete(policy)
    db.commit()
    
    return None


async def _reverse_geocode_internal(latitude: float, longitude: float) -> str:
    """
    内部逆地理编码函数，带缓存
    """
    # 先检查缓存
    cached_address = get_cached_address(latitude, longitude)
    if cached_address:
        return cached_address
    
    # 检查API Key配置
    api_key = settings.AMAP_API_KEY
    if not api_key or api_key.strip() == "":
        # 如果未配置API Key，返回坐标作为备选方案
        address = f"{latitude:.6f}, {longitude:.6f}"
        return address
    
    try:
        # 调用高德地图逆地理编码API
        # 注意：高德地图API要求经纬度格式为：经度,纬度
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                "https://restapi.amap.com/v3/geocode/regeo",
                params={
                    "key": api_key,
                    "location": f"{longitude},{latitude}",  # 高德地图要求：经度,纬度
                    "radius": 1000,
                    "extensions": "all",
                    "output": "json"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="高德地图API请求失败"
                )
            
            data = response.json()
            
            # 检查API返回状态
            if data.get("status") != "1":
                error_msg = data.get("info", "未知错误")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"高德地图API错误: {error_msg}"
                )
            
            # 提取地址信息
            regeocode = data.get("regeocode", {})
            if not regeocode:
                return {"address": f"{latitude:.6f}, {longitude:.6f}"}
            
            formatted_address = regeocode.get("formatted_address", "")
            addressComponent = regeocode.get("addressComponent", {})
            
            # 构建详细地址
            if formatted_address:
                # 如果有格式化地址，直接使用
                address = formatted_address
            else:
                # 否则手动构建地址
                province = addressComponent.get("province", "")
                city = addressComponent.get("city", "") or addressComponent.get("district", "")
                district = addressComponent.get("district", "")
                township = addressComponent.get("township", "")
                street = addressComponent.get("street", "")
                streetNumber = addressComponent.get("streetNumber", {})
                building = addressComponent.get("building", {})
                
                # 构建地址字符串
                address_parts = []
                if province:
                    address_parts.append(province)
                if city and city != province:
                    address_parts.append(city)
                if district and district != city:
                    address_parts.append(district)
                if township:
                    address_parts.append(township)
                if street:
                    address_parts.append(street)
                if streetNumber and streetNumber.get("number"):
                    address_parts.append(streetNumber["number"] + "号")
                if building and building.get("name"):
                    address_parts.append(building["name"])
                
                address = "".join(address_parts) if address_parts else f"{latitude:.6f}, {longitude:.6f}"
            
            # 保存到缓存
            set_cached_address(latitude, longitude, address)
            return address
            
    except httpx.TimeoutException:
        # API请求超时，返回坐标作为备选
        address = f"{latitude:.6f}, {longitude:.6f}"
        return address
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        # 如果出错，返回坐标作为备选
        import logging
        logging.error(f"高德地图API调用失败: {str(e)}")
        address = f"{latitude:.6f}, {longitude:.6f}"
        return address


@router.get("/geocode/reverse")
async def reverse_geocode(
    latitude: float,
    longitude: float,
    current_user: User = Depends(get_current_user)
):
    """
    逆地理编码：将经纬度转换为地址文本
    使用高德地图API，带缓存
    """
    address = await _reverse_geocode_internal(latitude, longitude)
    return {"address": address}


@router.post("/geocode/batch", response_model=BatchGeocodeResponse)
async def batch_reverse_geocode(
    request: BatchGeocodeRequest,
    current_user: User = Depends(get_current_user)
):
    """
    批量逆地理编码：将多个经纬度转换为地址文本
    使用高德地图API，带缓存，异步处理
    """
    import asyncio
    
    locations = request.locations
    
    async def get_address(loc: LocationPoint) -> GeocodeResult:
        """异步获取单个地址"""
        lat = loc.latitude
        lon = loc.longitude
        
        try:
            address = await _reverse_geocode_internal(lat, lon)
            return GeocodeResult(
                latitude=lat,
                longitude=lon,
                address=address
            )
        except Exception as e:
            return GeocodeResult(
                latitude=lat,
                longitude=lon,
                address=f"{lat:.6f}, {lon:.6f}",
                error=str(e)
            )
    
    # 并发处理所有地址转换（限制并发数为10，避免过多API调用）
    semaphore = asyncio.Semaphore(10)
    
    async def get_address_with_semaphore(loc: LocationPoint) -> GeocodeResult:
        async with semaphore:
            return await get_address(loc)
    
    # 并发执行所有地址转换
    results = await asyncio.gather(*[get_address_with_semaphore(loc) for loc in locations])
    
    return BatchGeocodeResponse(results=results)


# ==================== 出勤情况概览 ====================
def check_attendance_view_permission(db: Session, user: User) -> bool:
    """检查用户是否有查看全部人员出勤情况的权限"""
    # 总经理和副总默认有权限
    if user.role in [UserRole.GENERAL_MANAGER, UserRole.VICE_PRESIDENT]:
        return True
    
    # 检查是否在授权列表中
    viewer = db.query(AttendanceViewer).filter(AttendanceViewer.user_id == user.id).first()
    return viewer is not None


def get_workday_status(db: Session, target_date: date) -> Dict[str, Any]:
    """获取指定日期的工作日状态"""
    date_str = target_date.isoformat()
    holiday = db.query(Holiday).filter(Holiday.date == date_str).first()
    
    if holiday:
        if holiday.type == "holiday":
            return {"is_workday": False, "reason": holiday.name or "法定节假日"}
        if holiday.type == "company_holiday":
            return {"is_workday": False, "reason": holiday.name or "公司节假日"}
        if holiday.type == "workday":
            return {"is_workday": True, "reason": holiday.name or "调休工作日"}
    
    weekday = target_date.weekday()
    if weekday >= 5:
        return {"is_workday": False, "reason": "周末"}
    return {"is_workday": True, "reason": "正常工作日"}


@router.get("/overview", response_model=AttendanceOverviewResponse)
def get_attendance_overview(
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取全部人员的出勤情况概览（当日及历史）
    仅总经理、副总及授权人员可以访问
    """
    # 权限检查
    if not check_attendance_view_permission(db, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您没有权限查看全部人员的出勤情况"
        )
    
    # 如果没有指定日期，使用今天
    if target_date is None:
        target_date = date.today()
    
    workday_status = get_workday_status(db, target_date)
    
    # 获取所有激活的用户（排除admin、排除关闭考勤管理的用户）
    users = db.query(User).filter(
        User.is_active == True,
        User.username != "admin",
        User.enable_attendance == True
    ).all()
    
    # 获取过滤后用户的ID列表
    user_ids = [user.id for user in users]
    
    # 获取目标日期的考勤记录（只查询已过滤用户的记录）
    if user_ids:
        attendances = db.query(Attendance).filter(
            func.date(Attendance.date) == target_date,
            Attendance.user_id.in_(user_ids)
        ).all()
    else:
        attendances = []
    attendance_dict = {att.user_id: att for att in attendances}
    
    # 获取目标日期的请假记录（已批准的，只查询已过滤用户的记录）
    if user_ids:
        leaves = db.query(LeaveApplication).filter(
            func.date(LeaveApplication.start_date) <= target_date,
            func.date(LeaveApplication.end_date) >= target_date,
            LeaveApplication.status == "approved",
            LeaveApplication.user_id.in_(user_ids)
        ).all()
    else:
        leaves = []
    # 格式化日期时间为前端使用的格式（不带时区信息）
    def format_datetime_for_frontend(dt):
        if isinstance(dt, datetime):
            # 返回不带时区的 ISO 格式字符串：YYYY-MM-DDTHH:MM:SS
            return dt.strftime('%Y-%m-%dT%H:%M:%S')
        return str(dt)
    
    leave_dict = {}
    leave_details = {}
    for leave in leaves:
        if leave.user_id not in leave_dict:
            leave_dict[leave.user_id] = 0.0
        if leave.user_id not in leave_details:
            leave_details[leave.user_id] = {
                "start": None,
                "end": None
            }
        # 计算该日期占用的请假天数（简化处理：跨天请假中间日算整天）
        # 保留完整的 datetime 信息，以便前端显示时间
        # LeaveApplication 的 start_date 和 end_date 都是 DateTime 类型，直接使用
        start = leave.start_date
        end = leave.end_date
        # 确保是 datetime 类型，如果是 date 类型则添加时间
        if not isinstance(start, datetime):
            start = datetime.combine(start, datetime.min.time())
        if not isinstance(end, datetime):
            end = datetime.combine(end, datetime.max.time())
        # 使用格式化函数返回不带时区的 ISO 格式字符串，确保包含时间信息
        # 格式：YYYY-MM-DDTHH:MM:SS（不包含时区信息，当作本地时间）
        leave_details[leave.user_id] = {
            "start": format_datetime_for_frontend(start),
            "end": format_datetime_for_frontend(end)
        }
        # 使用请假记录的总天数，而不是当天占用的天数
        # 这样前端显示"请假中"时，能看到完整的请假时长
        leave_dict[leave.user_id] = leave.days
    
    # 获取目标日期的加班记录（已批准的，只查询已过滤用户的记录）
    if user_ids:
        overtimes = db.query(OvertimeApplication).filter(
            func.date(OvertimeApplication.start_time) <= target_date,
            func.date(OvertimeApplication.end_time) >= target_date,
            OvertimeApplication.status == "approved",
            OvertimeApplication.user_id.in_(user_ids)
        ).all()
    else:
        overtimes = []
    overtime_dict = {}
    overtime_details = {}
    for overtime in overtimes:
        if overtime.user_id not in overtime_dict:
            overtime_dict[overtime.user_id] = 0.0
            overtime_details[overtime.user_id] = {
                "start": overtime.start_time,
                "end": overtime.end_time
            }
        else:
            detail = overtime_details[overtime.user_id]
            if overtime.start_time < detail["start"]:
                detail["start"] = overtime.start_time
            if overtime.end_time > detail["end"]:
                detail["end"] = overtime.end_time
        # 累加加班总天数（使用实际记录的天数）
        overtime_dict[overtime.user_id] += overtime.days
    
    # 构建结果
    items = []
    checked_in_count = 0
    on_leave_count = 0
    on_overtime_count = 0
    
    for user in users:
        att = attendance_dict.get(user.id)
        has_leave = user.id in leave_dict
        has_overtime = user.id in overtime_dict
        
        if att:
            checked_in_count += 1
        
        if has_leave:
            on_leave_count += 1
        
        if has_overtime:
            on_overtime_count += 1
        
        # 获取部门名称
        department_name = None
        if user.department_id:
            dept = db.query(Department).filter(Department.id == user.department_id).first()
            if dept:
                department_name = dept.name
        
        item = AttendanceOverviewItem(
            user_id=user.id,
            user_name=user.username,
            real_name=user.real_name,
            role=user.role.value if hasattr(user.role, "value") else user.role,
            department_name=department_name,
            leave_start_date=leave_details.get(user.id, {}).get("start") if user.id in leave_dict else None,
            leave_end_date=leave_details.get(user.id, {}).get("end") if user.id in leave_dict else None,
            checkin_time=att.checkin_time if att else None,
            checkout_time=att.checkout_time if att else None,
            is_late=att.is_late if att else False,
            is_early_leave=att.is_early_leave if att else False,
            work_hours=att.work_hours if att else None,
            has_leave=has_leave,
            leave_days=leave_dict.get(user.id, 0.0),
            has_overtime=has_overtime,
            overtime_days=overtime_dict.get(user.id, 0.0),
            overtime_start_time=format_datetime_for_frontend(overtime_details.get(user.id, {}).get("start")) if has_overtime and overtime_details.get(user.id, {}).get("start") else None,
            overtime_end_time=format_datetime_for_frontend(overtime_details.get(user.id, {}).get("end")) if has_overtime and overtime_details.get(user.id, {}).get("end") else None
        )
        items.append(item)
    
    return AttendanceOverviewResponse(
        date=target_date.isoformat(),
        items=items,
        total_users=len(users),
        checked_in_count=checked_in_count,
        on_leave_count=on_leave_count,
        on_overtime_count=on_overtime_count,
        is_workday=workday_status["is_workday"],
        workday_reason=workday_status["reason"]
    )


@router.put("/{attendance_id}", response_model=AttendanceResponse)
def update_attendance(
    attendance_id: int,
    attendance_update: AttendanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """更新考勤记录（仅管理员）"""
    attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not attendance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="考勤记录不存在"
        )
    
    update_data = attendance_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(attendance, field, value)
    
    db.commit()
    db.refresh(attendance)
    return attendance


@router.delete("/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """删除考勤记录（仅管理员）"""
    attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not attendance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="考勤记录不存在"
        )
    
    db.delete(attendance)
    db.commit()
    return None

