"""
审批分配工具模块
实现审批人分配的优先级逻辑：手动指定 > 分管关系 > 默认规则
"""

from sqlalchemy.orm import Session
from typing import Optional, Tuple
from .models import User, UserRole, LeaveApplication, OvertimeApplication, VicePresidentDepartment, Department


def assign_vice_president_for_leave(
    leave: LeaveApplication,
    applicant: User,
    db: Session
) -> Optional[int]:
    """
    为请假申请分配副总审批人
    
    优先级：
    1. 手动指定（assigned_vp_id）
    2. 分管关系（根据申请人部门查找分管副总）
    3. 默认规则（第一个激活的副总）
    
    Returns:
        分配的副总用户ID，如果找不到则返回None
    """
    # 优先级1：手动指定
    if leave.assigned_vp_id:
        # 验证指定的副总是否存在且角色正确
        vp = db.query(User).filter(
            User.id == leave.assigned_vp_id,
            User.role == UserRole.VICE_PRESIDENT,
            User.is_active == True
        ).first()
        if vp:
            return vp.id
    
    # 优先级2：分管关系
    if applicant.department_id:
        # 查找分管该部门的默认副总
        vp_dept = db.query(VicePresidentDepartment).join(
            User, VicePresidentDepartment.vice_president_id == User.id
        ).filter(
            VicePresidentDepartment.department_id == applicant.department_id,
            VicePresidentDepartment.is_default == True,
            User.role == UserRole.VICE_PRESIDENT,
            User.is_active == True
        ).first()
        
        if vp_dept:
            return vp_dept.vice_president_id
        
        # 如果没有默认分管，查找任意分管该部门的副总
        vp_dept = db.query(VicePresidentDepartment).join(
            User, VicePresidentDepartment.vice_president_id == User.id
        ).filter(
            VicePresidentDepartment.department_id == applicant.department_id,
            User.role == UserRole.VICE_PRESIDENT,
            User.is_active == True
        ).first()
        
        if vp_dept:
            return vp_dept.vice_president_id
    
    # 优先级3：默认规则（第一个激活的副总）
    first_vp = db.query(User).filter(
        User.role == UserRole.VICE_PRESIDENT,
        User.is_active == True
    ).order_by(User.id).first()
    
    return first_vp.id if first_vp else None


def assign_general_manager_for_leave(
    leave: LeaveApplication,
    db: Session
) -> Optional[int]:
    """
    为请假申请分配总经理审批人
    
    优先级：
    1. 手动指定（assigned_gm_id）
    2. 默认规则（第一个激活的总经理）
    
    Returns:
        分配的总经理用户ID，如果找不到则返回None
    """
    # 优先级1：手动指定
    if leave.assigned_gm_id:
        # 验证指定的总经理是否存在且角色正确
        gm = db.query(User).filter(
            User.id == leave.assigned_gm_id,
            User.role == UserRole.GENERAL_MANAGER,
            User.is_active == True
        ).first()
        if gm:
            return gm.id
    
    # 优先级2：默认规则（第一个激活的总经理）
    first_gm = db.query(User).filter(
        User.role == UserRole.GENERAL_MANAGER,
        User.is_active == True
    ).order_by(User.id).first()
    
    return first_gm.id if first_gm else None


def assign_approver_for_overtime(
    overtime: OvertimeApplication,
    applicant: User,
    db: Session
) -> Optional[int]:
    """
    为加班申请分配审批人
    
    优先级：
    1. 手动指定（assigned_approver_id）
    2. 分管关系（根据申请人部门查找分管副总）
    3. 默认规则（部门主任 > 第一个副总 > 第一个总经理）
    
    Returns:
        分配的审批人用户ID，如果找不到则返回None
    """
    # 优先级1：手动指定
    if overtime.assigned_approver_id:
        # 验证指定的审批人是否存在且角色正确
        approver = db.query(User).filter(
            User.id == overtime.assigned_approver_id,
            User.role.in_([
                UserRole.DEPARTMENT_HEAD,
                UserRole.VICE_PRESIDENT,
                UserRole.GENERAL_MANAGER
            ]),
            User.is_active == True
        ).first()
        if approver:
            return approver.id
    
    # 优先级2：分管关系（查找分管该部门的副总）
    if applicant.department_id:
        vp_dept = db.query(VicePresidentDepartment).join(
            User, VicePresidentDepartment.vice_president_id == User.id
        ).filter(
            VicePresidentDepartment.department_id == applicant.department_id,
            VicePresidentDepartment.is_default == True,
            User.role == UserRole.VICE_PRESIDENT,
            User.is_active == True
        ).first()
        
        if vp_dept:
            return vp_dept.vice_president_id
        
        # 如果没有默认分管，查找任意分管该部门的副总
        vp_dept = db.query(VicePresidentDepartment).join(
            User, VicePresidentDepartment.vice_president_id == User.id
        ).filter(
            VicePresidentDepartment.department_id == applicant.department_id,
            User.role == UserRole.VICE_PRESIDENT,
            User.is_active == True
        ).first()
        
        if vp_dept:
            return vp_dept.vice_president_id
    
    # 优先级3：默认规则
    # 3.1 部门主任（如果申请人有部门）
    if applicant.department_id:
        dept = db.query(Department).filter(Department.id == applicant.department_id).first()
        if dept and dept.head_id:
            head = db.query(User).filter(
                User.id == dept.head_id,
                User.is_active == True
            ).first()
            if head:
                return head.id
    
    # 3.2 第一个副总
    first_vp = db.query(User).filter(
        User.role == UserRole.VICE_PRESIDENT,
        User.is_active == True
    ).order_by(User.id).first()
    
    if first_vp:
        return first_vp.id
    
    # 3.3 第一个总经理
    first_gm = db.query(User).filter(
        User.role == UserRole.GENERAL_MANAGER,
        User.is_active == True
    ).order_by(User.id).first()
    
    return first_gm.id if first_gm else None


