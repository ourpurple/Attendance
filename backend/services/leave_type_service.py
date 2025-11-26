"""
请假类型服务
封装请假类型相关的业务逻辑
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session

from ..models import LeaveType, LeaveApplication, User, UserRole
from ..repositories.base_repository import BaseRepository
from ..exceptions import NotFoundException, ValidationException, ConflictException, PermissionDeniedException
from ..utils.transaction import transaction


class LeaveTypeRepository(BaseRepository[LeaveType]):
    """请假类型Repository"""
    
    def __init__(self, db: Session):
        super().__init__(LeaveType, db)
    
    def get_by_name(self, name: str) -> Optional[LeaveType]:
        """根据名称获取请假类型"""
        return self.db.query(LeaveType).filter(LeaveType.name == name).first()
    
    def get_active_types(self) -> List[LeaveType]:
        """获取所有活跃的请假类型"""
        return (
            self.db.query(LeaveType)
            .filter(LeaveType.is_active == True)
            .order_by(LeaveType.id)
            .all()
        )


class LeaveTypeService:
    """请假类型服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        self.leave_type_repo = LeaveTypeRepository(db)
    
    def get_leave_type(self, leave_type_id: int) -> LeaveType:
        """获取请假类型"""
        leave_type = self.leave_type_repo.get(leave_type_id)
        if not leave_type:
            raise NotFoundException("请假类型", leave_type_id)
        return leave_type
    
    def get_all_leave_types(
        self,
        include_inactive: bool = False
    ) -> List[LeaveType]:
        """获取请假类型列表"""
        if include_inactive:
            return self.leave_type_repo.get_all()
        return self.leave_type_repo.get_active_types()
    
    @transaction
    def create_leave_type(
        self,
        name: str,
        description: Optional[str] = None,
        is_active: bool = True,
        current_user: Optional[User] = None
    ) -> LeaveType:
        """创建请假类型（管理员）"""
        # 权限检查
        if current_user and current_user.role != UserRole.ADMIN:
            raise PermissionDeniedException("只有管理员可以管理请假类型")
        
        # 检查名称是否已存在
        existing = self.leave_type_repo.get_by_name(name.strip())
        if existing:
            raise ConflictException("该请假类型已存在")
        
        # 创建请假类型
        leave_type = self.leave_type_repo.create(
            name=name.strip(),
            description=description,
            is_active=is_active
        )
        
        return leave_type
    
    @transaction
    def update_leave_type(
        self,
        leave_type_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        is_active: Optional[bool] = None,
        current_user: Optional[User] = None
    ) -> LeaveType:
        """更新请假类型（管理员）"""
        # 权限检查
        if current_user and current_user.role != UserRole.ADMIN:
            raise PermissionDeniedException("只有管理员可以管理请假类型")
        
        leave_type = self.get_leave_type(leave_type_id)
        
        update_data = {}
        if name is not None:
            name = name.strip()
            if not name:
                raise ValidationException("类型名称不能为空")
            # 检查名称是否被其他类型使用
            existing = self.leave_type_repo.get_by_name(name)
            if existing and existing.id != leave_type_id:
                raise ConflictException("同名类型已存在")
            update_data['name'] = name
        if description is not None:
            update_data['description'] = description
        if is_active is not None:
            update_data['is_active'] = is_active
        
        return self.leave_type_repo.update(leave_type_id, **update_data)
    
    @transaction
    def delete_leave_type(
        self,
        leave_type_id: int,
        current_user: Optional[User] = None
    ) -> None:
        """删除请假类型（管理员）"""
        # 权限检查
        if current_user and current_user.role != UserRole.ADMIN:
            raise PermissionDeniedException("只有管理员可以管理请假类型")
        
        leave_type = self.get_leave_type(leave_type_id)
        
        # 如果有请假记录引用该类型，则不允许删除，仅允许停用
        usage_exists = self.db.query(LeaveApplication.id).filter(
            LeaveApplication.leave_type_id == leave_type_id
        ).first()
        
        if usage_exists:
            # 停用而不是删除
            leave_type.is_active = False
            leave_type.updated_at = datetime.now()
        else:
            # 可以删除
            self.leave_type_repo.delete(leave_type_id)

