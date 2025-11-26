"""
考勤查看授权路由（重构版）
使用Service层架构
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import User
from ..schemas import AttendanceViewerCreate, AttendanceViewerResponse
from ..security import get_current_active_admin, get_current_user
from ..services.attendance_viewer_service import AttendanceViewerService
from ..exceptions import BusinessException, NotFoundException, ConflictException

router = APIRouter(prefix="/attendance-viewers", tags=["出勤情况查看授权"])


@router.get("/", response_model=List[AttendanceViewerResponse])
def get_attendance_viewers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取所有授权人员列表（仅管理员）"""
    try:
        service = AttendanceViewerService(db)
        viewers = service.get_all_viewers()
        return viewers
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/", response_model=AttendanceViewerResponse, status_code=status.HTTP_201_CREATED)
def create_attendance_viewer(
    viewer: AttendanceViewerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """添加授权人员（仅管理员）"""
    try:
        service = AttendanceViewerService(db)
        viewer_obj = service.create_viewer(viewer.user_id)
        return viewer_obj
    except (BusinessException, NotFoundException, ConflictException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/{viewer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendance_viewer(
    viewer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """删除授权人员（仅管理员）"""
    try:
        service = AttendanceViewerService(db)
        service.delete_viewer(viewer_id)
        return None
    except NotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/check-permission")
def check_attendance_view_permission(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """检查当前用户是否有查看全部人员出勤情况的权限"""
    try:
        service = AttendanceViewerService(db)
        return service.check_permission(current_user)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
