"""
请假服务
封装请假相关的业务逻辑
"""
from typing import Optional, List
from datetime import datetime, date
from sqlalchemy.orm import Session

from ..models import LeaveApplication, User, LeaveStatus, LeaveType
from ..repositories import LeaveRepository, UserRepository
from ..exceptions import ValidationException, NotFoundException, PermissionDeniedException
from ..utils.transaction import transaction
from ..utils.date_utils import DateUtils
from ..approval_assigner import (
    assign_vice_president_for_leave,
    assign_general_manager_for_leave,
    can_approve_leave
)


class LeaveService:
    """请假服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        self.leave_repo = LeaveRepository(db)
        self.user_repo = UserRepository(db)
    
    def get_required_approval_level(self, days: float) -> List[str]:
        """根据请假天数确定需要的审批层级"""
        if days <= 1:
            return ["department_head"]
        elif days <= 3:
            return ["department_head", "vice_president"]
        else:
            return ["department_head", "vice_president", "general_manager"]
    
    @transaction
    def create_leave_application(
        self,
        user: User,
        start_date: datetime,
        end_date: datetime,
        days: float,
        reason: str,
        leave_type_id: int,
        assigned_vp_id: Optional[int] = None,
        assigned_gm_id: Optional[int] = None
    ) -> LeaveApplication:
        """
        创建请假申请
        
        Args:
            user: 申请人
            start_date: 开始日期
            end_date: 结束日期
            days: 请假天数
            reason: 请假原因
            leave_type_id: 请假类型ID
            assigned_vp_id: 指定的副总ID（可选）
            assigned_gm_id: 指定的总经理ID（可选）
        
        Returns:
            请假申请对象
        """
        from ..models import UserRole
        
        # 验证时间
        if end_date < start_date:
            raise ValidationException("结束时间不能早于开始时间")
        
        # 验证请假类型
        leave_type = self.leave_repo.get_active_leave_type(leave_type_id)
        if not leave_type:
            raise NotFoundException("请假类型", leave_type_id)
        
        # 根据申请人角色处理审批人分配
        if user.role in [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD]:
            # 员工及部门主任请假：系统自动分配
            # 1天：部门主任直接审批完成
            # 1天以上，3天以下（含3天）：部门主任审批 → 部门分管副总审批
            # 3天以上（不含3天）：部门主任审批 → 部门分管副总审批 → 总经理审批
            assigned_vp_id = None
            assigned_gm_id = None
            if days > 1:
                # 需要副总审批，稍后分配
                pass
            if days > 3:
                # 需要总经理审批，稍后分配
                pass
        elif user.role == UserRole.VICE_PRESIDENT:
            # 副总请假：
            # 3天以下（含3天）：副总审批（默认本人，可手动选定其它副总）
            # 3天以上（不含3天）：副总审批（默认本人，可手动选定其它副总） → 总经理审批
            if not assigned_vp_id:
                # 默认本人审批
                assigned_vp_id = user.id
            else:
                # 验证指定的副总是否存在
                vp = self.user_repo.get(assigned_vp_id)
                if not vp or vp.role != UserRole.VICE_PRESIDENT or not vp.is_active:
                    raise ValidationException("指定的副总不存在或未激活")
            
            if days > 3:
                # 需要总经理审批，稍后分配
                assigned_gm_id = None
        elif user.role == UserRole.GENERAL_MANAGER:
            # 总经理请假：总经理本人直接审批完成
            # 设置assigned_gm_id为自己，以便显示正确的审批人姓名
            if not assigned_gm_id:
                assigned_gm_id = user.id
        
        # 创建请假申请
        leave = self.leave_repo.create(
            user_id=user.id,
            start_date=start_date,
            end_date=end_date,
            days=days,
            reason=reason,
            status=LeaveStatus.PENDING.value,
            leave_type_id=leave_type_id,
            assigned_vp_id=assigned_vp_id,
            assigned_gm_id=assigned_gm_id
        )
        
        # 根据天数自动分配审批人（对于员工和部门主任）
        if user.role in [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD]:
            approval_levels = self.get_required_approval_level(days)
            
            if "vice_president" in approval_levels:
                assigned_vp_id = assign_vice_president_for_leave(leave, user, self.db)
                if assigned_vp_id:
                    leave.assigned_vp_id = assigned_vp_id
            
            if "general_manager" in approval_levels:
                assigned_gm_id = assign_general_manager_for_leave(leave, self.db)
                if assigned_gm_id:
                    leave.assigned_gm_id = assigned_gm_id
        elif user.role == UserRole.VICE_PRESIDENT and days > 3:
            # 副总请假超过3天，需要总经理审批
            assigned_gm_id = assign_general_manager_for_leave(leave, self.db)
            if assigned_gm_id:
                leave.assigned_gm_id = assigned_gm_id
        
        return leave
    
    def get_user_leaves(
        self,
        user_id: int,
        status: Optional[LeaveStatus] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[LeaveApplication]:
        """获取用户的请假申请列表"""
        return self.leave_repo.get_by_user(user_id, status, skip, limit)
    
    def get_pending_leaves(
        self,
        approver: User,
        skip: int = 0,
        limit: int = 100
    ) -> List[LeaveApplication]:
        """获取待审批的请假申请列表"""
        return self.leave_repo.get_pending_by_approver(
            approver.id,
            approver.role.value,
            skip,
            limit
        )
    
    @transaction
    def approve_leave(
        self,
        leave_id: int,
        approver: User,
        approved: bool,
        comment: Optional[str] = None
    ) -> LeaveApplication:
        """
        审批请假申请
        
        Args:
            leave_id: 请假申请ID
            approver: 审批人
            approved: 是否通过
            comment: 审批意见
        
        Returns:
            请假申请对象
        """
        leave = self.leave_repo.get(leave_id)
        if not leave:
            raise NotFoundException("请假申请", leave_id)
        
        # 检查权限
        can_approve, reason = can_approve_leave(leave, approver, self.db)
        if not can_approve:
            raise PermissionDeniedException(reason or "无权审批此申请")
        
        # 执行审批
        if approver.role.value == "department_head":
            if approved:
                # 根据请假天数决定最终状态
                # 1天及以下：部门主任审批后直接完成
                # 1天以上：需要继续审批流程
                required_levels = self.get_required_approval_level(leave.days)
                if len(required_levels) == 1:  # 只需要部门主任审批
                    leave.status = LeaveStatus.APPROVED.value
                else:  # 需要更多审批
                    leave.status = LeaveStatus.DEPT_APPROVED.value
                leave.dept_approver_id = approver.id
                leave.dept_approved_at = datetime.now()
                leave.dept_comment = comment
            else:
                leave.status = LeaveStatus.REJECTED.value
                leave.dept_approver_id = approver.id
                leave.dept_approved_at = datetime.now()
                leave.dept_comment = comment
        elif approver.role.value == "vice_president":
            if approved:
                # 根据请假天数决定最终状态
                # 3天及以下：副总审批后直接完成
                # 3天以上：需要总经理审批
                required_levels = self.get_required_approval_level(leave.days)
                if len(required_levels) == 2:  # 只需要部门和副总审批
                    leave.status = LeaveStatus.APPROVED.value
                else:  # 需要总经理审批
                    leave.status = LeaveStatus.VP_APPROVED.value
                leave.vp_approver_id = approver.id
                leave.vp_approved_at = datetime.now()
                leave.vp_comment = comment
            else:
                leave.status = LeaveStatus.REJECTED.value
                leave.vp_approver_id = approver.id
                leave.vp_approved_at = datetime.now()
                leave.vp_comment = comment
        elif approver.role.value == "general_manager":
            if approved:
                leave.status = LeaveStatus.APPROVED.value
                leave.gm_approver_id = approver.id
                leave.gm_approved_at = datetime.now()
                leave.gm_comment = comment
            else:
                leave.status = LeaveStatus.REJECTED.value
                leave.gm_approver_id = approver.id
                leave.gm_approved_at = datetime.now()
                leave.gm_comment = comment
        
        return leave
    
    @transaction
    def cancel_leave(self, leave_id: int, user: User) -> LeaveApplication:
        """取消请假申请"""
        leave = self.leave_repo.get(leave_id)
        if not leave:
            raise NotFoundException("请假申请", leave_id)
        
        if leave.user_id != user.id:
            raise PermissionDeniedException("只能取消自己的请假申请")
        
        if leave.status in [LeaveStatus.APPROVED.value, LeaveStatus.REJECTED.value]:
            raise ValidationException("已审批的申请不能取消")
        
        leave.status = LeaveStatus.CANCELLED.value
        return leave

