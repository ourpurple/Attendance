from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date
from ..database import get_db
from ..models import LeaveApplication, User, UserRole, LeaveStatus
from ..schemas import LeaveApplicationCreate, LeaveApplicationUpdate, LeaveApplicationResponse, LeaveApproval
from ..security import get_current_user, get_current_active_admin
from ..approval_assigner import (
    assign_vice_president_for_leave,
    assign_general_manager_for_leave,
    can_approve_leave
)

router = APIRouter(prefix="/leave", tags=["请假管理"])


def get_required_approval_level(days: float) -> List[str]:
    """根据请假天数确定需要的审批层级"""
    if days <= 1:
        return ["department_head"]
    elif days <= 3:
        return ["department_head", "vice_president"]
    else:
        return ["department_head", "vice_president", "general_manager"]


@router.post("/", response_model=LeaveApplicationResponse, status_code=status.HTTP_201_CREATED)
def create_leave_application(
    leave_create: LeaveApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建请假申请"""
    # 验证日期
    if leave_create.end_date < leave_create.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="结束日期不能早于开始日期"
        )
    
    leave = LeaveApplication(
        user_id=current_user.id,
        start_date=leave_create.start_date,
        end_date=leave_create.end_date,
        days=leave_create.days,
        reason=leave_create.reason,
        status=LeaveStatus.PENDING,
        assigned_vp_id=leave_create.assigned_vp_id,
        assigned_gm_id=leave_create.assigned_gm_id
    )
    
    # 如果未手动指定，根据规则自动分配
    if not leave.assigned_vp_id and leave.days > 1:
        # 需要副总审批的申请，自动分配副总
        assigned_vp_id = assign_vice_president_for_leave(leave, current_user, db)
        if assigned_vp_id:
            leave.assigned_vp_id = assigned_vp_id
    
    if not leave.assigned_gm_id and leave.days > 3:
        # 需要总经理审批的申请，自动分配总经理
        assigned_gm_id = assign_general_manager_for_leave(leave, db)
        if assigned_gm_id:
            leave.assigned_gm_id = assigned_gm_id
    
    db.add(leave)
    db.commit()
    db.refresh(leave)
    
    return leave


@router.get("/my", response_model=List[LeaveApplicationResponse])
def get_my_leave_applications(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取我的请假申请"""
    leaves = db.query(LeaveApplication).filter(
        LeaveApplication.user_id == current_user.id
    ).order_by(LeaveApplication.created_at.desc()).offset(skip).limit(limit).all()

    # 收集所有审批人ID，便于查询姓名
    approver_ids = set()
    for leave in leaves:
        if leave.assigned_vp_id:
            approver_ids.add(leave.assigned_vp_id)
        if leave.assigned_gm_id:
            approver_ids.add(leave.assigned_gm_id)
        if leave.dept_approver_id:
            approver_ids.add(leave.dept_approver_id)
        if leave.vp_approver_id:
            approver_ids.add(leave.vp_approver_id)
        if leave.gm_approver_id:
            approver_ids.add(leave.gm_approver_id)

    approver_map = {}
    if approver_ids:
        approvers = db.query(User.id, User.real_name).filter(User.id.in_(approver_ids)).all()
        approver_map = {user.id: user.real_name for user in approvers}

    responses = []
    for leave in leaves:
        data = LeaveApplicationResponse.from_orm(leave).dict()
        data["assigned_vp_name"] = approver_map.get(leave.assigned_vp_id)
        data["assigned_gm_name"] = approver_map.get(leave.assigned_gm_id)
        data["dept_approver_name"] = approver_map.get(leave.dept_approver_id)
        data["vp_approver_name"] = approver_map.get(leave.vp_approver_id)
        data["gm_approver_name"] = approver_map.get(leave.gm_approver_id)
        responses.append(LeaveApplicationResponse(**data))

    return responses


@router.post("/{leave_id}/cancel", response_model=LeaveApplicationResponse)
def cancel_leave_application(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """撤回请假申请（只能撤回待审批状态的申请）"""
    leave = db.query(LeaveApplication).filter(LeaveApplication.id == leave_id).first()
    
    if not leave:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="请假申请不存在"
        )
    
    # 只有申请人本人可以撤回
    if leave.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能撤回自己的申请"
        )
    
    # 只能撤回待审批状态的申请
    if leave.status not in [LeaveStatus.PENDING, LeaveStatus.DEPT_APPROVED, LeaveStatus.VP_APPROVED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只能撤回待审批状态的申请"
        )
    
    leave.status = LeaveStatus.CANCELLED
    db.commit()
    db.refresh(leave)
    
    return leave


