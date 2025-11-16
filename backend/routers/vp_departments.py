"""
副总分管部门管理接口
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import VicePresidentDepartment, User, UserRole, Department
from ..schemas import (
    VicePresidentDepartmentCreate,
    VicePresidentDepartmentUpdate,
    VicePresidentDepartmentResponse
)
from ..security import get_current_active_admin

router = APIRouter(prefix="/vp-departments", tags=["副总分管部门管理"])


@router.get("/", response_model=List[VicePresidentDepartmentResponse])
def list_vp_departments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取所有副总分管部门关系"""
    vp_depts = db.query(VicePresidentDepartment).all()
    
    # 收集所有用户和部门ID
    user_ids = {vpd.vice_president_id for vpd in vp_depts}
    dept_ids = {vpd.department_id for vpd in vp_depts}
    
    # 查询用户和部门信息
    users = db.query(User.id, User.real_name).filter(User.id.in_(user_ids)).all()
    user_map = {user.id: user.real_name for user in users}
    
    departments = db.query(Department.id, Department.name).filter(Department.id.in_(dept_ids)).all()
    dept_map = {dept.id: dept.name for dept in departments}
    
    # 构建响应
    responses = []
    for vpd in vp_depts:
        data = VicePresidentDepartmentResponse.from_orm(vpd).dict()
        data["vice_president_name"] = user_map.get(vpd.vice_president_id)
        data["department_name"] = dept_map.get(vpd.department_id)
        responses.append(VicePresidentDepartmentResponse(**data))
    
    return responses


@router.post("/", response_model=VicePresidentDepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_vp_department(
    vp_dept_create: VicePresidentDepartmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """创建副总分管部门关系"""
    # 验证副总是否存在且角色正确
    vp = db.query(User).filter(
        User.id == vp_dept_create.vice_president_id,
        User.role == UserRole.VICE_PRESIDENT
    ).first()
    if not vp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="指定的用户不是副总"
        )
    
    # 验证部门是否存在
    dept = db.query(Department).filter(Department.id == vp_dept_create.department_id).first()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="部门不存在"
        )
    
    # 检查是否已存在
    existing = db.query(VicePresidentDepartment).filter(
        VicePresidentDepartment.vice_president_id == vp_dept_create.vice_president_id,
        VicePresidentDepartment.department_id == vp_dept_create.department_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该副总已分管该部门"
        )
    
    # 如果设置为默认，取消该部门的其他默认分管
    if vp_dept_create.is_default:
        db.query(VicePresidentDepartment).filter(
            VicePresidentDepartment.department_id == vp_dept_create.department_id,
            VicePresidentDepartment.is_default == True
        ).update({"is_default": False})
    
    vp_dept = VicePresidentDepartment(
        vice_president_id=vp_dept_create.vice_president_id,
        department_id=vp_dept_create.department_id,
        is_default=vp_dept_create.is_default
    )
    
    db.add(vp_dept)
    db.commit()
    db.refresh(vp_dept)
    
    # 添加名称信息
    response = VicePresidentDepartmentResponse.from_orm(vp_dept).dict()
    response["vice_president_name"] = vp.real_name
    response["department_name"] = dept.name
    
    return VicePresidentDepartmentResponse(**response)


@router.put("/{vp_dept_id}", response_model=VicePresidentDepartmentResponse)
def update_vp_department(
    vp_dept_id: int,
    vp_dept_update: VicePresidentDepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """更新副总分管部门关系"""
    vp_dept = db.query(VicePresidentDepartment).filter(VicePresidentDepartment.id == vp_dept_id).first()
    if not vp_dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="分管关系不存在"
        )
    
    # 如果设置为默认，取消该部门的其他默认分管
    if vp_dept_update.is_default is not None and vp_dept_update.is_default:
        db.query(VicePresidentDepartment).filter(
            VicePresidentDepartment.department_id == vp_dept.department_id,
            VicePresidentDepartment.is_default == True,
            VicePresidentDepartment.id != vp_dept_id
        ).update({"is_default": False})
    
    if vp_dept_update.is_default is not None:
        vp_dept.is_default = vp_dept_update.is_default
    
    db.commit()
    db.refresh(vp_dept)
    
    # 添加名称信息
    vp = db.query(User).filter(User.id == vp_dept.vice_president_id).first()
    dept = db.query(Department).filter(Department.id == vp_dept.department_id).first()
    
    response = VicePresidentDepartmentResponse.from_orm(vp_dept).dict()
    response["vice_president_name"] = vp.real_name if vp else None
    response["department_name"] = dept.name if dept else None
    
    return VicePresidentDepartmentResponse(**response)


@router.delete("/{vp_dept_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vp_department(
    vp_dept_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """删除副总分管部门关系"""
    vp_dept = db.query(VicePresidentDepartment).filter(VicePresidentDepartment.id == vp_dept_id).first()
    if not vp_dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="分管关系不存在"
        )
    
    db.delete(vp_dept)
    db.commit()
    
    return None

