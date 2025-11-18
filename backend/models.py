from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .database import Base


class UserRole(str, enum.Enum):
    """用户角色"""
    EMPLOYEE = "employee"  # 普通员工
    DEPARTMENT_HEAD = "department_head"  # 部门主任
    VICE_PRESIDENT = "vice_president"  # 副总
    GENERAL_MANAGER = "general_manager"  # 总经理
    ADMIN = "admin"  # 系统管理员


class LeaveStatus(str, enum.Enum):
    """请假状态"""
    PENDING = "pending"  # 待审批
    DEPT_APPROVED = "dept_approved"  # 部门主任已批准
    VP_APPROVED = "vp_approved"  # 副总已批准
    APPROVED = "approved"  # 已批准
    REJECTED = "rejected"  # 已拒绝
    CANCELLED = "cancelled"  # 已取消


class OvertimeStatus(str, enum.Enum):
    """加班状态"""
    PENDING = "pending"  # 待审批
    APPROVED = "approved"  # 已批准
    REJECTED = "rejected"  # 已拒绝
    CANCELLED = "cancelled"  # 已取消


class Department(Base):
    """部门表"""
    __tablename__ = "departments"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, comment="部门名称")
    description = Column(Text, comment="部门描述")
    head_id = Column(Integer, ForeignKey("users.id"), comment="部门主任ID")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    users = relationship("User", back_populates="department", foreign_keys="User.department_id")
    head = relationship("User", foreign_keys=[head_id], post_update=True)


