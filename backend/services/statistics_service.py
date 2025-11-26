"""
统计服务
封装统计相关的业务逻辑
"""
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, date
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_

from ..models import (
    User, Attendance, LeaveApplication, OvertimeApplication,
    UserRole, LeaveStatus, OvertimeStatus, Holiday, LeaveType,
    AttendanceStatus, OvertimeType
)
from ..repositories import UserRepository, LeaveRepository, OvertimeRepository
from ..exceptions import PermissionDeniedException, ValidationException
from ..schemas import (
    AttendanceStatistics, PeriodStatistics, LeaveApplicationResponse,
    OvertimeApplicationResponse, DailyAttendanceStatisticsResponse,
    DailyAttendanceStatistics, DailyAttendanceItem
)


class StatisticsService:
    """统计服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)
        self.leave_repo = LeaveRepository(db)
        self.overtime_repo = OvertimeRepository(db)
    
    def calculate_workdays(self, start_date: date, end_date: date) -> int:
        """
        计算日期范围内的工作日天数
        - 排除周末（周六、周日）
        - 排除法定节假日
        - 包含调休工作日
        """
        # 获取日期范围内的所有节假日配置
        holidays_config = self.db.query(Holiday).filter(
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
    
    def is_workday(self, target_date: date) -> bool:
        """判断指定日期是否为工作日"""
        date_str = target_date.isoformat()
        holiday = self.db.query(Holiday).filter(Holiday.date == date_str).first()
        
        if holiday:
            if holiday.type == "workday":
                return True
            elif holiday.type in ["holiday", "company_holiday"]:
                return False
        
        weekday = target_date.weekday()
        return weekday < 5  # 周一到周五
    
    def get_weekday_name(self, target_date: date) -> str:
        """获取星期几的中文名称"""
        weekday_names = ["一", "二", "三", "四", "五", "六", "日"]
        return weekday_names[target_date.weekday()]
    
    def get_attendance_statistics(
        self,
        start_date: date,
        end_date: date,
        current_user: User,
        department_id: Optional[int] = None
    ) -> List[AttendanceStatistics]:
        """获取考勤统计（按用户）"""
        # 权限检查
        if current_user.role not in [
            UserRole.ADMIN, UserRole.DEPARTMENT_HEAD,
            UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER
        ]:
            raise PermissionDeniedException("无权查看统计数据")
        
        # 构建查询（排除admin账户、禁用考勤的员工）
        query = self.db.query(User).filter(
            User.username != "admin",
            User.enable_attendance == True
        )
        
        # 如果是部门主任，只能查看本部门
        if current_user.role == UserRole.DEPARTMENT_HEAD:
            query = query.filter(User.department_id == current_user.department_id)
        elif department_id:
            query = query.filter(User.department_id == department_id)
        
        users = query.all()
        
        # 计算日期范围内的实际工作日天数
        total_days = self.calculate_workdays(start_date, end_date)
        
        leave_types = self.db.query(LeaveType).filter(LeaveType.is_active == True).all()
        leave_type_map = {lt.id: lt.name for lt in leave_types}
        
        statistics = []
        for user in users:
            # 获取考勤记录
            attendances = self.db.query(Attendance).filter(
                and_(
                    Attendance.user_id == user.id,
                    func.date(Attendance.date) >= start_date,
                    func.date(Attendance.date) <= end_date
                )
            ).all()
            
            # 获取请假记录
            leaves = self.db.query(LeaveApplication).options(
                joinedload(LeaveApplication.leave_type)
            ).filter(
                and_(
                    LeaveApplication.user_id == user.id,
                    LeaveApplication.status == LeaveStatus.APPROVED,
                    LeaveApplication.start_date <= datetime.combine(end_date, datetime.max.time()),
                    LeaveApplication.end_date >= datetime.combine(start_date, datetime.min.time())
                )
            ).all()
            
            # 获取加班记录
            overtimes = self.db.query(OvertimeApplication).filter(
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
            leave_count = len(leaves)
            
            # 按请假类型统计
            leave_type_totals = {}
            for leave in leaves:
                lt_id = leave.leave_type_id if hasattr(leave, "leave_type_id") else None
                if lt_id:
                    if lt_id not in leave_type_totals:
                        leave_type_totals[lt_id] = {
                            "leave_type_id": lt_id,
                            "leave_type_name": leave_type_map.get(lt_id, "未分类"),
                            "total_days": 0.0,
                            "total_count": 0
                        }
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
    
    def get_period_statistics(
        self,
        start_date: date,
        end_date: date
    ) -> PeriodStatistics:
        """获取周期统计（管理员）"""
        # 总用户数 = 激活的系统用户数 - 1（admin账户）
        all_users = self.db.query(User).all()
        
        # 统计激活且开启考勤的用户（排除admin）
        enabled_users = [
            user for user in all_users
            if user.is_active
            and user.username != "admin"
            and (user.enable_attendance is None or user.enable_attendance is True)
        ]
        total_users = len(enabled_users)
        enabled_user_ids = [user.id for user in enabled_users]
        
        # 计算实际工作日天数
        total_days = self.calculate_workdays(start_date, end_date)
        
        # 应出勤次数
        expected_attendance = total_users * total_days
        
        # 实际出勤次数
        if enabled_user_ids:
            actual_attendance = self.db.query(Attendance).filter(
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
        
        # 总请假天数
        if enabled_user_ids:
            leaves = self.db.query(LeaveApplication).options(
                joinedload(LeaveApplication.leave_type)
            ).filter(
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
        
        # 总加班天数
        if enabled_user_ids:
            overtimes = self.db.query(OvertimeApplication).filter(
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
        
        # 按请假类型统计
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
    
    def get_my_statistics(
        self,
        start_date: date,
        end_date: date,
        current_user: User
    ) -> AttendanceStatistics:
        """获取我的统计数据"""
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
                work_hours=0.0,
                leave_type_breakdown=[]
            )
        
        # 计算日期范围内的实际工作日天数
        total_days = self.calculate_workdays(start_date, end_date)
        
        # 获取考勤记录
        attendances = self.db.query(Attendance).filter(
            and_(
                Attendance.user_id == current_user.id,
                func.date(Attendance.date) >= start_date,
                func.date(Attendance.date) <= end_date
            )
        ).all()
        
        # 获取请假记录
        leaves = self.db.query(LeaveApplication).options(
            joinedload(LeaveApplication.leave_type)
        ).filter(
            and_(
                LeaveApplication.user_id == current_user.id,
                LeaveApplication.status == LeaveStatus.APPROVED,
                LeaveApplication.start_date <= datetime.combine(end_date, datetime.max.time()),
                LeaveApplication.end_date >= datetime.combine(start_date, datetime.min.time())
            )
        ).all()
        
        # 获取加班记录
        overtimes = self.db.query(OvertimeApplication).filter(
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
        leave_count = len(leaves)
        
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
            work_hours=work_hours
        )
    
    def get_user_leave_details(
        self,
        user_id: int,
        start_date: date,
        end_date: date,
        current_user: User
    ) -> List[LeaveApplicationResponse]:
        """获取指定用户的请假明细（只返回已批准的）"""
        from ..utils.response_utils import ResponseUtils
        
        # 权限检查
        if current_user.role not in [
            UserRole.ADMIN, UserRole.DEPARTMENT_HEAD,
            UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER
        ]:
            raise PermissionDeniedException("无权查看此用户的请假明细")
        
        # 如果是部门主任，只能查看本部门
        if current_user.role == UserRole.DEPARTMENT_HEAD:
            user = self.user_repo.get(user_id)
            if not user or user.department_id != current_user.department_id:
                raise PermissionDeniedException("无权查看此用户的请假明细")
        
        # 获取已批准的请假记录
        leaves = self.db.query(LeaveApplication).options(
            joinedload(LeaveApplication.leave_type)
        ).filter(
            and_(
                LeaveApplication.user_id == user_id,
                LeaveApplication.status == LeaveStatus.APPROVED,
                LeaveApplication.start_date <= datetime.combine(end_date, datetime.max.time()),
                LeaveApplication.end_date >= datetime.combine(start_date, datetime.min.time())
            )
        ).order_by(LeaveApplication.start_date.desc()).all()
        
        return [ResponseUtils.to_leave_response(leave) for leave in leaves]
    
    def get_user_overtime_details(
        self,
        user_id: int,
        start_date: date,
        end_date: date,
        current_user: User
    ) -> List[OvertimeApplicationResponse]:
        """获取指定用户的加班明细（只返回已批准的）"""
        # 权限检查
        if current_user.role not in [
            UserRole.ADMIN, UserRole.DEPARTMENT_HEAD,
            UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER
        ]:
            raise PermissionDeniedException("无权查看此用户的加班明细")
        
        # 如果是部门主任，只能查看本部门
        if current_user.role == UserRole.DEPARTMENT_HEAD:
            user = self.user_repo.get(user_id)
            if not user or user.department_id != current_user.department_id:
                raise PermissionDeniedException("无权查看此用户的加班明细")
        
        # 获取已批准的加班记录
        overtimes = self.db.query(OvertimeApplication).filter(
            and_(
                OvertimeApplication.user_id == user_id,
                OvertimeApplication.status == OvertimeStatus.APPROVED,
                func.date(OvertimeApplication.start_time) <= end_date,
                func.date(OvertimeApplication.start_time) >= start_date
            )
        ).order_by(OvertimeApplication.start_time.desc()).all()
        
        return overtimes
    
    def get_leave_period_for_date(self, user_id: int, target_date: date) -> Dict[str, bool]:
        """
        获取指定用户在指定日期的请假时段
        
        Args:
            user_id: 用户ID
            target_date: 目标日期
            
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
        target_datetime_start = datetime.combine(target_date, datetime.min.time())
        target_datetime_end = datetime.combine(target_date, datetime.max.time())
        
        leaves = self.db.query(LeaveApplication).filter(
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
    
    def get_daily_attendance_statistics(
        self,
        start_date: date,
        end_date: date,
        current_user: User,
        department_id: Optional[int] = None
    ) -> DailyAttendanceStatisticsResponse:
        """获取每日上下午考勤详细统计（只统计工作日）"""
        # 权限检查
        if current_user.role not in [
            UserRole.ADMIN, UserRole.DEPARTMENT_HEAD,
            UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER
        ]:
            raise PermissionDeniedException("无权查看每日考勤统计")
        
        # 构建查询（排除admin账户、排除关闭考勤管理的用户）
        query = self.db.query(User).filter(
            User.username != "admin",
            User.is_active == True,
            User.enable_attendance == True
        )
        
        # 如果是部门主任，只能查看本部门
        if current_user.role == UserRole.DEPARTMENT_HEAD:
            query = query.filter(User.department_id == current_user.department_id)
        elif department_id:
            query = query.filter(User.department_id == department_id)
        
        users = query.all()
        
        # 获取所有工作日
        workdays = []
        current_date = start_date
        while current_date <= end_date:
            if self.is_workday(current_date):
                workdays.append(current_date)
            current_date += timedelta(days=1)
        
        # 获取所有考勤记录
        attendances = self.db.query(Attendance).filter(
            and_(
                func.date(Attendance.date) >= start_date,
                func.date(Attendance.date) <= end_date
            )
        ).all()
        
        # 构建考勤记录字典 {(user_id, date): attendance}
        attendance_dict = {}
        for att in attendances:
            att_date = att.date.date() if isinstance(att.date, datetime) else att.date
            key = (att.user_id, att_date)
            attendance_dict[key] = att
        
        # 构建统计结果
        statistics_list = []
        
        for user in users:
            items = []
            
            for workday in workdays:
                # 获取该日期的考勤记录
                att = attendance_dict.get((user.id, workday))
                
                # 获取请假信息
                leave_info = self.get_leave_period_for_date(user.id, workday)
                
                # 确定上午状态（优先级：请假 > 打卡记录 > 缺勤）
                morning_status = None
                if leave_info['morning_leave'] or leave_info['full_day_leave']:
                    morning_status = AttendanceStatus.LEAVE.value
                elif att and att.morning_status:
                    morning_status = att.morning_status
                elif att and att.checkin_time:
                    # 如果有打卡记录但没有设置morning_status，使用checkin_status
                    checkin_time_only = att.checkin_time.time() if att.checkin_time else None
                    if checkin_time_only and (checkin_time_only.hour < 14 or (checkin_time_only.hour == 14 and checkin_time_only.minute < 10)):
                        morning_status = att.checkin_status or AttendanceStatus.NORMAL.value
                    else:
                        morning_status = AttendanceStatus.ABSENT.value
                else:
                    morning_status = AttendanceStatus.ABSENT.value
                
                # 确定下午状态（优先级：请假 > 打卡记录 > 缺勤）
                afternoon_status = None
                if leave_info['afternoon_leave'] or leave_info['full_day_leave']:
                    afternoon_status = AttendanceStatus.LEAVE.value
                elif att and att.afternoon_status:
                    afternoon_status = att.afternoon_status
                elif att and att.checkout_time:
                    # 如果有签退记录但没有设置afternoon_status，使用checkin_status
                    afternoon_status = att.checkin_status or AttendanceStatus.NORMAL.value
                else:
                    afternoon_status = AttendanceStatus.ABSENT.value
                
                items.append(DailyAttendanceItem(
                    date=workday.isoformat(),
                    weekday=self.get_weekday_name(workday),
                    morning_status=morning_status,
                    afternoon_status=afternoon_status,
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

