"""
请假类型路由（重构版）
使用Service层架构
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import User
from ..schemas import LeaveTypeCreate, LeaveTypeUpdate, LeaveTypeResponse
from ..security import get_current_user, get_current_active_admin
from ..services.leave_type_service import LeaveTypeService
from ..exceptions import BusinessException, NotFoundException, ConflictException, ValidationException, PermissionDeniedException

router = APIRouter(prefix="/leave-types", tags=["请假类型"])


@router.get("/", response_model=List[LeaveTypeResponse])
def list_leave_types(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取请假类型列表"""
    try:
        service = LeaveTypeService(db)
        leave_types = service.get_all_leave_types(include_inactive=include_inactive)
        return leave_types
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/", response_model=LeaveTypeResponse, status_code=status.HTTP_201_CREATED)
def create_leave_type(
    leave_type: LeaveTypeCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_active_admin)
):
    """创建请假类型（管理员）"""
    try:
        service = LeaveTypeService(db)
        leave_type_obj = service.create_leave_type(
            name=leave_type.name,
            description=leave_type.description,
            is_active=leave_type.is_active,
            current_user=current_admin
        )
        return leave_type_obj
    except (BusinessException, ConflictException, ValidationException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put("/{leave_type_id}", response_model=LeaveTypeResponse)
def update_leave_type(
    leave_type_id: int,
    leave_type_update: LeaveTypeUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_active_admin)
):
    """更新请假类型（管理员）"""
    try:
        service = LeaveTypeService(db)
        
        update_data = leave_type_update.model_dump(exclude_unset=True)
        leave_type = service.update_leave_type(
            leave_type_id=leave_type_id,
            name=update_data.get("name"),
            description=update_data.get("description"),
            is_active=update_data.get("is_active"),
            current_user=current_admin
        )
        return leave_type
    except (BusinessException, NotFoundException, ConflictException, ValidationException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/{leave_type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_leave_type(
    leave_type_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_active_admin)
):
    """删除请假类型（管理员）"""
    try:
        service = LeaveTypeService(db)
        service.delete_leave_type(leave_type_id, current_admin)
        return None
    except (BusinessException, NotFoundException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
