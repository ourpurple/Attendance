"""
考勤服务
封装考勤相关的业务逻辑
"""
import json
from typing import Dict, Any, Optional, List
from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session

from ..models import (
    Attendance, AttendancePolicy, User, AttendanceStatus,
    LeaveApplication, LeaveStatus
)
from ..repositories import AttendanceRepository, LeaveRepository
from ..exceptions import ValidationException, NotFoundException, ConflictException
from ..utils.transaction import transaction


class AttendanceService:
    """考勤服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        self.attendance_repo = AttendanceRepository(db)
        self.leave_repo = LeaveRepository(db)
    
    @staticmethod
    def get_policy_for_date(policy: AttendancePolicy, check_date: datetime) -> Dict[str, Any]:
        """
        获取指定日期的策略规则
        
        Args:
            policy: 打卡策略对象
            check_date: 检查日期
            
        Returns:
            包含策略规则的字典
        """
        weekday = check_date.weekday()
        
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
        
        if policy.weekly_rules:
            try:
                weekly_rules = json.loads(policy.weekly_rules)
                if str(weekday) in weekly_rules:
                    day_rules = weekly_rules[str(weekday)]
                    rules.update(day_rules)
            except (json.JSONDecodeError, TypeError):
                pass
        
        return rules
    
    @staticmethod
    def calculate_work_hours(checkin_time: datetime, checkout_time: datetime) -> float:
        """计算工作时长（小时）"""
        delta = checkout_time - checkin_time
        return round(delta.total_seconds() / 3600, 2)
    
    def is_late(self, checkin_time: datetime, policy: AttendancePolicy) -> bool:
        """判断是否迟到"""
        rules = self.get_policy_for_date(policy, checkin_time)
        work_start = datetime.strptime(rules['work_start_time'], "%H:%M").time()
        checkin = checkin_time.time()
        
        work_start_with_threshold = (
            datetime.combine(date.today(), work_start) + 
            timedelta(minutes=rules['late_threshold_minutes'])
        ).time()
        
        return checkin > work_start_with_threshold
    
    def is_early_leave(self, checkout_time: datetime, policy: AttendancePolicy) -> bool:
        """判断是否早退"""
        rules = self.get_policy_for_date(policy, checkout_time)
        work_end = datetime.strptime(rules['work_end_time'], "%H:%M").time()
        checkout = checkout_time.time()
        
        work_end_with_threshold = (
            datetime.combine(date.today(), work_end) - 
            timedelta(minutes=rules['early_threshold_minutes'])
        ).time()
        
        return checkout < work_end_with_threshold
    
    def get_leave_period_for_date(self, user_id: int, target_date: date) -> Dict[str, bool]:
        """
        获取指定用户在指定日期的请假时段
        
        Returns:
            包含请假信息的字典
        """
        result = {
            'has_leave': False,
            'morning_leave': False,
            'afternoon_leave': False,
            'full_day_leave': False
        }
        
        target_datetime_start = datetime.combine(target_date, datetime.min.time())
        target_datetime_end = datetime.combine(target_date, datetime.max.time())
        
        leaves = self.db.query(LeaveApplication).filter(
            LeaveApplication.user_id == user_id,
            LeaveApplication.status.notin_([LeaveStatus.REJECTED.value, LeaveStatus.CANCELLED.value]),
            LeaveApplication.start_date <= target_datetime_end,
            LeaveApplication.end_date >= target_datetime_start
        ).all()
        
        if not leaves:
            return result
        
        result['has_leave'] = True
        
        for leave in leaves:
            start_date_only = leave.start_date.date() if isinstance(leave.start_date, datetime) else leave.start_date
            end_date_only = leave.end_date.date() if isinstance(leave.end_date, datetime) else leave.end_date
            start_time = leave.start_date.time() if isinstance(leave.start_date, datetime) else datetime.min.time()
            end_time = leave.end_date.time() if isinstance(leave.end_date, datetime) else datetime.max.time()
            
            if (start_time.hour == 9 and start_time.minute == 0 and 
                leave.days == 0.5 and start_date_only == target_date):
                result['morning_leave'] = True
                continue
            
            if (start_time.hour == 14 and start_time.minute == 0 and 
                start_date_only == target_date):
                result['afternoon_leave'] = True
                continue
            
            if (leave.days >= 1.0 and end_time.hour == 12 and end_time.minute == 0 and 
                end_date_only == target_date):
                result['morning_leave'] = True
                continue
            
            if start_date_only < target_date < end_date_only:
                result['full_day_leave'] = True
                result['morning_leave'] = True
                result['afternoon_leave'] = True
                continue
            
            if start_date_only == target_date == end_date_only:
                if start_time.hour < 12:
                    if end_time.hour < 14:
                        result['morning_leave'] = True
                    else:
                        result['full_day_leave'] = True
                        result['morning_leave'] = True
                        result['afternoon_leave'] = True
                elif start_time.hour >= 14:
                    result['afternoon_leave'] = True
                else:
                    result['afternoon_leave'] = True
            elif start_date_only == target_date:
                if start_time.hour < 12:
                    result['morning_leave'] = True
                else:
                    result['afternoon_leave'] = True
            elif end_date_only == target_date:
                if end_time.hour < 14:
                    result['morning_leave'] = True
                else:
                    result['afternoon_leave'] = True
        
        if result['morning_leave'] and result['afternoon_leave']:
            result['full_day_leave'] = True
        
        return result
    
    @transaction
    def checkin(
        self,
        user: User,
        latitude: float,
        longitude: float,
        location: str,
        address: Optional[str] = None,
        checkin_status: str = AttendanceStatus.NORMAL.value
    ) -> Attendance:
        """
        上班打卡
        
        Args:
            user: 用户对象
            latitude: 纬度
            longitude: 经度
            location: 位置描述
            address: 地址（可选）
            checkin_status: 打卡状态
        
        Returns:
            考勤记录对象
        
        Raises:
            ValidationException: 验证失败
            ConflictException: 已打过卡
        """
        today = datetime.now().date()
        checkin_time = datetime.now()
        checkin_time_only = checkin_time.time()
        
        # 检查今天是否已经打过卡
        existing_attendance = self.attendance_repo.get_by_user_and_date(user.id, today)
        
        if existing_attendance and existing_attendance.checkin_time:
            raise ConflictException("今天已经打过上班卡")
        
        # 获取活跃的打卡策略
        policy = self.attendance_repo.get_active_policy()
        if not policy:
            raise NotFoundException("打卡策略", "未找到活跃的打卡策略")
        
        # 检查请假情况
        leave_info = self.get_leave_period_for_date(user.id, today)
        
        if leave_info['full_day_leave']:
            raise ValidationException("今天全天请假，无需打卡")
        
        # 如果上午请假，检查是否在14:10前
        if leave_info['morning_leave']:
            afternoon_checkin_deadline = datetime.strptime("14:10", "%H:%M").time()
            if checkin_time_only > afternoon_checkin_deadline:
                raise ValidationException("上午请假，签到时间已过（14:10后不可签到）")
        
        # 验证打卡时间是否在策略允许的范围内
        rules = self.get_policy_for_date(policy, checkin_time)
        checkin_start = datetime.strptime(rules['checkin_start_time'], "%H:%M").time()
        checkin_end = datetime.strptime(rules['checkin_end_time'], "%H:%M").time()
        
        if not leave_info['morning_leave']:
            if checkin_time_only < checkin_start or checkin_time_only > checkin_end:
                raise ValidationException(
                    f"当前时间不在上班打卡时间范围内（{rules['checkin_start_time']} - {rules['checkin_end_time']}）"
                )
        
        # 判断是否迟到
        late = False
        if not leave_info['morning_leave']:
            late = self.is_late(checkin_time, policy)
        
        # 根据打卡时间和请假情况确定上下午状态
        morning_status = None
        afternoon_status = None
        
        if checkin_time_only.hour < 14 or (checkin_time_only.hour == 14 and checkin_time_only.minute < 10):
            if leave_info['morning_leave']:
                morning_status = AttendanceStatus.LEAVE.value
            else:
                morning_status = checkin_status
        else:
            afternoon_status = checkin_status
        
        # 创建或更新考勤记录
        if existing_attendance:
            existing_attendance.checkin_time = checkin_time
            existing_attendance.checkin_location = address or location
            existing_attendance.checkin_latitude = latitude
            existing_attendance.checkin_longitude = longitude
            existing_attendance.is_late = late
            existing_attendance.checkin_status = checkin_status
            if morning_status:
                existing_attendance.morning_status = morning_status
            if afternoon_status:
                existing_attendance.afternoon_status = afternoon_status
            attendance = existing_attendance
        else:
            attendance = self.attendance_repo.create(
                user_id=user.id,
                date=datetime.combine(today, datetime.min.time()),
                checkin_time=checkin_time,
                checkin_location=address or location,
                checkin_latitude=latitude,
                checkin_longitude=longitude,
                is_late=late,
                checkin_status=checkin_status,
                morning_status=morning_status,
                afternoon_status=afternoon_status
            )
        
        return attendance
    
    @transaction
    def checkout(
        self,
        user: User,
        latitude: float,
        longitude: float,
        location: str,
        address: Optional[str] = None
    ) -> Attendance:
        """
        下班打卡
        
        Args:
            user: 用户对象
            latitude: 纬度
            longitude: 经度
            location: 位置描述
            address: 地址（可选）
        
        Returns:
            考勤记录对象
        
        Raises:
            ValidationException: 验证失败
            NotFoundException: 未找到考勤记录
        """
        today = datetime.now().date()
        checkout_time = datetime.now()
        checkout_time_only = checkout_time.time()
        
        # 获取今天的考勤记录
        attendance = self.attendance_repo.get_by_user_and_date(user.id, today)
        
        if not attendance:
            raise NotFoundException("考勤记录", "今天还没有上班打卡，无法下班打卡")
        
        if attendance.checkout_time:
            raise ConflictException("今天已经打过下班卡")
        
        # 获取活跃的打卡策略
        policy = self.attendance_repo.get_active_policy()
        if not policy:
            raise NotFoundException("打卡策略", "未找到活跃的打卡策略")
        
        # 检查请假情况
        leave_info = self.get_leave_period_for_date(user.id, today)
        
        if leave_info['full_day_leave']:
            raise ValidationException("今天全天请假，无需打卡")
        
        # 验证打卡时间是否在策略允许的范围内
        rules = self.get_policy_for_date(policy, checkout_time)
        checkout_start = datetime.strptime(rules['checkout_start_time'], "%H:%M").time()
        checkout_end = datetime.strptime(rules['checkout_end_time'], "%H:%M").time()
        
        if checkout_time_only < checkout_start or checkout_time_only > checkout_end:
            raise ValidationException(
                f"当前时间不在下班打卡时间范围内（{rules['checkout_start_time']} - {rules['checkout_end_time']}）"
            )
        
        # 判断是否早退
        early_leave = False
        if not leave_info['afternoon_leave']:
            early_leave = self.is_early_leave(checkout_time, policy)
        
        # 更新考勤记录
        attendance.checkout_time = checkout_time
        attendance.checkout_location = address or location
        attendance.checkout_latitude = latitude
        attendance.checkout_longitude = longitude
        attendance.is_early_leave = early_leave
        
        # 计算工作时长
        if attendance.checkin_time:
            attendance.work_hours = self.calculate_work_hours(
                attendance.checkin_time,
                checkout_time
            )
        
        # 更新下午状态
        if not leave_info['afternoon_leave']:
            attendance.afternoon_status = AttendanceStatus.NORMAL.value
        
        return attendance
