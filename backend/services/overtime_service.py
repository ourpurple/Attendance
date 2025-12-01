"""
加班服务
封装加班相关的业务逻辑
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session

from ..models import OvertimeApplication, User, OvertimeStatus, OvertimeType, UserRole
from ..repositories import OvertimeRepository, UserRepository
from ..exceptions import ValidationException, NotFoundException, PermissionDeniedException
from ..utils.transaction import transaction
from ..approval_assigner import assign_approver_for_overtime, can_approve_overtime


class OvertimeService:
    """加班服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        self.overtime_repo = OvertimeRepository(db)
        self.user_repo = UserRepository(db)
    
    @transaction
    def create_overtime_application(
        self,
        user: User,
        start_time: datetime,
        end_time: datetime,
        hours: float,
        days: float,
        reason: str,
        overtime_type: OvertimeType = OvertimeType.ACTIVE,
        assigned_approver_id: Optional[int] = None
    ) -> OvertimeApplication:
        """
        创建加班申请
        
        Args:
            user: 申请人
            start_time: 开始时间
            end_time: 结束时间
            hours: 加班时长（小时）
            days: 加班天数
            reason: 加班原因
            overtime_type: 加班类型
            assigned_approver_id: 指定的审批人ID（可选）
        
        Returns:
            加班申请对象
        """
        from ..models import UserRole, Department
        
        # 验证时间
        if end_time < start_time:
            raise ValidationException("结束时间不能早于开始时间")
        
        # 根据申请人角色处理审批人分配
        if user.role in [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD]:
            # 员工及部门主任加班：本部门主任直接审批完成（不需要前端指定）
            # 自动查找部门主任
            if not assigned_approver_id and user.department_id:
                dept = self.db.query(Department).filter(Department.id == user.department_id).first()
                if dept and dept.head_id:
                    head = self.user_repo.get(dept.head_id)
                    if head and head.is_active:
                        assigned_approver_id = head.id
        elif user.role == UserRole.VICE_PRESIDENT:
            # 副总加班：副总审批（默认本人，可手动选定其它副总）
            if not assigned_approver_id:
                # 默认本人审批
                assigned_approver_id = user.id
            else:
                # 验证指定的副总是否存在
                vp = self.user_repo.get(assigned_approver_id)
                if not vp or vp.role != UserRole.VICE_PRESIDENT or not vp.is_active:
                    raise ValidationException("指定的副总不存在或未激活")
        elif user.role == UserRole.GENERAL_MANAGER:
            # 总经理加班：总经理本人直接审批完成
            if not assigned_approver_id:
                assigned_approver_id = user.id
        
        # 创建加班申请
        overtime = self.overtime_repo.create(
            user_id=user.id,
            start_time=start_time,
            end_time=end_time,
            hours=hours,
            days=days,
            reason=reason,
            status=OvertimeStatus.PENDING.value,
            assigned_approver_id=assigned_approver_id,
            overtime_type=overtime_type
        )
        
        # 如果没有指定审批人，自动分配（对于员工和部门主任）
        if not assigned_approver_id and user.role in [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD]:
            approver_id = assign_approver_for_overtime(overtime, user, self.db)
            if approver_id:
                overtime.assigned_approver_id = approver_id
        
        return overtime
    
    def get_user_overtimes(
        self,
        user_id: int,
        status: Optional[OvertimeStatus] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[OvertimeApplication]:
        """获取用户的加班申请列表"""
        return self.overtime_repo.get_by_user(user_id, status, skip, limit)
    
    def get_pending_overtimes(
        self,
        approver: User,
        skip: int = 0,
        limit: int = 100
    ) -> List[OvertimeApplication]:
        """获取待审批的加班申请列表"""
        return self.overtime_repo.get_pending_by_approver(
            approver.id,
            approver.role.value,
            skip,
            limit
        )
    
    @transaction
    def approve_overtime(
        self,
        overtime_id: int,
        approver: User,
        approved: bool,
        comment: Optional[str] = None
    ) -> OvertimeApplication:
        """
        审批加班申请
        
        Args:
            overtime_id: 加班申请ID
            approver: 审批人
            approved: 是否通过
            comment: 审批意见
        
        Returns:
            加班申请对象
        """
        overtime = self.overtime_repo.get(overtime_id)
        if not overtime:
            raise NotFoundException("加班申请", overtime_id)
        
        # 检查权限
        can_approve, reason = can_approve_overtime(overtime, approver, self.db)
        if not can_approve:
            raise PermissionDeniedException(reason or "无权审批此申请")
        
        # 执行审批
        if approved:
            overtime.status = OvertimeStatus.APPROVED.value
        else:
            overtime.status = OvertimeStatus.REJECTED.value
        
        overtime.approver_id = approver.id
        overtime.approved_at = datetime.now()
        overtime.comment = comment
        
        return overtime
    
    @transaction
    def update_overtime_application(
        self,
        overtime_id: int,
        user: User,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        hours: Optional[float] = None,
        days: Optional[float] = None,
        reason: Optional[str] = None,
        overtime_type: Optional[OvertimeType] = None
    ) -> OvertimeApplication:
        """
        更新加班申请
        
        Args:
            overtime_id: 加班申请ID
            user: 当前用户
            start_time: 开始时间
            end_time: 结束时间
            hours: 加班时长（小时）
            days: 加班天数
            reason: 加班原因
            overtime_type: 加班类型
        
        Returns:
            加班申请对象
        """
        overtime = self.overtime_repo.get(overtime_id)
        if not overtime:
            raise NotFoundException("加班申请", overtime_id)
        
        # 权限检查：只有申请人或管理员可以更新
        if overtime.user_id != user.id and user.role != UserRole.ADMIN:
            raise PermissionDeniedException("只能更新自己的申请")
        
        # 状态检查：只能更新待审批状态的申请
        if overtime.status != OvertimeStatus.PENDING.value and user.role != UserRole.ADMIN:
            raise ValidationException("只能更新待审批状态的申请")
        
        # 更新字段
        update_data = {}
        if start_time is not None:
            update_data['start_time'] = start_time
        if end_time is not None:
            update_data['end_time'] = end_time
        if hours is not None:
            update_data['hours'] = hours
        if days is not None:
            # 验证天数格式
            if days % 0.5 != 0:
                raise ValidationException("加班天数只能是整数或整数.5（如1, 1.5, 2, 2.5）")
            update_data['days'] = days
        if reason is not None:
            update_data['reason'] = reason
        if overtime_type is not None:
            update_data['overtime_type'] = overtime_type
        
        # 验证时间
        final_start_time = update_data.get('start_time', overtime.start_time)
        final_end_time = update_data.get('end_time', overtime.end_time)
        if final_end_time < final_start_time:
            raise ValidationException("结束时间不能早于开始时间")
        
        return self.overtime_repo.update(overtime_id, **update_data)
    
    @transaction
    def cancel_overtime(self, overtime_id: int, user: User) -> OvertimeApplication:
        """取消加班申请"""
        overtime = self.overtime_repo.get(overtime_id)
        if not overtime:
            raise NotFoundException("加班申请", overtime_id)
        
        if overtime.user_id != user.id:
            raise PermissionDeniedException("只能取消自己的加班申请")
        
        if overtime.status in [OvertimeStatus.APPROVED.value, OvertimeStatus.REJECTED.value]:
            raise ValidationException("已审批的申请不能取消")
        
        overtime.status = OvertimeStatus.CANCELLED.value
        return overtime