class User(Base):
    """用户表"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True, comment="用户名")
    password_hash = Column(String(255), nullable=False, comment="密码哈希")
    real_name = Column(String(50), nullable=False, comment="真实姓名")
    email = Column(String(100), unique=True, comment="邮箱")
    phone = Column(String(20), comment="手机号")
    role = Column(SQLEnum(UserRole), default=UserRole.EMPLOYEE, comment="角色")
    department_id = Column(Integer, ForeignKey("departments.id"), comment="部门ID")
    is_active = Column(Boolean, default=True, comment="是否激活")
    wechat_openid = Column(String(128), unique=True, nullable=True, index=True, comment="微信OpenID")
    annual_leave_days = Column(Float, default=10.0, comment="年假天数")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    department = relationship("Department", back_populates="users", foreign_keys=[department_id])
    attendances = relationship("Attendance", back_populates="user")
    leave_applications = relationship("LeaveApplication", back_populates="user", foreign_keys="LeaveApplication.user_id")
    overtime_applications = relationship("OvertimeApplication", back_populates="user", foreign_keys="OvertimeApplication.user_id")


class AttendancePolicy(Base):
    """打卡策略表"""
    __tablename__ = "attendance_policies"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, comment="策略名称")
    work_start_time = Column(String(5), nullable=False, comment="默认上班时间 HH:MM")
    work_end_time = Column(String(5), nullable=False, comment="默认下班时间 HH:MM")
    checkin_start_time = Column(String(5), nullable=False, comment="默认上班打卡开始时间 HH:MM")
    checkin_end_time = Column(String(5), nullable=False, comment="默认上班打卡结束时间 HH:MM")
    checkout_start_time = Column(String(5), nullable=False, comment="默认下班打卡开始时间 HH:MM")
    checkout_end_time = Column(String(5), nullable=False, comment="默认下班打卡结束时间 HH:MM")
    late_threshold_minutes = Column(Integer, default=0, comment="默认迟到阈值（分钟）")
    early_threshold_minutes = Column(Integer, default=0, comment="默认早退阈值（分钟）")
    weekly_rules = Column(Text, comment="每周特殊规则JSON: {0-6: {work_end_time, checkout_start_time, ...}}")
    # 上下午工作时间配置
    morning_start_time = Column(String(5), default="09:00", comment="上午上班时间 HH:MM")
    morning_end_time = Column(String(5), default="12:00", comment="上午下班时间 HH:MM")
    afternoon_start_time = Column(String(5), default="14:00", comment="下午上班时间 HH:MM")
    afternoon_end_time = Column(String(5), default="17:30", comment="下午下班时间 HH:MM")
    is_active = Column(Boolean, default=True, comment="是否启用")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class AttendanceStatus(str, enum.Enum):
    """考勤状态枚举"""
    NORMAL = "normal"  # 正常签到
    CITY_BUSINESS = "city_business"  # 市区办事
    BUSINESS_TRIP = "business_trip"  # 出差
    LEAVE = "leave"  # 请假
    ABSENT = "absent"  # 缺勤


class Attendance(Base):
    """考勤打卡表"""
    __tablename__ = "attendances"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    checkin_time = Column(DateTime, comment="上班打卡时间")
    checkin_location = Column(String(255), comment="上班打卡地点")
    checkin_latitude = Column(Float, comment="上班打卡纬度")
    checkin_longitude = Column(Float, comment="上班打卡经度")
    checkout_time = Column(DateTime, comment="下班打卡时间")
    checkout_location = Column(String(255), comment="下班打卡地点")
    checkout_latitude = Column(Float, comment="下班打卡纬度")
    checkout_longitude = Column(Float, comment="下班打卡经度")
    is_late = Column(Boolean, default=False, comment="是否迟到")
    is_early_leave = Column(Boolean, default=False, comment="是否早退")
    work_hours = Column(Float, comment="工作时长（小时）")
    date = Column(DateTime, nullable=False, index=True, comment="考勤日期")
    # 新增字段
    checkin_status = Column(String(20), default=AttendanceStatus.NORMAL.value, comment="签到状态: normal/city_business/business_trip")
    morning_status = Column(String(20), comment="上午状态: normal/city_business/business_trip/leave/absent")
    afternoon_status = Column(String(20), comment="下午状态: normal/city_business/business_trip/leave/absent")
    morning_leave = Column(Boolean, default=False, comment="是否上午请假")
    afternoon_leave = Column(Boolean, default=False, comment="是否下午请假")
    created_at = Column(DateTime, default=datetime.now)
    
    # 关系
    user = relationship("User", back_populates="attendances")


class LeavePolicy(Base):
    """请假策略表"""
    __tablename__ = "leave_policies"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, comment="策略名称")
    description = Column(Text, comment="策略描述")
    is_active = Column(Boolean, default=True, comment="是否启用")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class LeaveType(Base):
    """请假类型表"""
    __tablename__ = "leave_types"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, comment="类型名称")
    description = Column(Text, comment="类型说明")
    is_active = Column(Boolean, default=True, comment="是否启用")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    applications = relationship("LeaveApplication", back_populates="leave_type")


class LeaveApplication(Base):
    """请假申请表"""
    __tablename__ = "leave_applications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_date = Column(DateTime, nullable=False, comment="请假开始日期")
    end_date = Column(DateTime, nullable=False, comment="请假结束日期")
    days = Column(Float, nullable=False, comment="请假天数")
    reason = Column(Text, nullable=False, comment="请假原因")
    status = Column(String(20), default=LeaveStatus.PENDING.value, comment="审批状态")
    assigned_vp_id = Column(Integer, ForeignKey("users.id"), comment="手动指定的副总审批人ID")
    assigned_gm_id = Column(Integer, ForeignKey("users.id"), comment="手动指定的总经理审批人ID")
    dept_approver_id = Column(Integer, ForeignKey("users.id"), comment="部门主任审批人ID")
    dept_approved_at = Column(DateTime, comment="部门主任审批时间")
    dept_comment = Column(Text, comment="部门主任审批意见")
    vp_approver_id = Column(Integer, ForeignKey("users.id"), comment="副总审批人ID")
    vp_approved_at = Column(DateTime, comment="副总审批时间")
    vp_comment = Column(Text, comment="副总审批意见")
    gm_approver_id = Column(Integer, ForeignKey("users.id"), comment="总经理审批人ID")
    gm_approved_at = Column(DateTime, comment="总经理审批时间")
    gm_comment = Column(Text, comment="总经理审批意见")
    leave_type_id = Column(Integer, ForeignKey("leave_types.id"), nullable=False, comment="请假类型ID")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    user = relationship("User", back_populates="leave_applications", foreign_keys=[user_id])
    assigned_vp = relationship("User", foreign_keys=[assigned_vp_id], post_update=True)
    assigned_gm = relationship("User", foreign_keys=[assigned_gm_id], post_update=True)
    dept_approver = relationship("User", foreign_keys=[dept_approver_id], post_update=True)
    vp_approver = relationship("User", foreign_keys=[vp_approver_id], post_update=True)
    gm_approver = relationship("User", foreign_keys=[gm_approver_id], post_update=True)
    leave_type = relationship("LeaveType", back_populates="applications")


class OvertimeApplication(Base):
    """加班申请表"""
    __tablename__ = "overtime_applications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_time = Column(DateTime, nullable=False, comment="加班开始时间")
    end_time = Column(DateTime, nullable=False, comment="加班结束时间")
    hours = Column(Float, nullable=False, comment="加班时长（小时）")
    days = Column(Float, nullable=False, default=0.5, comment="加班天数")
    reason = Column(Text, nullable=False, comment="加班原因")
    status = Column(String(20), default=OvertimeStatus.PENDING.value, comment="审批状态")
    assigned_approver_id = Column(Integer, ForeignKey("users.id"), comment="手动指定的审批人ID")
    approver_id = Column(Integer, ForeignKey("users.id"), comment="审批人ID")
    approved_at = Column(DateTime, comment="审批时间")
    comment = Column(Text, comment="审批意见")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    user = relationship("User", back_populates="overtime_applications", foreign_keys=[user_id])
    assigned_approver = relationship("User", foreign_keys=[assigned_approver_id], post_update=True)
    approver = relationship("User", foreign_keys=[approver_id], post_update=True)


class HolidayType(str, enum.Enum):
    """节假日类型"""
    HOLIDAY = "holiday"  # 法定节假日（休息）
    WORKDAY = "workday"  # 调休工作日（上班）
    COMPANY_HOLIDAY = "company_holiday"  # 公司节假日（休息）


class Holiday(Base):
    """节假日配置表"""
    __tablename__ = "holidays"
    
    id = Column(Integer, primary_key=True, index=True)
    date = Column(String(10), unique=True, nullable=False, index=True, comment="日期 YYYY-MM-DD")
    name = Column(String(100), nullable=False, comment="节假日名称")
    type = Column(String(20), nullable=False, comment="类型: holiday=休息日(法定节假日), workday=调休工作日, company_holiday=休息日(公司节假日)")
    description = Column(Text, comment="描述")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class VicePresidentDepartment(Base):
    """副总分管部门表"""
    __tablename__ = "vice_president_departments"
    
    id = Column(Integer, primary_key=True, index=True)
    vice_president_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="副总用户ID")
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False, comment="分管部门ID")
    is_default = Column(Boolean, default=False, comment="是否为默认分管（一个部门可以有多个副总，但只有一个默认）")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    vice_president = relationship("User", foreign_keys=[vice_president_id], post_update=True)
    department = relationship("Department", foreign_keys=[department_id], post_update=True)
    
    # 唯一约束：同一个副总不能重复分管同一个部门
    __table_args__ = (
        {"sqlite_autoincrement": True},
    )


class AttendanceViewer(Base):
    """出勤情况查看授权人员表"""
    __tablename__ = "attendance_viewers"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, comment="授权用户ID")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    user = relationship("User", foreign_keys=[user_id], post_update=True)


class CheckinStatusConfig(Base):
    """打卡状态配置表"""
    __tablename__ = "checkin_status_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, comment="状态名称")
    code = Column(String(20), unique=True, nullable=False, comment="状态代码")
    description = Column(Text, comment="状态描述")
    is_active = Column(Boolean, default=True, comment="是否启用")
    sort_order = Column(Integer, default=0, comment="排序顺序")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


