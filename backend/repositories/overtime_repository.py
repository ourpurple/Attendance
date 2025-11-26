"""
加班Repository
"""
from typing import Optional, List
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from datetime import datetime, date
from ..models import OvertimeApplication, User, OvertimeStatus
from .base_repository import BaseRepository


class OvertimeRepository(BaseRepository[OvertimeApplication]):
    """加班Repository"""
    
    def __init__(self, db: Session):
        super().__init__(OvertimeApplication, db)
    
    def get_by_user(
        self,
        user_id: int,
        status: Optional[OvertimeStatus] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[OvertimeApplication]:
        """根据用户ID获取加班申请列表"""
        query = self.db.query(OvertimeApplication).filter(
            OvertimeApplication.user_id == user_id
        )
        
        if status:
            query = query.filter(OvertimeApplication.status == status.value)
        
        return (
            query.order_by(OvertimeApplication.created_at.desc())
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
    ) -> List[OvertimeApplication]:
        """根据审批人获取待审批的加班申请"""
        query = self.db.query(OvertimeApplication).options(
            joinedload(OvertimeApplication.user)
        )
        
        if approver_role == "department_head":
            # 部门主任：查看本部门员工的pending申请
            query = query.join(User, OvertimeApplication.user_id == User.id).filter(
                and_(
                    OvertimeApplication.status == OvertimeStatus.PENDING.value,
                    User.department_id == (
                        self.db.query(User.department_id)
                        .filter(User.id == approver_id)
                        .scalar()
                    )
                )
            )
        elif approver_role == "vice_president":
            # 副总：查看分配给自己的pending申请
            query = query.filter(
                and_(
                    OvertimeApplication.status == OvertimeStatus.PENDING.value,
                    OvertimeApplication.assigned_approver_id == approver_id
                )
            )
        elif approver_role == "general_manager":
            # 总经理：查看pending申请（如果指定了assigned_approver_id，则必须是自己的）
            query = query.filter(
                and_(
                    OvertimeApplication.status == OvertimeStatus.PENDING.value,
                    or_(
                        OvertimeApplication.assigned_approver_id == None,
                        OvertimeApplication.assigned_approver_id == approver_id
                    )
                )
            )
        
        return (
            query.order_by(OvertimeApplication.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def get_all_by_date_range(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        user_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[OvertimeApplication]:
        """获取指定日期范围内的所有加班申请（管理员查询）"""
        query = self.db.query(OvertimeApplication).options(
            joinedload(OvertimeApplication.user)
        )
        
        if start_date:
            query = query.filter(
                OvertimeApplication.end_time >= datetime.combine(start_date, datetime.min.time())
            )
        
        if end_date:
            query = query.filter(
                OvertimeApplication.start_time <= datetime.combine(end_date, datetime.max.time())
            )
        
        if user_id:
            query = query.filter(OvertimeApplication.user_id == user_id)
        
        return (
            query.order_by(OvertimeApplication.start_time.desc(), OvertimeApplication.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

