"""
副总分管部门服务
封装副总分管部门相关的业务逻辑
"""
from typing import Optional, List
from sqlalchemy.orm import Session

from ..models import VicePresidentDepartment, User, UserRole, Department
from ..repositories.base_repository import BaseRepository
from ..repositories.user_repository import UserRepository
from ..repositories.department_repository import DepartmentRepository
from ..exceptions import NotFoundException, ValidationException, ConflictException
from ..utils.transaction import transaction


class VicePresidentDepartmentRepository(BaseRepository[VicePresidentDepartment]):
    """副总分管部门Repository"""
    
    def __init__(self, db: Session):
        super().__init__(VicePresidentDepartment, db)
    
    def get_by_vp_and_dept(self, vice_president_id: int, department_id: int) -> Optional[VicePresidentDepartment]:
        """根据副总和部门获取分管关系"""
        return (
            self.db.query(VicePresidentDepartment)
            .filter(
                VicePresidentDepartment.vice_president_id == vice_president_id,
                VicePresidentDepartment.department_id == department_id
            )
            .first()
        )
    
    def get_by_department(self, department_id: int) -> List[VicePresidentDepartment]:
        """根据部门获取所有分管关系"""
        return (
            self.db.query(VicePresidentDepartment)
            .filter(VicePresidentDepartment.department_id == department_id)
            .all()
        )


class VicePresidentDepartmentService:
    """副总分管部门服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        self.vp_dept_repo = VicePresidentDepartmentRepository(db)
        self.user_repo = UserRepository(db)
        self.dept_repo = DepartmentRepository(db)
    
    def get_all_vp_departments(self) -> List[dict]:
        """获取所有副总分管部门关系"""
        vp_depts = self.vp_dept_repo.get_all()
        
        # 收集所有用户和部门ID
        user_ids = {vpd.vice_president_id for vpd in vp_depts}
        dept_ids = {vpd.department_id for vpd in vp_depts}
        
        # 批量查询用户和部门信息
        if user_ids:
            users = self.db.query(User).filter(User.id.in_(user_ids)).all()
            user_map = {u.id: u.real_name for u in users}
        else:
            user_map = {}
        
        if dept_ids:
            departments = self.db.query(Department).filter(Department.id.in_(dept_ids)).all()
            dept_map = {d.id: d.name for d in departments}
        else:
            dept_map = {}
        
        # 构建响应
        responses = []
        for vpd in vp_depts:
            responses.append({
                "id": vpd.id,
                "vice_president_id": vpd.vice_president_id,
                "department_id": vpd.department_id,
                "is_default": vpd.is_default,
                "created_at": vpd.created_at,
                "updated_at": vpd.updated_at,
                "vice_president_name": user_map.get(vpd.vice_president_id),
                "department_name": dept_map.get(vpd.department_id)
            })
        
        return responses
    
    def get_vp_department(self, vp_dept_id: int) -> dict:
        """获取单个副总分管部门关系"""
        vp_dept = self.vp_dept_repo.get(vp_dept_id)
        if not vp_dept:
            raise NotFoundException("分管关系", vp_dept_id)
        
        # 获取用户和部门信息
        vp = self.user_repo.get(vp_dept.vice_president_id)
        dept = self.dept_repo.get(vp_dept.department_id)
        
        return {
            "id": vp_dept.id,
            "vice_president_id": vp_dept.vice_president_id,
            "department_id": vp_dept.department_id,
            "is_default": vp_dept.is_default,
            "created_at": vp_dept.created_at,
            "updated_at": vp_dept.updated_at,
            "vice_president_name": vp.real_name if vp else None,
            "department_name": dept.name if dept else None
        }
    
    @transaction
    def create_vp_department(
        self,
        vice_president_id: int,
        department_id: int,
        is_default: bool = False
    ) -> dict:
        """创建副总分管部门关系"""
        # 验证副总是否存在且角色正确
        vp = self.user_repo.get(vice_president_id)
        if not vp or vp.role != UserRole.VICE_PRESIDENT:
            raise ValidationException("指定的用户不是副总")
        
        # 验证部门是否存在
        dept = self.dept_repo.get(department_id)
        if not dept:
            raise NotFoundException("部门", department_id)
        
        # 检查是否已存在
        existing = self.vp_dept_repo.get_by_vp_and_dept(vice_president_id, department_id)
        if existing:
            raise ConflictException("该副总已分管该部门")
        
        # 如果设置为默认，取消该部门的其他默认分管
        if is_default:
            existing_defaults = self.vp_dept_repo.get_by_department(department_id)
            for existing_default in existing_defaults:
                if existing_default.is_default:
                    self.vp_dept_repo.update(existing_default.id, is_default=False)
        
        # 创建分管关系
        vp_dept = self.vp_dept_repo.create(
            vice_president_id=vice_president_id,
            department_id=department_id,
            is_default=is_default
        )
        
        return {
            "id": vp_dept.id,
            "vice_president_id": vp_dept.vice_president_id,
            "department_id": vp_dept.department_id,
            "is_default": vp_dept.is_default,
            "created_at": vp_dept.created_at,
            "updated_at": vp_dept.updated_at,
            "vice_president_name": vp.real_name,
            "department_name": dept.name
        }
    
    @transaction
    def update_vp_department(
        self,
        vp_dept_id: int,
        is_default: Optional[bool] = None
    ) -> dict:
        """更新副总分管部门关系"""
        vp_dept = self.vp_dept_repo.get(vp_dept_id)
        if not vp_dept:
            raise NotFoundException("分管关系", vp_dept_id)
        
        # 如果设置为默认，取消该部门的其他默认分管
        if is_default is not None and is_default:
            existing_defaults = self.vp_dept_repo.get_by_department(vp_dept.department_id)
            for existing_default in existing_defaults:
                if existing_default.id != vp_dept_id and existing_default.is_default:
                    self.vp_dept_repo.update(existing_default.id, is_default=False)
        
        # 更新分管关系
        if is_default is not None:
            vp_dept = self.vp_dept_repo.update(vp_dept_id, is_default=is_default)
        
        # 获取用户和部门信息
        vp = self.user_repo.get(vp_dept.vice_president_id)
        dept = self.dept_repo.get(vp_dept.department_id)
        
        return {
            "id": vp_dept.id,
            "vice_president_id": vp_dept.vice_president_id,
            "department_id": vp_dept.department_id,
            "is_default": vp_dept.is_default,
            "created_at": vp_dept.created_at,
            "updated_at": vp_dept.updated_at,
            "vice_president_name": vp.real_name if vp else None,
            "department_name": dept.name if dept else None
        }
    
    @transaction
    def delete_vp_department(self, vp_dept_id: int) -> None:
        """删除副总分管部门关系"""
        vp_dept = self.vp_dept_repo.get(vp_dept_id)
        if not vp_dept:
            raise NotFoundException("分管关系", vp_dept_id)
        
        self.vp_dept_repo.delete(vp_dept_id)