@router.get("/pending", response_model=List[LeaveApplicationResponse])
def get_pending_leave_applications(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取待我审批的请假申请"""
    # 根据用户角色获取不同的待审批申请
    query = db.query(LeaveApplication)
    
    if current_user.role == UserRole.DEPARTMENT_HEAD:
        # 部门主任：查看本部门待审批的申请
        query = query.join(User, LeaveApplication.user_id == User.id).filter(
            User.department_id == current_user.department_id,
            LeaveApplication.status == LeaveStatus.PENDING
        )
    elif current_user.role == UserRole.VICE_PRESIDENT:
        # 副总：查看分配给自己的、部门主任已批准待副总审批的申请
        query = query.filter(
            LeaveApplication.status == LeaveStatus.DEPT_APPROVED,
            LeaveApplication.assigned_vp_id == current_user.id
        )
    elif current_user.role == UserRole.GENERAL_MANAGER:
        # 总经理：查看分配给自己的、副总已批准待总经理审批的申请
        # 如果未指定总经理，则所有总经理都可以看到
        query = query.filter(
            LeaveApplication.status == LeaveStatus.VP_APPROVED
        ).filter(
            (LeaveApplication.assigned_gm_id == current_user.id) |
            (LeaveApplication.assigned_gm_id.is_(None))
        )
    elif current_user.role == UserRole.ADMIN:
        # 管理员：查看所有待审批的申请
        query = query.filter(LeaveApplication.status.in_([
            LeaveStatus.PENDING,
            LeaveStatus.DEPT_APPROVED,
            LeaveStatus.VP_APPROVED
        ]))
    else:
        # 普通员工没有审批权限
        return []
    
    leaves = query.order_by(LeaveApplication.created_at.desc()).offset(skip).limit(limit).all()
    return leaves


@router.get("/{leave_id}", response_model=LeaveApplicationResponse)
def get_leave_application(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取请假申请详情"""
    leave = db.query(LeaveApplication).filter(LeaveApplication.id == leave_id).first()
    if not leave:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="请假申请不存在"
        )
    
    # 权限检查：只有申请人、审批人或管理员可以查看
    if (current_user.id != leave.user_id and 
        current_user.role not in [UserRole.ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    # 获取申请人姓名
    applicant = db.query(User).filter(User.id == leave.user_id).first()
    applicant_name = applicant.real_name if applicant else f"用户{leave.user_id}"
    
    # 获取审批人姓名
    leave_dict = {
        "id": leave.id,
        "user_id": leave.user_id,
        "start_date": leave.start_date,
        "end_date": leave.end_date,
        "days": leave.days,
        "reason": leave.reason,
        "status": leave.status,
        "dept_approver_id": leave.dept_approver_id,
        "dept_approved_at": leave.dept_approved_at,
        "dept_comment": leave.dept_comment,
        "vp_approver_id": leave.vp_approver_id,
        "vp_approved_at": leave.vp_approved_at,
        "vp_comment": leave.vp_comment,
        "gm_approver_id": leave.gm_approver_id,
        "gm_approved_at": leave.gm_approved_at,
        "gm_comment": leave.gm_comment,
        "created_at": leave.created_at,
    }
    
    # 添加申请人姓名（作为额外字段，不在schema中）
    leave_dict["applicant_name"] = applicant_name
    
    # 查询审批人姓名
    if leave.assigned_vp_id:
        assigned_vp = db.query(User).filter(User.id == leave.assigned_vp_id).first()
        if assigned_vp:
            leave_dict["assigned_vp_name"] = assigned_vp.real_name
    
    if leave.assigned_gm_id:
        assigned_gm = db.query(User).filter(User.id == leave.assigned_gm_id).first()
        if assigned_gm:
            leave_dict["assigned_gm_name"] = assigned_gm.real_name
    
    if leave.dept_approver_id:
        dept_approver = db.query(User).filter(User.id == leave.dept_approver_id).first()
        if dept_approver:
            leave_dict["dept_approver_name"] = dept_approver.real_name
    
    if leave.vp_approver_id:
        vp_approver = db.query(User).filter(User.id == leave.vp_approver_id).first()
        if vp_approver:
            leave_dict["vp_approver_name"] = vp_approver.real_name
    
    if leave.gm_approver_id:
        gm_approver = db.query(User).filter(User.id == leave.gm_approver_id).first()
        if gm_approver:
            leave_dict["gm_approver_name"] = gm_approver.real_name
    
    return LeaveApplicationResponse(**leave_dict)


@router.put("/{leave_id}", response_model=LeaveApplicationResponse)
def update_leave_application(
    leave_id: int,
    leave_update: LeaveApplicationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新请假申请（仅申请人可修改未审批的申请）"""
    leave = db.query(LeaveApplication).filter(LeaveApplication.id == leave_id).first()
    if not leave:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="请假申请不存在"
        )
    
    # 权限检查：只有申请人可以修改
    if leave.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能修改自己的请假申请"
        )
    
    # 状态检查：只有待审批的申请可以修改
    if leave.status != LeaveStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只能修改待审批的申请"
        )
    
    update_data = leave_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(leave, field, value)
    
    db.commit()
    db.refresh(leave)
    
    return leave


@router.post("/{leave_id}/approve", response_model=LeaveApplicationResponse)
def approve_leave_application(
    leave_id: int,
    approval: LeaveApproval,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """审批请假申请"""
    leave = db.query(LeaveApplication).filter(LeaveApplication.id == leave_id).first()
    if not leave:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="请假申请不存在"
        )
    
    # 获取申请人信息
    applicant = db.query(User).filter(User.id == leave.user_id).first()
    
    # 检查审批权限
    can_approve, reason = can_approve_leave(leave, current_user, db)
    if not can_approve:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=reason
        )
    
    # 根据角色和当前状态进行审批
    now = datetime.now()
    
    if current_user.role == UserRole.DEPARTMENT_HEAD:
        # 部门主任审批
        if leave.status != LeaveStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该申请不在待部门主任审批状态"
            )
        
        leave.dept_approver_id = current_user.id
        leave.dept_approved_at = now
        leave.dept_comment = approval.comment
        
        if approval.approved:
            # 根据天数判断下一步
            if leave.days <= 1:
                leave.status = LeaveStatus.APPROVED
            else:
                leave.status = LeaveStatus.DEPT_APPROVED
        else:
            leave.status = LeaveStatus.REJECTED
    
    elif current_user.role == UserRole.VICE_PRESIDENT:
        # 副总审批（权限已在 can_approve_leave 中检查）
        leave.vp_approver_id = current_user.id
        leave.vp_approved_at = now
        leave.vp_comment = approval.comment
        
        if approval.approved:
            # 根据天数判断下一步
            if leave.days <= 3:
                leave.status = LeaveStatus.APPROVED
            else:
                leave.status = LeaveStatus.VP_APPROVED
        else:
            leave.status = LeaveStatus.REJECTED
    
    elif current_user.role == UserRole.GENERAL_MANAGER:
        # 总经理审批（权限已在 can_approve_leave 中检查）
        leave.gm_approver_id = current_user.id
        leave.gm_approved_at = now
        leave.gm_comment = approval.comment
        
        if approval.approved:
            leave.status = LeaveStatus.APPROVED
        else:
            leave.status = LeaveStatus.REJECTED
    
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    db.commit()
    db.refresh(leave)
    
    return leave


@router.delete("/{leave_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_leave_application(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """取消请假申请（仅申请人可取消）"""
    leave = db.query(LeaveApplication).filter(LeaveApplication.id == leave_id).first()
    if not leave:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="请假申请不存在"
        )
    
    # 权限检查
    if leave.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能取消自己的请假申请"
        )
    
    # 已批准的申请不能取消
    if leave.status == LeaveStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="已批准的申请不能取消"
        )
    
    leave.status = LeaveStatus.CANCELLED
    db.commit()
    
    return None


@router.delete("/{leave_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_leave_application(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除请假申请（仅申请人可删除已取消的申请）"""
    leave = db.query(LeaveApplication).filter(LeaveApplication.id == leave_id).first()
    if not leave:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="请假申请不存在"
        )
    
    # 权限检查：只有申请人或管理员可以删除
    if leave.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能删除自己的请假申请"
        )
    
    # 只能删除已取消的申请
    if leave.status != LeaveStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只能删除已取消的申请"
        )
    
    db.delete(leave)
    db.commit()
    
    return None


@router.get("/", response_model=List[LeaveApplicationResponse])
def list_leave_applications(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取所有请假申请（管理员）"""
    query = db.query(LeaveApplication)
    
    # 按日期范围筛选（检查请假日期是否与查询范围有重叠）
    if start_date:
        query = query.filter(LeaveApplication.end_date >= start_date)
    if end_date:
        query = query.filter(LeaveApplication.start_date <= end_date)
    
    # 按员工筛选
    if user_id:
        query = query.filter(LeaveApplication.user_id == user_id)
    
    leaves = query.order_by(
        LeaveApplication.created_at.desc()
    ).offset(skip).limit(limit).all()
    
    return leaves


