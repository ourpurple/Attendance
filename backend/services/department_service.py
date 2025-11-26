"""
部门服务
封装部门相关的业务逻辑
"""
from typing import Optional, List
from sqlalchemy.orm import Session

from ..models import Department, User
from ..repositories import DepartmentRepository, UserRepository
from ..exceptions import NotFoundException, ValidationException, ConflictException
from ..utils.transaction import transaction


class DepartmentService:
    """部门服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        self.dept_repo = DepartmentRepository(db)
        self.user_repo = UserRepository(db)
    
    def get_department(self, department_id: int) -> Department:
        """获取部门"""
        department = self.dept_repo.get(department_id)
        if not department:
            raise NotFoundException("部门", department_id)
        return department
    
    def get_all_departments(
        self,
        skip: int = 0,
        limit: int = 100
    ) -> List[Department]:
        """获取部门列表"""
        return self.dept_repo.get_all(skip, limit)
    
    @transaction
    def create_department(
        self,
        name: str,
        description: Optional[str] = None,
        head_id: Optional[int] = None
    ) -> Department:
        """创建部门"""
        # 检查部门名称是否已存在
        existing = self.dept_repo.get_by_name(name)
        if existing:
            raise ConflictException(f"部门名称 {name} 已存在")
        
        # 如果指定了负责人，验证负责人是否存在
        if head_id:
            head = self.user_repo.get(head_id)
            if not head:
                raise NotFoundException("负责人", head_id)
        
        # 创建部门
        department = self.dept_repo.create(
            name=name,
            description=description,
            head_id=head_id
        )
        
        return department
    
    @transaction
    def update_department(
        self,
        department_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        head_id: Optional[int] = None
    ) -> Department:
        """更新部门"""
        department = self.get_department(department_id)
        
        update_data = {}
        if name is not None:
            # 检查名称是否被其他部门使用
            existing = self.dept_repo.get_by_name(name)
            if existing and existing.id != department_id:
                raise ConflictException(f"部门名称 {name} 已被使用")
            update_data['name'] = name
        if description is not None:
            update_data['description'] = description
        if head_id is not None:
            # 验证负责人是否存在
            if head_id:
                head = self.user_repo.get(head_id)
                if not head:
                    raise NotFoundException("负责人", head_id)
            update_data['head_id'] = head_id
        
        return self.dept_repo.update(department_id, **update_data)
    
    @transaction
    def delete_department(self, department_id: int) -> None:
        """删除部门"""
        department = self.get_department(department_id)
        
        # 检查是否有用户关联到该部门
        users = self.user_repo.get_by_department(department_id)
        if users:
            raise ValidationException("该部门下还有用户，无法删除")
        
        self.dept_repo.delete(department_id)

