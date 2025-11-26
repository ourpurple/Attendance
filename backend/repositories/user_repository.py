"""
用户Repository
"""
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..models import User, UserRole
from .base_repository import BaseRepository


class UserRepository(BaseRepository[User]):
    """用户Repository"""
    
    def __init__(self, db: Session):
        super().__init__(User, db)
    
    def get_by_username(self, username: str) -> Optional[User]:
        """根据用户名获取用户"""
        return self.db.query(User).filter(User.username == username).first()
    
    def get_by_email(self, email: str) -> Optional[User]:
        """根据邮箱获取用户"""
        return self.db.query(User).filter(User.email == email).first()
    
    def get_by_wechat_openid(self, openid: str) -> Optional[User]:
        """根据微信OpenID获取用户"""
        return self.db.query(User).filter(User.wechat_openid == openid).first()
    
    def get_by_role(self, role: UserRole, skip: int = 0, limit: int = 100) -> List[User]:
        """根据角色获取用户列表"""
        return (
            self.db.query(User)
            .filter(User.role == role, User.is_active == True)
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def get_by_roles(self, roles: List[UserRole]) -> List[User]:
        """根据多个角色获取用户列表"""
        return (
            self.db.query(User)
            .filter(User.role.in_(roles), User.is_active == True)
            .order_by(User.role, User.id)
            .all()
        )
    
    def get_by_department(self, department_id: int, skip: int = 0, limit: int = 100) -> List[User]:
        """根据部门获取用户列表"""
        return (
            self.db.query(User)
            .filter(User.department_id == department_id, User.is_active == True)
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def get_active_users(self, skip: int = 0, limit: int = 100) -> List[User]:
        """获取所有激活的用户"""
        return (
            self.db.query(User)
            .filter(User.is_active == True)
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def has_attendance_records(self, user_id: int) -> bool:
        """检查用户是否有考勤记录"""
        user = self.get(user_id)
        return user and len(user.attendances) > 0
    
    def has_leave_applications(self, user_id: int) -> bool:
        """检查用户是否有请假记录"""
        user = self.get(user_id)
        return user and len(user.leave_applications) > 0
    
    def has_overtime_applications(self, user_id: int) -> bool:
        """检查用户是否有加班记录"""
        user = self.get(user_id)
        return user and len(user.overtime_applications) > 0