from typing import Tuple

def can_approve_leave(leave: LeaveApplication, approver: User, db: Session) -> Tuple[bool, str]:
    """
    检查审批人是否有权限审批该请假申请
    
    Returns:
        (是否可以审批, 原因说明)
    """
    # 获取申请人信息
    applicant = db.query(User).filter(User.id == leave.user_id).first()
    if not applicant:
        return False, "申请人不存在"
    
    # 特殊处理：副总可以审批自己的申请（如果状态是pending且assigned_vp_id是自己）
    if approver.role == UserRole.VICE_PRESIDENT and leave.user_id == approver.id:
        if leave.status == "pending" and leave.assigned_vp_id == approver.id:
            return True, ""
    
    # 特殊处理：总经理可以审批自己的申请（如果状态是pending）
    if approver.role == UserRole.GENERAL_MANAGER and leave.user_id == approver.id:
        if leave.status == "pending":
            return True, ""
    
    # 根据角色和状态检查
    if approver.role == UserRole.DEPARTMENT_HEAD:
        # 部门主任只能审批本部门的申请
        if leave.status != "pending":
            return False, "该申请不在待部门主任审批状态"
        if applicant.department_id != approver.department_id:
            return False, "只能审批本部门员工的申请"
        return True, ""
    
    elif approver.role == UserRole.VICE_PRESIDENT:
        # 副总可能同时是部门主任（head_id指向副总）
        # 情况1：作为部门head审批pending状态的申请
        if leave.status == "pending":
            # 情况1a：副总审批其他副总的申请（assigned_vp_id指向当前审批人）
            if applicant.role == UserRole.VICE_PRESIDENT and leave.assigned_vp_id == approver.id:
                return True, ""
            
            # 情况1b：检查副总是否是申请人所在部门的head
            if applicant.department_id:
                dept = db.query(Department).filter(Department.id == applicant.department_id).first()
                if dept and dept.head_id == approver.id:
                    return True, ""
            return False, "该申请不在待您审批状态"
        
        # 情况2：作为副总审批dept_approved状态的申请
        if leave.status != "dept_approved":
            return False, "该申请不在待副总审批状态"
        
        # 检查是否分配给自己
        assigned_vp_id = leave.assigned_vp_id
        if not assigned_vp_id:
            # 如果没有分配，尝试自动分配
            assigned_vp_id = assign_vice_president_for_leave(leave, applicant, db)
            if assigned_vp_id:
                leave.assigned_vp_id = assigned_vp_id
                db.commit()
        
        if assigned_vp_id != approver.id:
            return False, "该申请未分配给您审批"
        
        return True, ""
    
    elif approver.role == UserRole.GENERAL_MANAGER:
        # 总经理只能审批分配给自己的申请（如果有多个总经理）
        if leave.status != "vp_approved":
            return False, "该申请不在待总经理审批状态"
        
        # 检查是否分配给自己（如果指定了）
        if leave.assigned_gm_id and leave.assigned_gm_id != approver.id:
            return False, "该申请未分配给您审批"
        
        return True, ""
    
    elif approver.role == UserRole.ADMIN:
        # 管理员可以审批所有申请
        return True, ""
    
    return False, "权限不足"


def can_approve_overtime(overtime: OvertimeApplication, approver: User, db: Session) -> Tuple[bool, str]:
    """
    检查审批人是否有权限审批该加班申请
    
    Returns:
        (是否可以审批, 原因说明)
    """
    # 获取申请人信息
    applicant = db.query(User).filter(User.id == overtime.user_id).first()
    if not applicant:
        return False, "申请人不存在"
    
    if overtime.status != "pending":
        return False, "该申请不在待审批状态"
    
    # 特殊处理：副总可以审批自己的申请（如果assigned_approver_id是自己）
    if approver.role == UserRole.VICE_PRESIDENT and overtime.user_id == approver.id:
        if overtime.assigned_approver_id == approver.id:
            return True, ""
    
    # 特殊处理：总经理可以审批自己的申请
    if approver.role == UserRole.GENERAL_MANAGER and overtime.user_id == approver.id:
        return True, ""
    
    # 根据角色检查
    if approver.role == UserRole.DEPARTMENT_HEAD:
        # 部门主任只能审批本部门的申请
        if applicant.department_id != approver.department_id:
            return False, "只能审批本部门员工的申请"
        return True, ""
    
    elif approver.role == UserRole.VICE_PRESIDENT:
        # 副总只能审批分配给自己的申请
        assigned_approver_id = overtime.assigned_approver_id
        if not assigned_approver_id:
            # 如果没有分配，尝试自动分配
            assigned_approver_id = assign_approver_for_overtime(overtime, applicant, db)
            if assigned_approver_id:
                overtime.assigned_approver_id = assigned_approver_id
                db.commit()
        
        if assigned_approver_id != approver.id:
            return False, "该申请未分配给您审批"
        
        return True, ""
    
    elif approver.role == UserRole.GENERAL_MANAGER:
        # 总经理可以审批所有申请（如果没有指定）
        if overtime.assigned_approver_id and overtime.assigned_approver_id != approver.id:
            return False, "该申请未分配给您审批"
        return True, ""
    
    elif approver.role == UserRole.ADMIN:
        # 管理员可以审批所有申请
        return True, ""
    
    return False, "权限不足"

