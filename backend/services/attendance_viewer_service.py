"""
考勤查看授权服务
封装考勤查看授权相关的业务逻辑
"""
from typing import Optional, List
from sqlalchemy.orm import Session

from ..models import AttendanceViewer, User, UserRole
from ..repositories.base_repository import BaseRepository
from ..repositories.user_repository import UserRepository
from ..exceptions import NotFoundException, ValidationException, ConflictException
from ..utils.transaction import transaction


class AttendanceViewerRepository(BaseRepository[AttendanceViewer]):
    """考勤查看授权Repository"""
    
    def __init__(self, db: Session):
        super().__init__(AttendanceViewer, db)
    
    def get_by_user_id(self, user_id: int) -> Optional[AttendanceViewer]:
        """根据用户ID获取授权记录"""
        return self.db.query(AttendanceViewer).filter(AttendanceViewer.user_id == user_id).first()


class AttendanceViewerService:
    """考勤查看授权服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        self.viewer_repo = AttendanceViewerRepository(db)
        self.user_repo = UserRepository(db)
    
    def get_all_viewers(self) -> List[dict]:
        """获取所有授权人员列表"""
        viewers = self.viewer_repo.get_all()
        result = []
        
        # 批量获取用户信息
        user_ids = [v.user_id for v in viewers]
        if user_ids:
            users = self.db.query(User).filter(User.id.in_(user_ids)).all()
            user_map = {u.id: u for u in users}
        else:
            user_map = {}
        
        for viewer in viewers:
            user = user_map.get(viewer.user_id)
            result.append({
                "id": viewer.id,
                "user_id": viewer.user_id,
                "user_name": user.username if user else None,
                "user_real_name": user.real_name if user else None,
                "created_at": viewer.created_at,
                "updated_at": viewer.updated_at
            })
        
        return result
    
    @transaction
    def create_viewer(self, user_id: int) -> dict:
        """添加授权人员"""
        # 检查用户是否存在
        user = self.user_repo.get(user_id)
        if not user:
            raise NotFoundException("用户", user_id)
        
        # 检查是否已经授权
        existing = self.viewer_repo.get_by_user_id(user_id)
        if existing:
            raise ConflictException("该用户已被授权")
        
        # 创建授权记录
        viewer = self.viewer_repo.create(user_id=user_id)
        
        return {
            "id": viewer.id,
            "user_id": viewer.user_id,
            "user_name": user.username,
            "user_real_name": user.real_name,
            "created_at": viewer.created_at,
            "updated_at": viewer.updated_at
        }
    
    @transaction
    def delete_viewer(self, viewer_id: int) -> None:
        """删除授权人员"""
        viewer = self.viewer_repo.get(viewer_id)
        if not viewer:
            raise NotFoundException("授权记录", viewer_id)
        
        self.viewer_repo.delete(viewer_id)
    
    def check_permission(self, user: User) -> dict:
        """检查用户是否有查看全部人员出勤情况的权限"""
        # 总经理和副总默认有权限
        if user.role in [UserRole.GENERAL_MANAGER, UserRole.VICE_PRESIDENT]:
            return {"has_permission": True, "reason": "role"}
        
        # 检查是否在授权列表中
        viewer = self.viewer_repo.get_by_user_id(user.id)
        if viewer:
            return {"has_permission": True, "reason": "authorized"}
        
        return {"has_permission": False, "reason": "none"}

