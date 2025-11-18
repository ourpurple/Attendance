from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List
from datetime import datetime
from .models import UserRole, LeaveStatus, OvertimeStatus


# ==================== 用户相关 ====================
class UserBase(BaseModel):
    username: str
    real_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role: UserRole = UserRole.EMPLOYEE
    department_id: Optional[int] = None
    annual_leave_days: Optional[float] = 10.0


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    real_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    department_id: Optional[int] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    annual_leave_days: Optional[float] = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    username: str
    password: str
    wechat_code: Optional[str] = None  # 微信登录code（用于绑定）


class Token(BaseModel):
    access_token: str
    token_type: str


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


class AnnualLeaveInfo(BaseModel):
    """年假使用情况"""
    total_days: float  # 总年假天数
    used_days: float  # 已使用年假天数
    remaining_days: float  # 剩余年假天数


class WechatLogin(BaseModel):
    code: str  # 微信登录code


# ==================== 部门相关 ====================
class DepartmentBase(BaseModel):
    name: str
    description: Optional[str] = None
    head_id: Optional[int] = None


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    head_id: Optional[int] = None


class DepartmentResponse(DepartmentBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# ==================== 打卡策略相关 ====================
class AttendancePolicyBase(BaseModel):
    name: str
    work_start_time: str
    work_end_time: str
    checkin_start_time: str
    checkin_end_time: str
    checkout_start_time: str
    checkout_end_time: str
    late_threshold_minutes: int = 0
    early_threshold_minutes: int = 0
    weekly_rules: Optional[str] = None
    morning_start_time: str = "09:00"
    morning_end_time: str = "12:00"
    afternoon_start_time: str = "14:00"
    afternoon_end_time: str = "17:30"
    is_active: bool = True


class AttendancePolicyCreate(AttendancePolicyBase):
    pass


class AttendancePolicyUpdate(BaseModel):
    name: Optional[str] = None
    work_start_time: Optional[str] = None
    work_end_time: Optional[str] = None
    checkin_start_time: Optional[str] = None
    checkin_end_time: Optional[str] = None
    checkout_start_time: Optional[str] = None
    checkout_end_time: Optional[str] = None
    late_threshold_minutes: Optional[int] = None
    early_threshold_minutes: Optional[int] = None
    weekly_rules: Optional[str] = None
    morning_start_time: Optional[str] = None
    morning_end_time: Optional[str] = None
    afternoon_start_time: Optional[str] = None
    afternoon_end_time: Optional[str] = None
    is_active: Optional[bool] = None


class AttendancePolicyResponse(AttendancePolicyBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# ==================== 考勤打卡相关 ====================
class AttendanceCheckin(BaseModel):
    location: str  # 坐标字符串（兼容旧版本）
    address: Optional[str] = None  # 地址文本
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    checkin_status: Optional[str] = "normal"  # 签到状态: normal/city_business/business_trip


class AttendanceCheckout(BaseModel):
    location: str  # 坐标字符串（兼容旧版本）
    address: Optional[str] = None  # 地址文本
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class LocationPoint(BaseModel):
    """地理位置点"""
    latitude: float
    longitude: float


class BatchGeocodeRequest(BaseModel):
    """批量地理编码请求"""
    locations: List[LocationPoint]


class GeocodeResult(BaseModel):
    """地理编码结果"""
    latitude: float
    longitude: float
    address: Optional[str] = None
    error: Optional[str] = None


class BatchGeocodeResponse(BaseModel):
    """批量地理编码响应"""
    results: List[GeocodeResult]


class AttendanceResponse(BaseModel):
    id: int
    user_id: int
    checkin_time: Optional[datetime] = None
    checkin_location: Optional[str] = None
    checkout_time: Optional[datetime] = None
    checkout_location: Optional[str] = None
    is_late: bool
    is_early_leave: bool
    work_hours: Optional[float] = None
    date: datetime
    checkin_status: Optional[str] = None
    morning_status: Optional[str] = None
    afternoon_status: Optional[str] = None
    morning_leave: bool = False
    afternoon_leave: bool = False
    created_at: datetime
    
    class Config:
        from_attributes = True


# ==================== 请假相关 ====================
class LeaveApplicationBase(BaseModel):
    start_date: datetime
    end_date: datetime
    days: float
    reason: str
    leave_type_id: int
    
    @validator('end_date')
    def validate_dates(cls, v, values):
        if 'start_date' in values and v < values['start_date']:
            raise ValueError('结束日期不能早于开始日期')
        return v


class LeaveApplicationCreate(LeaveApplicationBase):
    assigned_vp_id: Optional[int] = None  # 手动指定的副总审批人ID
    assigned_gm_id: Optional[int] = None  # 手动指定的总经理审批人ID


class LeaveApplicationUpdate(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    days: Optional[float] = None
    reason: Optional[str] = None
    leave_type_id: Optional[int] = None


class LeaveApplicationResponse(LeaveApplicationBase):
    id: int
    user_id: int
    applicant_name: Optional[str] = None
    leave_type_name: Optional[str] = None
    status: LeaveStatus
    assigned_vp_id: Optional[int] = None
    assigned_vp_name: Optional[str] = None
    assigned_gm_id: Optional[int] = None
    assigned_gm_name: Optional[str] = None
    dept_approver_id: Optional[int] = None
    dept_approver_name: Optional[str] = None
    dept_approved_at: Optional[datetime] = None
    dept_comment: Optional[str] = None
    vp_approver_id: Optional[int] = None
    vp_approver_name: Optional[str] = None
    vp_approved_at: Optional[datetime] = None
    vp_comment: Optional[str] = None
    gm_approver_id: Optional[int] = None
    gm_approver_name: Optional[str] = None
    gm_approved_at: Optional[datetime] = None
    gm_comment: Optional[str] = None
    # 待审批人姓名（用于pending状态的申请）
    pending_dept_head_name: Optional[str] = None
    pending_vp_name: Optional[str] = None
    pending_gm_name: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class LeaveApproval(BaseModel):
    comment: Optional[str] = None
    approved: bool


class LeaveTypeBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True


class LeaveTypeCreate(LeaveTypeBase):
    pass


class LeaveTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class LeaveTypeResponse(LeaveTypeBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ==================== 加班相关 ====================
class OvertimeApplicationBase(BaseModel):
    start_time: datetime
    end_time: datetime
    hours: float
    days: float
    reason: str
    
    @validator('end_time')
    def validate_times(cls, v, values):
        if 'start_time' in values and v < values['start_time']:
            raise ValueError('结束时间不能早于开始时间')
        return v
    
    @validator('days')
    def validate_days(cls, v):
        # 验证天数只能是整数或 x.5
        if v <= 0:
            raise ValueError('加班天数必须大于0')
        # 检查是否是整数或 x.5
        if v % 0.5 != 0:
            raise ValueError('加班天数只能是整数或整数.5（如1, 1.5, 2, 2.5）')
        return v


class OvertimeApplicationCreate(OvertimeApplicationBase):
    assigned_approver_id: Optional[int] = None  # 手动指定的审批人ID


class OvertimeApplicationUpdate(BaseModel):
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    hours: Optional[float] = None
    days: Optional[float] = None
    reason: Optional[str] = None


class OvertimeApplicationResponse(OvertimeApplicationBase):
    id: int
    user_id: int
    applicant_name: Optional[str] = None
    status: OvertimeStatus
    assigned_approver_id: Optional[int] = None
    assigned_approver_name: Optional[str] = None
    approver_id: Optional[int] = None
    approver_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    comment: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class OvertimeApproval(BaseModel):
    comment: Optional[str] = None
    approved: bool


# ==================== 统计相关 ====================
class LeaveTypeSummary(BaseModel):
    leave_type_id: int
    leave_type_name: str
    total_days: float = 0.0
    total_count: int = 0


class AttendanceStatistics(BaseModel):
    user_id: int
    user_name: str
    department: Optional[str] = None
    total_days: int
    present_days: int
    late_days: int
    early_leave_days: int
    absence_days: int
    leave_days: float
    leave_count: int = 0
    overtime_days: float
    overtime_count: int = 0
    work_hours: float
    leave_type_breakdown: List[LeaveTypeSummary] = []


class PeriodStatistics(BaseModel):
    start_date: datetime
    end_date: datetime
    total_users: int
    attendance_rate: float
    total_leave_days: float
    total_overtime_days: float
    leave_type_summary: List[LeaveTypeSummary] = []


# ==================== 节假日相关 ====================
class HolidayBase(BaseModel):
    date: str  # YYYY-MM-DD格式
    name: str
    type: str  # holiday=休息日(法定节假日), workday=调休工作日, company_holiday=休息日(公司节假日)
    description: Optional[str] = None


class HolidayBatchCreate(BaseModel):
    """批量创建节假日（日期范围）"""
    start_date: str  # YYYY-MM-DD格式
    end_date: str  # YYYY-MM-DD格式
    name: str
    type: str
    description: Optional[str] = None


class HolidayCreate(HolidayBase):
    pass


class HolidayUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None


class Holiday(HolidayBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class WorkdayCheck(BaseModel):
    """工作日检查响应"""
    date: str
    is_workday: bool
    reason: str  # "周末" / "法定节假日" / "调休工作日" / "正常工作日"
    holiday_name: Optional[str] = None


# ==================== 副总分管部门相关 ====================
class VicePresidentDepartmentBase(BaseModel):
    vice_president_id: int
    department_id: int
    is_default: bool = False


class VicePresidentDepartmentCreate(VicePresidentDepartmentBase):
    pass


class VicePresidentDepartmentUpdate(BaseModel):
    is_default: Optional[bool] = None


class VicePresidentDepartmentResponse(VicePresidentDepartmentBase):
    id: int
    vice_president_name: Optional[str] = None
    department_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ==================== 出勤情况查看授权相关 ====================
class AttendanceViewerBase(BaseModel):
    user_id: int


class AttendanceViewerCreate(AttendanceViewerBase):
    pass


class AttendanceViewerResponse(AttendanceViewerBase):
    id: int
    user_name: Optional[str] = None
    user_real_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ==================== 出勤情况概览相关 ====================
class AttendanceOverviewItem(BaseModel):
    """单个员工的出勤情况"""
    user_id: int
    user_name: str
    real_name: str
    role: Optional[UserRole] = None
    department_name: Optional[str] = None
    leave_start_date: Optional[str] = None
    leave_end_date: Optional[str] = None
    checkin_time: Optional[datetime] = None
    checkout_time: Optional[datetime] = None
    is_late: bool = False
    is_early_leave: bool = False
    work_hours: Optional[float] = None
    has_leave: bool = False
    leave_days: float = 0.0
    has_overtime: bool = False
    overtime_days: float = 0.0
    overtime_start_time: Optional[datetime] = None
    overtime_end_time: Optional[datetime] = None


class AttendanceOverviewResponse(BaseModel):
    """出勤情况概览"""
    date: str  # YYYY-MM-DD
    items: List[AttendanceOverviewItem]
    total_users: int
    checked_in_count: int
    on_leave_count: int
    on_overtime_count: int
    is_workday: bool
    workday_reason: Optional[str] = None


# ==================== 打卡状态配置相关 ====================
class CheckinStatusConfigBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


class CheckinStatusConfigCreate(CheckinStatusConfigBase):
    pass


class CheckinStatusConfigUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class CheckinStatusConfigResponse(CheckinStatusConfigBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ==================== 请假状态相关 ====================
class LeaveStatusResponse(BaseModel):
    """当天请假状态"""
    has_leave: bool
    morning_leave: bool
    afternoon_leave: bool
    full_day_leave: bool


# ==================== 每日上下午统计相关 ====================
class DailyAttendanceItem(BaseModel):
    """每日上下午考勤记录项"""
    date: str  # YYYY-MM-DD
    weekday: str  # 星期几（一、二、三...）
    morning_status: Optional[str] = None  # 上午状态: normal/city_business/business_trip/leave/absent
    afternoon_status: Optional[str] = None  # 下午状态: normal/city_business/business_trip/leave/absent


class DailyAttendanceStatistics(BaseModel):
    """用户每日上下午考勤统计"""
    user_id: int
    user_name: str
    real_name: str
    department: Optional[str] = None
    items: List[DailyAttendanceItem]  # 每日记录，只包含工作日


class DailyAttendanceStatisticsResponse(BaseModel):
    """每日上下午考勤统计响应"""
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    statistics: List[DailyAttendanceStatistics]


