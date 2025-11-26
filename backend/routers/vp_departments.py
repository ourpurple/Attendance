"""
副总分管部门管理路由（重构版）
使用Service层架构
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import User
from ..schemas import (
    VicePresidentDepartmentCreate,
    VicePresidentDepartmentUpdate,
    VicePresidentDepartmentResponse
)
from ..security import get_current_active_admin
from ..services.vp_department_service import VicePresidentDepartmentService
from ..exceptions import BusinessException, NotFoundException, ConflictException, ValidationException

router = APIRouter(prefix="/vp-departments", tags=["副总分管部门管理"])


@router.get("/", response_model=List[VicePresidentDepartmentResponse])
def list_vp_departments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取所有副总分管部门关系"""
    try:
        service = VicePresidentDepartmentService(db)
        vp_depts = service.get_all_vp_departments()
        return vp_depts
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/{vp_dept_id}", response_model=VicePresidentDepartmentResponse)
def get_vp_department(
    vp_dept_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取单个副总分管部门关系"""
    try:
        service = VicePresidentDepartmentService(db)
        vp_dept = service.get_vp_department(vp_dept_id)
        return vp_dept
    except NotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/", response_model=VicePresidentDepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_vp_department(
    vp_dept_create: VicePresidentDepartmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """创建副总分管部门关系"""
    try:
        service = VicePresidentDepartmentService(db)
        vp_dept = service.create_vp_department(
            vice_president_id=vp_dept_create.vice_president_id,
            department_id=vp_dept_create.department_id,
            is_default=vp_dept_create.is_default
        )
        return vp_dept
    except (BusinessException, NotFoundException, ConflictException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put("/{vp_dept_id}", response_model=VicePresidentDepartmentResponse)
def update_vp_department(
    vp_dept_id: int,
    vp_dept_update: VicePresidentDepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """更新副总分管部门关系"""
    try:
        service = VicePresidentDepartmentService(db)
        vp_dept = service.update_vp_department(
            vp_dept_id=vp_dept_id,
            is_default=vp_dept_update.is_default
        )
        return vp_dept
    except (BusinessException, NotFoundException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/{vp_dept_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vp_department(
    vp_dept_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """删除副总分管部门关系"""
    try:
        service = VicePresidentDepartmentService(db)
        service.delete_vp_department(vp_dept_id)
        return None
    except NotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
