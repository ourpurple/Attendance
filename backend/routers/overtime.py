from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date
from ..database import get_db
from ..models import OvertimeApplication, User, UserRole, OvertimeStatus
from ..schemas import OvertimeApplicationCreate, OvertimeApplicationUpdate, OvertimeApplicationResponse, OvertimeApproval
from ..security import get_current_user, get_current_active_admin
from ..approval_assigner import assign_approver_for_overtime, can_approve_overtime

router = APIRouter(prefix="/overtime", tags=["加班管理"])


@router.post("/", response_model=OvertimeApplicationResponse, status_code=status.HTTP_201_CREATED)
def create_overtime_application(
    overtime_create: OvertimeApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建加班申请"""
    # 验证时间
    if overtime_create.end_time < overtime_create.start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="结束时间不能早于开始时间"
        )
    
    overtime = OvertimeApplication(
        user_id=current_user.id,
        start_time=overtime_create.start_time,
        end_time=overtime_create.end_time,
        hours=overtime_create.hours,
        days=overtime_create.days,
        reason=overtime_create.reason,
        status=OvertimeStatus.PENDING,
        assigned_approver_id=overtime_create.assigned_approver_id
    )
    
    # 如果未手动指定，根据规则自动分配
    if not overtime.assigned_approver_id:
        assigned_approver_id = assign_approver_for_overtime(overtime, current_user, db)
        if assigned_approver_id:
            overtime.assigned_approver_id = assigned_approver_id
    
    db.add(overtime)
    db.commit()
    db.refresh(overtime)
    
    return overtime


@router.post("/{overtime_id}/cancel", response_model=OvertimeApplicationResponse)
def cancel_overtime_application(
    overtime_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """撤回加班申请（只能撤回待审批状态的申请）"""
    overtime = db.query(OvertimeApplication).filter(OvertimeApplication.id == overtime_id).first()
    
    if not overtime:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="加班申请不存在"
        )
    
    # 只有申请人本人可以撤回
    if overtime.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能撤回自己的申请"
        )
    
    # 只能撤回待审批状态的申请
    if overtime.status != OvertimeStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只能撤回待审批状态的申请"
        )
    
    overtime.status = OvertimeStatus.CANCELLED
    db.commit()
    db.refresh(overtime)
    
    return overtime


@router.get("/my", response_model=List[OvertimeApplicationResponse])
def get_my_overtime_applications(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取我的加班申请"""
    overtimes = db.query(OvertimeApplication).filter(
        OvertimeApplication.user_id == current_user.id
    ).order_by(OvertimeApplication.created_at.desc()).offset(skip).limit(limit).all()

    approver_ids = set()
    for ot in overtimes:
        if ot.assigned_approver_id:
            approver_ids.add(ot.assigned_approver_id)
        if ot.approver_id:
            approver_ids.add(ot.approver_id)
    
    approver_map = {}
    if approver_ids:
        approvers = db.query(User.id, User.real_name).filter(User.id.in_(approver_ids)).all()
        approver_map = {user.id: user.real_name for user in approvers}

    responses = []
    for ot in overtimes:
        data = OvertimeApplicationResponse.from_orm(ot).dict()
        data["assigned_approver_name"] = approver_map.get(ot.assigned_approver_id)
        data["approver_name"] = approver_map.get(ot.approver_id)
        responses.append(OvertimeApplicationResponse(**data))

    return responses


@router.get("/pending", response_model=List[OvertimeApplicationResponse])
def get_pending_overtime_applications(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取待我审批的加班申请"""
    # 只有部门主任及以上可以审批加班
    if current_user.role not in [UserRole.DEPARTMENT_HEAD, UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER, UserRole.ADMIN]:
        return []
    
    query = db.query(OvertimeApplication).filter(
        OvertimeApplication.status == OvertimeStatus.PENDING
    )
    
    # 部门主任只能看到本部门的加班申请
    if current_user.role == UserRole.DEPARTMENT_HEAD:
        query = query.join(User, OvertimeApplication.user_id == User.id).filter(
            User.department_id == current_user.department_id
        )
    # 副总只能看到分配给自己的申请
    elif current_user.role == UserRole.VICE_PRESIDENT:
        query = query.filter(
            OvertimeApplication.assigned_approver_id == current_user.id
        )
    # 总经理可以看到所有申请（如果未指定）或分配给自己的申请
    elif current_user.role == UserRole.GENERAL_MANAGER:
        query = query.filter(
            (OvertimeApplication.assigned_approver_id == current_user.id) |
            (OvertimeApplication.assigned_approver_id.is_(None))
        )
    
    overtimes = query.order_by(OvertimeApplication.created_at.desc()).offset(skip).limit(limit).all()
    return overtimes


@router.get("/{overtime_id}", response_model=OvertimeApplicationResponse)
def get_overtime_application(
    overtime_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取加班申请详情"""
    overtime = db.query(OvertimeApplication).filter(OvertimeApplication.id == overtime_id).first()
    if not overtime:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="加班申请不存在"
        )
    
    # 权限检查：只有申请人、审批人或管理员可以查看
    if (current_user.id != overtime.user_id and 
        current_user.role not in [UserRole.ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    # 获取申请人姓名
    applicant = db.query(User).filter(User.id == overtime.user_id).first()
    applicant_name = applicant.real_name if applicant else f"用户{overtime.user_id}"
    
    # 获取审批人姓名
    overtime_dict = {
        "id": overtime.id,
        "user_id": overtime.user_id,
        "start_time": overtime.start_time,
        "end_time": overtime.end_time,
        "hours": overtime.hours,
        "days": overtime.days,
        "reason": overtime.reason,
        "status": overtime.status,
        "assigned_approver_id": overtime.assigned_approver_id,
        "approver_id": overtime.approver_id,
        "approved_at": overtime.approved_at,
        "comment": overtime.comment,
        "created_at": overtime.created_at,
    }
    
    # 添加申请人姓名（作为额外字段，不在schema中）
    overtime_dict["applicant_name"] = applicant_name
    
    # 查询审批人姓名
    if overtime.assigned_approver_id:
        assigned_approver = db.query(User).filter(User.id == overtime.assigned_approver_id).first()
        if assigned_approver:
            overtime_dict["assigned_approver_name"] = assigned_approver.real_name
    
    if overtime.approver_id:
        approver = db.query(User).filter(User.id == overtime.approver_id).first()
        if approver:
            overtime_dict["approver_name"] = approver.real_name
    
    return OvertimeApplicationResponse(**overtime_dict)


@router.put("/{overtime_id}", response_model=OvertimeApplicationResponse)
def update_overtime_application(
    overtime_id: int,
    overtime_update: OvertimeApplicationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新加班申请（仅申请人可修改未审批的申请）"""
    overtime = db.query(OvertimeApplication).filter(OvertimeApplication.id == overtime_id).first()
    if not overtime:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="加班申请不存在"
        )
    
    # 权限检查：只有申请人可以修改
    if overtime.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能修改自己的加班申请"
        )
    
    # 状态检查：只有待审批的申请可以修改
    if overtime.status != OvertimeStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只能修改待审批的申请"
        )
    
    update_data = overtime_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(overtime, field, value)
    
    db.commit()
    db.refresh(overtime)
    
    return overtime


@router.post("/{overtime_id}/approve", response_model=OvertimeApplicationResponse)
def approve_overtime_application(
    overtime_id: int,
    approval: OvertimeApproval,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """审批加班申请"""
    overtime = db.query(OvertimeApplication).filter(OvertimeApplication.id == overtime_id).first()
    if not overtime:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="加班申请不存在"
        )
    
    # 获取申请人信息
    applicant = db.query(User).filter(User.id == overtime.user_id).first()
    if not applicant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="申请人不存在"
        )
    
    # 检查审批权限
    can_approve, reason = can_approve_overtime(overtime, current_user, db)
    if not can_approve:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=reason
        )
    
    # 审批
    overtime.approver_id = current_user.id
    overtime.approved_at = datetime.now()
    overtime.comment = approval.comment
    overtime.status = OvertimeStatus.APPROVED if approval.approved else OvertimeStatus.REJECTED
    
    db.commit()
    db.refresh(overtime)
    
    return overtime


@router.delete("/{overtime_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_overtime_application(
    overtime_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """取消加班申请（仅申请人可取消）"""
    overtime = db.query(OvertimeApplication).filter(OvertimeApplication.id == overtime_id).first()
    if not overtime:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="加班申请不存在"
        )
    
    # 权限检查
    if overtime.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能取消自己的加班申请"
        )
    
    # 已批准的申请不能取消
    if overtime.status == OvertimeStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="已批准的申请不能取消"
        )
    
    overtime.status = OvertimeStatus.CANCELLED
    db.commit()
    
    return None


@router.delete("/{overtime_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_overtime_application(
    overtime_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除加班申请（仅申请人可删除已取消的申请）"""
    overtime = db.query(OvertimeApplication).filter(OvertimeApplication.id == overtime_id).first()
    if not overtime:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="加班申请不存在"
        )
    
    # 权限检查：只有申请人或管理员可以删除
    if overtime.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能删除自己的加班申请"
        )
    
    # 只能删除已取消的申请
    if overtime.status != OvertimeStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只能删除已取消的申请"
        )
    
    db.delete(overtime)
    db.commit()
    
    return None


@router.get("/", response_model=List[OvertimeApplicationResponse])
def list_overtime_applications(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取所有加班申请（管理员）"""
    query = db.query(OvertimeApplication)
    
    # 按日期范围筛选（按加班开始时间）
    if start_date:
        query = query.filter(func.date(OvertimeApplication.start_time) >= start_date)
    if end_date:
        query = query.filter(func.date(OvertimeApplication.start_time) <= end_date)
    
    # 按员工筛选
    if user_id:
        query = query.filter(OvertimeApplication.user_id == user_id)
    
    overtimes = query.order_by(
        OvertimeApplication.created_at.desc()
    ).offset(skip).limit(limit).all()
    
    return overtimes


