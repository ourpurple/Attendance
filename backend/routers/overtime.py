from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date
from ..database import get_db
from ..models import OvertimeApplication, User, UserRole, OvertimeStatus, OvertimeType
from ..schemas import OvertimeApplicationCreate, OvertimeApplicationUpdate, OvertimeApplicationResponse, OvertimeApproval
from ..security import get_current_user, get_current_active_admin
from ..approval_assigner import assign_approver_for_overtime, can_approve_overtime
from ..services.wechat_message import send_approval_notification, send_approval_result_notification

router = APIRouter(prefix="/overtime", tags=["加班管理"])


def format_datetime_value(value: Optional[datetime]) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M")
    if value:
        return str(value)
    return ""


def build_overtime_application_detail(overtime: OvertimeApplication) -> str:
    start_str = format_datetime_value(overtime.start_time)
    end_str = format_datetime_value(overtime.end_time)
    if start_str and end_str:
        detail = f"{start_str} 至 {end_str}"
    else:
        detail = start_str or end_str or ""
    if overtime.hours is not None:
        detail = f"{detail} 共{overtime.hours}小时" if detail else f"共{overtime.hours}小时"
    return detail


def get_overtime_application_item(overtime: OvertimeApplication) -> str:
    if overtime.overtime_type == OvertimeType.PASSIVE:
        return "被动加班"
    if overtime.overtime_type == OvertimeType.ACTIVE:
        return "主动加班"
    return "加班"


def get_overtime_application_time(overtime: OvertimeApplication) -> str:
    return format_datetime_value(getattr(overtime, "created_at", None) or datetime.now())


def get_overtime_reason(overtime: OvertimeApplication) -> str:
    return overtime.reason or "无"


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
        assigned_approver_id=overtime_create.assigned_approver_id,
        overtime_type=overtime_create.overtime_type or OvertimeType.ACTIVE
    )
    
    # 根据申请人角色自动分配审批人
    if current_user.role in [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD]:
        # 员工及部门主任加班：本部门主任直接审批完成（不需要前端指定）
        # 自动查找部门主任
        if current_user.department_id:
            from ..models import Department
            dept = db.query(Department).filter(Department.id == current_user.department_id).first()
            if dept and dept.head_id:
                head = db.query(User).filter(
                    User.id == dept.head_id,
                    User.is_active == True
                ).first()
                if head:
                    overtime.assigned_approver_id = head.id
    
    elif current_user.role == UserRole.VICE_PRESIDENT:
        # 副总加班：副总审批（默认本人，可手动选定其它副总）
        if not overtime.assigned_approver_id:
            # 默认本人审批
            overtime.assigned_approver_id = current_user.id
        else:
            # 验证指定的副总是否存在
            vp = db.query(User).filter(
                User.id == overtime.assigned_approver_id,
                User.role == UserRole.VICE_PRESIDENT,
                User.is_active == True
            ).first()
            if not vp:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="指定的副总不存在或未激活"
                )
    
    elif current_user.role == UserRole.GENERAL_MANAGER:
        # 总经理加班：总经理本人直接审批完成
        # 不需要分配审批人，状态直接设为已批准（或者保持pending，由总经理本人审批）
        # 这里保持pending状态，由审批接口处理
        pass
    
    db.add(overtime)
    db.commit()
    db.refresh(overtime)
    
    # 发送审批提醒消息给审批人
    try:
        if overtime.assigned_approver_id:
            approver = db.query(User).filter(User.id == overtime.assigned_approver_id).first()
            if approver and approver.wechat_openid:
                send_approval_notification(
                    approver_openid=approver.wechat_openid,
                    application_type="overtime",
                    application_id=overtime.id,
                    applicant_name=current_user.real_name,
                    application_item=get_overtime_application_item(overtime),
                    application_time=get_overtime_application_time(overtime),
                    application_detail=build_overtime_application_detail(overtime),
                    reason=get_overtime_reason(overtime)
                )
    except Exception as e:
        # 消息推送失败不影响主流程，只记录日志
        import logging
        logging.getLogger(__name__).error(f"发送审批提醒消息失败: {str(e)}")
    
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
    # 总经理可以看到：
    # 1. 总经理自己的申请（user_id是自己，assigned_approver_id可能是None）
    # 2. 分配给自己的申请（assigned_approver_id是自己）
    # 3. 未指定审批人的申请（assigned_approver_id是None）
    elif current_user.role == UserRole.GENERAL_MANAGER:
        query = query.filter(
            (OvertimeApplication.user_id == current_user.id) |
            (OvertimeApplication.assigned_approver_id == current_user.id) |
            (OvertimeApplication.assigned_approver_id.is_(None))
        )
    
    overtimes = query.order_by(OvertimeApplication.created_at.desc()).offset(skip).limit(limit).all()
    
    # 收集所有申请人ID，查询申请人姓名
    applicant_ids = [ot.user_id for ot in overtimes]
    applicant_map = {}
    if applicant_ids:
        applicants = db.query(User.id, User.real_name).filter(User.id.in_(applicant_ids)).all()
        applicant_map = {user.id: user.real_name for user in applicants}
    
    # 构建响应，添加申请人姓名
    responses = []
    for ot in overtimes:
        data = OvertimeApplicationResponse.from_orm(ot).dict()
        data["applicant_name"] = applicant_map.get(ot.user_id, f"用户{ot.user_id}")
        responses.append(OvertimeApplicationResponse(**data))
    
    return responses


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
    
    # 发送审批结果通知给申请人
    try:
        if applicant and applicant.wechat_openid:
            send_approval_result_notification(
                applicant_openid=applicant.wechat_openid,
                application_type="overtime",
                application_id=overtime.id,
                applicant_name=applicant.real_name,
                application_item=get_overtime_application_item(overtime),
                approved=approval.approved,
                approver_name=current_user.real_name,
                approval_date=(overtime.approved_at.strftime("%Y-%m-%d") if overtime.approved_at else datetime.now().strftime("%Y-%m-%d"))
            )
    except Exception as e:
        # 消息推送失败不影响主流程，只记录日志
        import logging
        logging.getLogger(__name__).error(f"发送审批结果通知失败: {str(e)}")
    
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
    
    # 收集所有审批人ID，便于查询姓名
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
    
    # 构建响应，添加审批人姓名
    responses = []
    for ot in overtimes:
        data = OvertimeApplicationResponse.from_orm(ot).dict()
        data["assigned_approver_name"] = approver_map.get(ot.assigned_approver_id)
        data["approver_name"] = approver_map.get(ot.approver_id)
        responses.append(OvertimeApplicationResponse(**data))
    
    return responses


