"""
部门Repository
"""
from typing import Optional, List
from sqlalchemy.orm import Session
from ..models import Department
from .base_repository import BaseRepository


class DepartmentRepository(BaseRepository[Department]):
    """部门Repository"""
    
    def __init__(self, db: Session):
        super().__init__(Department, db)
    
    def get_by_name(self, name: str) -> Optional[Department]:
        """根据名称获取部门"""
        return self.db.query(Department).filter(Department.name == name).first()
    
    def get_all_with_users(self) -> List[Department]:
        """获取所有部门（包含用户信息）"""
        return (
            self.db.query(Department)
            .order_by(Department.id)
            .all()
        )

