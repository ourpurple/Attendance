"""
考勤Repository
"""
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from datetime import datetime, date
from ..models import Attendance, User, AttendancePolicy
from .base_repository import BaseRepository


class AttendanceRepository(BaseRepository[Attendance]):
    """考勤Repository"""
    
    def __init__(self, db: Session):
        super().__init__(Attendance, db)
    
    def get_by_user_and_date(self, user_id: int, target_date: date) -> Optional[Attendance]:
        """根据用户ID和日期获取考勤记录"""
        return (
            self.db.query(Attendance)
            .filter(
                and_(
                    Attendance.user_id == user_id,
                    func.date(Attendance.date) == target_date
                )
            )
            .first()
        )
    
    def get_by_user(
        self, 
        user_id: int, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Attendance]:
        """根据用户ID获取考勤记录列表"""
        query = self.db.query(Attendance).filter(Attendance.user_id == user_id)
        
        if start_date:
            query = query.filter(func.date(Attendance.date) >= start_date)
        if end_date:
            query = query.filter(func.date(Attendance.date) <= end_date)
        
        return query.order_by(Attendance.date.desc()).offset(skip).limit(limit).all()
    
    def get_by_date_range(
        self,
        start_date: date,
        end_date: date,
        user_ids: Optional[List[int]] = None,
        skip: int = 0,
        limit: int = 1000
    ) -> List[Attendance]:
        """根据日期范围获取考勤记录"""
        query = self.db.query(Attendance).filter(
            and_(
                func.date(Attendance.date) >= start_date,
                func.date(Attendance.date) <= end_date
            )
        )
        
        if user_ids:
            query = query.filter(Attendance.user_id.in_(user_ids))
        
        return query.order_by(Attendance.date.desc()).offset(skip).limit(limit).all()
    
    def get_active_policy(self) -> Optional[AttendancePolicy]:
        """获取活跃的打卡策略"""
        return (
            self.db.query(AttendancePolicy)
            .filter(AttendancePolicy.is_active == True)
            .first()
        )

