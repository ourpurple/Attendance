"""
请假Repository
"""
from typing import Optional, List
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from datetime import datetime, date
from ..models import LeaveApplication, User, LeaveStatus, LeaveType
from .base_repository import BaseRepository


class LeaveRepository(BaseRepository[LeaveApplication]):
    """请假Repository"""
    
    def __init__(self, db: Session):
        super().__init__(LeaveApplication, db)
    
    def get_by_user(
        self,
        user_id: int,
        status: Optional[LeaveStatus] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[LeaveApplication]:
        """根据用户ID获取请假申请列表"""
        query = self.db.query(LeaveApplication).filter(LeaveApplication.user_id == user_id)
        
        if status:
            query = query.filter(LeaveApplication.status == status.value)
        
        return (
            query.order_by(LeaveApplication.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def get_pending_by_approver(
        self,
        approver_id: int,
        approver_role: str,
        skip: int = 0,
        limit: int = 100
    ) -> List[LeaveApplication]:
        """根据审批人获取待审批的请假申请"""
        query = self.db.query(LeaveApplication).options(
            joinedload(LeaveApplication.user),
            joinedload(LeaveApplication.leave_type)
        )
        
        if approver_role == "department_head":
            # 部门主任：查看本部门员工的pending申请
            query = query.join(User, LeaveApplication.user_id == User.id).filter(
                and_(
                    LeaveApplication.status == LeaveStatus.PENDING.value,
                    User.department_id == (
                        self.db.query(User.department_id)
                        .filter(User.id == approver_id)
                        .scalar()
                    )
                )
            )
        elif approver_role == "vice_president":
            # 副总：查看分配给自己的dept_approved申请
            query = query.filter(
                and_(
                    LeaveApplication.status == LeaveStatus.DEPT_APPROVED.value,
                    LeaveApplication.assigned_vp_id == approver_id
                )
            )
        elif approver_role == "general_manager":
            # 总经理：查看vp_approved申请（如果指定了assigned_gm_id，则必须是自己的）
            query = query.filter(
                and_(
                    LeaveApplication.status == LeaveStatus.VP_APPROVED.value,
                    or_(
                        LeaveApplication.assigned_gm_id == None,
                        LeaveApplication.assigned_gm_id == approver_id
                    )
                )
            )
        
        return (
            query.order_by(LeaveApplication.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def get_by_date_range(
        self,
        user_id: int,
        start_date: date,
        end_date: date
    ) -> List[LeaveApplication]:
        """获取用户在指定日期范围内的请假申请"""
        return (
            self.db.query(LeaveApplication)
            .filter(
                and_(
                    LeaveApplication.user_id == user_id,
                    LeaveApplication.start_date <= datetime.combine(end_date, datetime.max.time()),
                    LeaveApplication.end_date >= datetime.combine(start_date, datetime.min.time()),
                    LeaveApplication.status.in_([
                        LeaveStatus.PENDING.value,
                        LeaveStatus.DEPT_APPROVED.value,
                        LeaveStatus.VP_APPROVED.value,
                        LeaveStatus.APPROVED.value
                    ])
                )
            )
            .all()
        )
    
    def get_all_by_date_range(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        user_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[LeaveApplication]:
        """获取指定日期范围内的所有请假申请（管理员查询）"""
        query = self.db.query(LeaveApplication).options(
            joinedload(LeaveApplication.leave_type),
            joinedload(LeaveApplication.user)
        )
        
        if start_date:
            query = query.filter(
                LeaveApplication.end_date >= datetime.combine(start_date, datetime.min.time())
            )
        
        if end_date:
            query = query.filter(
                LeaveApplication.start_date <= datetime.combine(end_date, datetime.max.time())
            )
        
        if user_id:
            query = query.filter(LeaveApplication.user_id == user_id)
        
        return (
            query.order_by(LeaveApplication.start_date.desc(), LeaveApplication.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def get_active_leave_type(self, leave_type_id: int) -> Optional[LeaveType]:
        """获取活跃的请假类型"""
        return (
            self.db.query(LeaveType)
            .filter(
                and_(
                    LeaveType.id == leave_type_id,
                    LeaveType.is_active == True
                )
            )
            .first()
        )

