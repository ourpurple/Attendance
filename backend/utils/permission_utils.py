"""
权限工具类
统一权限检查逻辑
"""
from typing import Tuple
from ..models import User, UserRole
from ..exceptions import PermissionDeniedException


class PermissionUtils:
    """权限工具类"""
    
    @staticmethod
    def require_role(user: User, *allowed_roles: UserRole) -> None:
        """
        要求用户具有指定角色之一
        
        Args:
            user: 用户对象
            allowed_roles: 允许的角色列表
        
        Raises:
            PermissionDeniedException: 如果用户没有权限
        """
        if user.role not in allowed_roles:
            role_names = ", ".join(role.value for role in allowed_roles)
            raise PermissionDeniedException(
                f"需要以下角色之一: {role_names}"
            )
    
    @staticmethod
    def require_admin(user: User) -> None:
        """要求管理员权限"""
        PermissionUtils.require_role(user, UserRole.ADMIN)
    
    @staticmethod
    def require_manager(user: User) -> None:
        """要求管理权限（管理员、总经理、副总、部门主任）"""
        PermissionUtils.require_role(
            user,
            UserRole.ADMIN,
            UserRole.GENERAL_MANAGER,
            UserRole.VICE_PRESIDENT,
            UserRole.DEPARTMENT_HEAD
        )
    
    @staticmethod
    def can_view_statistics(user: User) -> bool:
        """检查是否可以查看统计信息"""
        return user.role in [
            UserRole.ADMIN,
            UserRole.DEPARTMENT_HEAD,
            UserRole.VICE_PRESIDENT,
            UserRole.GENERAL_MANAGER
        ]
    
    @staticmethod
    def can_manage_users(user: User) -> bool:
        """检查是否可以管理用户"""
        return user.role == UserRole.ADMIN

