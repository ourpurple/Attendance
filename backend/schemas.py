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
    created_at: datetime
    
    class Config:
        from_attributes = True


# ==================== 请假相关 ====================
class LeaveApplicationBase(BaseModel):
    start_date: datetime
    end_date: datetime
    days: float
    reason: str
    
    @validator('end_date')
    def validate_dates(cls, v, values):
        if 'start_date' in values and v < values['start_date']:
            raise ValueError('结束日期不能早于开始日期')
        return v


class LeaveApplicationCreate(LeaveApplicationBase):
    pass


class LeaveApplicationUpdate(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    days: Optional[float] = None
    reason: Optional[str] = None


class LeaveApplicationResponse(LeaveApplicationBase):
    id: int
    user_id: int
    applicant_name: Optional[str] = None
    status: LeaveStatus
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
    created_at: datetime
    
    class Config:
        from_attributes = True


class LeaveApproval(BaseModel):
    comment: Optional[str] = None
    approved: bool


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
    pass


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


class PeriodStatistics(BaseModel):
    start_date: datetime
    end_date: datetime
    total_users: int
    attendance_rate: float
    total_leave_days: float
    total_overtime_days: float


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


