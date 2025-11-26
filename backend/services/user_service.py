"""
用户服务
封装用户相关的业务逻辑
"""
from typing import Optional, List, Dict
from sqlalchemy.orm import Session

from ..models import User, UserRole
from ..repositories import UserRepository
from ..exceptions import NotFoundException, ValidationException, ConflictException, PermissionDeniedException
from ..utils.transaction import transaction
from ..security import get_password_hash, verify_password


class UserService:
    """用户服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)
    
    def get_user(self, user_id: int) -> User:
        """获取用户"""
        user = self.user_repo.get(user_id)
        if not user:
            raise NotFoundException("用户", user_id)
        return user
    
    def get_user_by_username(self, username: str) -> Optional[User]:
        """根据用户名获取用户"""
        return self.user_repo.get_by_username(username)
    
    def get_user_by_wechat_openid(self, openid: str) -> Optional[User]:
        """根据微信OpenID获取用户"""
        return self.user_repo.get_by_wechat_openid(openid)
    
    def get_all_users(
        self,
        skip: int = 0,
        limit: int = 100,
        department_id: Optional[int] = None,
        role: Optional[UserRole] = None
    ) -> List[User]:
        """获取用户列表"""
        filters = {}
        if department_id:
            filters['department_id'] = department_id
        if role:
            filters['role'] = role
        
        return self.user_repo.get_all(skip, limit, filters)
    
    @transaction
    def create_user(
        self,
        username: str,
        password: str,
        real_name: str,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        role: UserRole = UserRole.EMPLOYEE,
        department_id: Optional[int] = None,
        annual_leave_days: float = 10.0,
        enable_attendance: bool = True
    ) -> User:
        """创建用户"""
        # 检查用户名是否已存在
        if self.user_repo.get_by_username(username):
            raise ConflictException(f"用户名 {username} 已存在")
        
        # 检查邮箱是否已存在
        if email and self.user_repo.get_by_email(email):
            raise ConflictException(f"邮箱 {email} 已被使用")
        
        # 创建用户
        user = self.user_repo.create(
            username=username,
            password_hash=get_password_hash(password),
            real_name=real_name,
            email=email,
            phone=phone,
            role=role,
            department_id=department_id,
            annual_leave_days=annual_leave_days,
            enable_attendance=enable_attendance
        )
        
        return user
    
    @transaction
    def update_user(
        self,
        user_id: int,
        real_name: Optional[str] = None,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        role: Optional[UserRole] = None,
        department_id: Optional[int] = None,
        is_active: Optional[bool] = None,
        password: Optional[str] = None,
        annual_leave_days: Optional[float] = None,
        enable_attendance: Optional[bool] = None
    ) -> User:
        """更新用户"""
        user = self.get_user(user_id)
        
        update_data = {}
        if real_name is not None:
            update_data['real_name'] = real_name
        if email is not None:
            # 检查邮箱是否被其他用户使用
            existing_user = self.user_repo.get_by_email(email)
            if existing_user and existing_user.id != user_id:
                raise ConflictException(f"邮箱 {email} 已被使用")
            update_data['email'] = email
        if phone is not None:
            update_data['phone'] = phone
        if role is not None:
            update_data['role'] = role
        if department_id is not None:
            update_data['department_id'] = department_id
        if is_active is not None:
            update_data['is_active'] = is_active
        if password is not None:
            update_data['password_hash'] = get_password_hash(password)
        if annual_leave_days is not None:
            update_data['annual_leave_days'] = annual_leave_days
        if enable_attendance is not None:
            update_data['enable_attendance'] = enable_attendance
        
        return self.user_repo.update(user_id, **update_data)
    
    @transaction
    def delete_user(self, user_id: int, current_user_id: int) -> None:
        """删除用户"""
        if user_id == current_user_id:
            raise ValidationException("不能删除自己")
        
        user = self.get_user(user_id)
        
        # 检查是否有关联数据
        if self.user_repo.has_attendance_records(user_id):
            raise ValidationException("该用户有考勤记录，无法删除")
        
        if self.user_repo.has_leave_applications(user_id):
            raise ValidationException("该用户有请假记录，无法删除")
        
        if self.user_repo.has_overtime_applications(user_id):
            raise ValidationException("该用户有加班记录，无法删除")
        
        self.user_repo.delete(user_id)
    
    @transaction
    def bind_wechat_openid(self, user_id: int, openid: str) -> User:
        """绑定微信OpenID"""
        user = self.get_user(user_id)
        
        # 检查该openid是否已被其他用户绑定
        existing_user = self.user_repo.get_by_wechat_openid(openid)
        if existing_user and existing_user.id != user_id:
            raise ConflictException(
                f"该微信账号已被用户「{existing_user.real_name}({existing_user.username})」绑定"
            )
        
        user.wechat_openid = openid
        return user
    
    @transaction
    def change_password(self, user_id: int, old_password: str, new_password: str) -> None:
        """修改用户密码"""
        user = self.get_user(user_id)
        
        # 验证旧密码
        if not verify_password(old_password, user.password_hash):
            raise ValidationException("原密码错误")
        
        # 验证新密码长度
        if len(new_password) < 6:
            raise ValidationException("新密码长度至少为6位")
        
        # 更新密码
        user.password_hash = get_password_hash(new_password)
    
    def get_approvers(self) -> List[User]:
        """获取可用的审批人列表（所有登录用户可访问）"""
        return self.user_repo.get_by_roles([
            UserRole.DEPARTMENT_HEAD,
            UserRole.VICE_PRESIDENT,
            UserRole.GENERAL_MANAGER
        ])
    
    def get_annual_leave_info(self, user_id: int) -> Dict[str, float]:
        """获取用户的年假使用情况"""
        from ..models import LeaveType, LeaveStatus
        from sqlalchemy import func
        
        user = self.get_user(user_id)
        
        # 获取总年假天数
        total_days = user.annual_leave_days or 10.0
        
        # 获取"年假调休"类型的ID
        annual_leave_type = self.db.query(LeaveType).filter(
            LeaveType.name == "年假调休",
            LeaveType.is_active == True
        ).first()
        
        if not annual_leave_type:
            return {
                "total_days": total_days,
                "used_days": 0.0,
                "remaining_days": total_days
            }
        
        # 计算本年度已使用的年假天数
        from datetime import datetime
        current_year = datetime.now().year
        year_start = datetime(current_year, 1, 1)
        year_end = datetime(current_year, 12, 31, 23, 59, 59)
        
        # 查询本年度已批准的年假调休申请
        from ..models import LeaveApplication
        used_leave = self.db.query(func.sum(LeaveApplication.days)).filter(
            LeaveApplication.user_id == user_id,
            LeaveApplication.leave_type_id == annual_leave_type.id,
            LeaveApplication.status.in_([
                LeaveStatus.DEPT_APPROVED,
                LeaveStatus.VP_APPROVED,
                LeaveStatus.APPROVED
            ]),
            LeaveApplication.start_date >= year_start,
            LeaveApplication.start_date <= year_end
        ).scalar() or 0.0
        
        used_days = float(used_leave)
        remaining_days = max(0.0, total_days - used_days)
        
        return {
            "total_days": total_days,
            "used_days": used_days,
            "remaining_days": remaining_days
        }
    
    @transaction
    def clear_wechat_binding(self, user_id: int) -> None:
        """清理用户的微信绑定"""
        user = self.get_user(user_id)
        user.wechat_openid = None

