"""
部门路由（重构版）
使用Service层架构
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import User
from ..schemas import DepartmentResponse, DepartmentCreate, DepartmentUpdate
from ..security import get_current_active_admin
from ..services.department_service import DepartmentService
from ..exceptions import BusinessException, NotFoundException, ConflictException, ValidationException

router = APIRouter(prefix="/departments", tags=["部门管理"])


@router.get("/", response_model=List[DepartmentResponse])
def list_departments(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取部门列表"""
    try:
        service = DepartmentService(db)
        departments = service.get_all_departments(skip=skip, limit=limit)
        return departments
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/{department_id}", response_model=DepartmentResponse)
def read_department(
    department_id: int,
    db: Session = Depends(get_db)
):
    """获取指定部门信息"""
    try:
        service = DepartmentService(db)
        department = service.get_department(department_id)
        return department
    except NotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_department(
    department_create: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """创建部门（管理员）"""
    try:
        service = DepartmentService(db)
        department = service.create_department(
            name=department_create.name,
            description=department_create.description,
            head_id=department_create.head_id
        )
        return department
    except (BusinessException, ConflictException, NotFoundException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put("/{department_id}", response_model=DepartmentResponse)
def update_department(
    department_id: int,
    department_update: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """更新部门信息（管理员）"""
    try:
        service = DepartmentService(db)
        
        update_data = department_update.model_dump(exclude_unset=True)
        department = service.update_department(
            department_id=department_id,
            name=update_data.get("name"),
            description=update_data.get("description"),
            head_id=update_data.get("head_id")
        )
        return department
    except (BusinessException, NotFoundException, ConflictException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    department_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """删除部门（管理员）"""
    try:
        service = DepartmentService(db)
        service.delete_department(department_id)
        return None
    except (BusinessException, NotFoundException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
