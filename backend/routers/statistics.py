"""
统计路由（重构版）
使用Service层架构
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from ..database import get_db
from ..models import User, UserRole
from ..schemas import (
    AttendanceStatistics, PeriodStatistics, LeaveApplicationResponse,
    OvertimeApplicationResponse, DailyAttendanceStatisticsResponse
)
from ..security import get_current_user, get_current_active_admin
from ..services.statistics_service import StatisticsService
from ..exceptions import BusinessException, PermissionDeniedException

router = APIRouter(prefix="/statistics", tags=["统计分析"])


@router.get("/attendance", response_model=List[AttendanceStatistics])
def get_attendance_statistics(
    start_date: date,
    end_date: date,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取考勤统计（按用户）"""
    try:
        service = StatisticsService(db)
        statistics = service.get_attendance_statistics(
            start_date=start_date,
            end_date=end_date,
            current_user=current_user,
            department_id=department_id
        )
        return statistics
    except (BusinessException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/period", response_model=PeriodStatistics)
def get_period_statistics(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取周期统计（管理员）"""
    try:
        service = StatisticsService(db)
        statistics = service.get_period_statistics(
            start_date=start_date,
            end_date=end_date
        )
        return statistics
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/my", response_model=AttendanceStatistics)
def get_my_statistics(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取我的统计数据"""
    try:
        service = StatisticsService(db)
        statistics = service.get_my_statistics(
            start_date=start_date,
            end_date=end_date,
            current_user=current_user
        )
        return statistics
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/user/{user_id}/leave-details", response_model=List[LeaveApplicationResponse])
def get_user_leave_details(
    user_id: int,
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取指定用户的请假明细（只返回已批准的）"""
    try:
        service = StatisticsService(db)
        leaves = service.get_user_leave_details(
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            current_user=current_user
        )
        return leaves
    except (BusinessException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/user/{user_id}/overtime-details", response_model=List[OvertimeApplicationResponse])
def get_user_overtime_details(
    user_id: int,
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取指定用户的加班明细（只返回已批准的）"""
    try:
        service = StatisticsService(db)
        overtimes = service.get_user_overtime_details(
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            current_user=current_user
        )
        return overtimes
    except (BusinessException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/attendance/daily", response_model=DailyAttendanceStatisticsResponse)
def get_daily_attendance_statistics(
    start_date: date,
    end_date: date,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取每日上下午考勤详细统计（只统计工作日）"""
    try:
        service = StatisticsService(db)
        statistics = service.get_daily_attendance_statistics(
            start_date=start_date,
            end_date=end_date,
            current_user=current_user,
            department_id=department_id
        )
        return statistics
    except (BusinessException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
