from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List
from ..database import get_db
from ..models import AttendanceViewer, User, UserRole
from ..schemas import AttendanceViewerCreate, AttendanceViewerResponse
from ..security import get_current_active_admin, get_current_user

router = APIRouter(prefix="/attendance-viewers", tags=["出勤情况查看授权"])


@router.get("/", response_model=List[AttendanceViewerResponse])
def get_attendance_viewers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取所有授权人员列表（仅管理员）"""
    viewers = db.query(AttendanceViewer).all()
    result = []
    for viewer in viewers:
        user = db.query(User).filter(User.id == viewer.user_id).first()
        result.append({
            "id": viewer.id,
            "user_id": viewer.user_id,
            "user_name": user.username if user else None,
            "user_real_name": user.real_name if user else None,
            "created_at": viewer.created_at,
            "updated_at": viewer.updated_at
        })
    return result


@router.post("/", response_model=AttendanceViewerResponse, status_code=status.HTTP_201_CREATED)
def create_attendance_viewer(
    viewer: AttendanceViewerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """添加授权人员（仅管理员）"""
    # 检查用户是否存在
    user = db.query(User).filter(User.id == viewer.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 检查是否已经授权
    existing = db.query(AttendanceViewer).filter(AttendanceViewer.user_id == viewer.user_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该用户已被授权"
        )
    
    # 创建授权记录
    new_viewer = AttendanceViewer(user_id=viewer.user_id)
    db.add(new_viewer)
    db.commit()
    db.refresh(new_viewer)
    
    return {
        "id": new_viewer.id,
        "user_id": new_viewer.user_id,
        "user_name": user.username,
        "user_real_name": user.real_name,
        "created_at": new_viewer.created_at,
        "updated_at": new_viewer.updated_at
    }


@router.delete("/{viewer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendance_viewer(
    viewer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """删除授权人员（仅管理员）"""
    viewer = db.query(AttendanceViewer).filter(AttendanceViewer.id == viewer_id).first()
    if not viewer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="授权记录不存在"
        )
    
    db.delete(viewer)
    db.commit()
    return None


@router.get("/check-permission")
def check_attendance_view_permission(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """检查当前用户是否有查看全部人员出勤情况的权限"""
    # 总经理和副总默认有权限
    if current_user.role in [UserRole.GENERAL_MANAGER, UserRole.VICE_PRESIDENT]:
        return {"has_permission": True, "reason": "role"}
    
    # 检查是否在授权列表中
    viewer = db.query(AttendanceViewer).filter(AttendanceViewer.user_id == current_user.id).first()
    if viewer:
        return {"has_permission": True, "reason": "authorized"}
    
    return {"has_permission": False, "reason": "none"}

