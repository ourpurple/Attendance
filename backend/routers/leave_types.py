from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from ..database import get_db
from ..models import LeaveType, LeaveApplication, User
from ..schemas import LeaveTypeCreate, LeaveTypeUpdate, LeaveTypeResponse
from ..security import get_current_user, get_current_active_admin

router = APIRouter(prefix="/leave-types", tags=["请假类型"])


def ensure_admin(user: User = Depends(get_current_active_admin)):
    return user


@router.get("/", response_model=List[LeaveTypeResponse])
def list_leave_types(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(LeaveType)
    if not include_inactive:
        query = query.filter(LeaveType.is_active == True)
    return query.order_by(LeaveType.id).all()


@router.post("/", response_model=LeaveTypeResponse, status_code=status.HTTP_201_CREATED)
def create_leave_type(
    leave_type: LeaveTypeCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(ensure_admin)
):
    existing = db.query(LeaveType).filter(LeaveType.name == leave_type.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该请假类型已存在"
        )
    lt = LeaveType(
        name=leave_type.name.strip(),
        description=leave_type.description,
        is_active=leave_type.is_active
    )
    db.add(lt)
    db.commit()
    db.refresh(lt)
    return lt


@router.put("/{leave_type_id}", response_model=LeaveTypeResponse)
def update_leave_type(
    leave_type_id: int,
    leave_type_update: LeaveTypeUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(ensure_admin)
):
    lt = db.query(LeaveType).filter(LeaveType.id == leave_type_id).first()
    if not lt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="请假类型不存在")

    update_data = leave_type_update.model_dump(exclude_unset=True)
    if "name" in update_data:
        name = update_data["name"].strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="类型名称不能为空")
        duplicate = db.query(LeaveType).filter(
            LeaveType.name == name,
            LeaveType.id != leave_type_id
        ).first()
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="同名类型已存在")
        lt.name = name

    if "description" in update_data:
        lt.description = update_data["description"]

    if "is_active" in update_data:
        lt.is_active = update_data["is_active"]

    lt.updated_at = datetime.now()
    db.commit()
    db.refresh(lt)
    return lt


@router.delete("/{leave_type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_leave_type(
    leave_type_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(ensure_admin)
):
    lt = db.query(LeaveType).filter(LeaveType.id == leave_type_id).first()
    if not lt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="请假类型不存在")

    # 如果有请假记录引用该类型，则不允许删除，仅允许停用
    usage_exists = db.query(LeaveApplication.id).filter(LeaveApplication.leave_type_id == leave_type_id).first()
    if usage_exists:
        lt.is_active = False
        lt.updated_at = datetime.now()
        db.commit()
        return

    db.delete(lt)
    db.commit()

