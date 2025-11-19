from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date
from ..database import get_db
from ..models import LeaveApplication, User, UserRole, LeaveStatus, Department, LeaveType
from ..schemas import LeaveApplicationCreate, LeaveApplicationUpdate, LeaveApplicationResponse, LeaveApproval
from ..security import get_current_user, get_current_active_admin
from ..approval_assigner import (
    assign_vice_president_for_leave,
    assign_general_manager_for_leave,
    can_approve_leave
)
from ..services.wechat_message import send_approval_notification, send_approval_result_notification

router = APIRouter(prefix="/leave", tags=["请假管理"])


def to_leave_response(leave: LeaveApplication, extra: Optional[dict] = None) -> LeaveApplicationResponse:
    data = LeaveApplicationResponse.from_orm(leave).model_dump()
    if extra:
        data.update(extra)
    if not data.get("leave_type_name"):
        data["leave_type_name"] = leave.leave_type.name if leave.leave_type else None
    if extra:
        data.update(extra)
    return LeaveApplicationResponse(**data)


def format_datetime_value(value: Optional[datetime]) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time()).strftime("%Y-%m-%d %H:%M")
    if value:
        return str(value)
    return ""


def format_date_value(value: Optional[date]) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, date):
        return value.strftime("%Y-%m-%d")
    if value:
        return str(value)
    return ""


def build_leave_application_detail(leave: LeaveApplication) -> str:
    start_str = format_date_value(leave.start_date)
    end_str = format_date_value(leave.end_date)
    if start_str and end_str:
        return f"{start_str} 至 {end_str} 共{leave.days}天"
    return start_str or end_str or ""


def get_leave_type_name(leave: LeaveApplication, db: Session, preset: Optional[str] = None) -> str:
    if preset:
        return preset
    if leave.leave_type and leave.leave_type.name:
        return leave.leave_type.name
    if leave.leave_type_id:
        leave_type = db.query(LeaveType).filter(LeaveType.id == leave.leave_type_id).first()
        if leave_type:
            return leave_type.name
    return "普通请假"


def get_leave_application_time(leave: LeaveApplication) -> str:
    return format_datetime_value(getattr(leave, "created_at", None) or datetime.now())


def get_leave_reason(leave: LeaveApplication) -> str:
    return leave.reason or "无"


def get_active_leave_type(db: Session, leave_type_id: int) -> LeaveType:
    leave_type = db.query(LeaveType).filter(
        LeaveType.id == leave_type_id,
        LeaveType.is_active == True
    ).first()
    if not leave_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请选择有效的请假类型"
        )
    return leave_type


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
    
    leave_type = get_active_leave_type(db, leave_create.leave_type_id)
    leave_type_name = leave_type.name if leave_type else "普通请假"
    
    leave = LeaveApplication(
        user_id=current_user.id,
        start_date=leave_create.start_date,
        end_date=leave_create.end_date,
        days=leave_create.days,
        reason=leave_create.reason,
        status=LeaveStatus.PENDING,
        assigned_vp_id=leave_create.assigned_vp_id,
        assigned_gm_id=leave_create.assigned_gm_id,
        leave_type_id=leave_type.id
    )
    
    # 根据申请人角色和请假天数自动分配审批人
    if current_user.role in [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD]:
        # 员工及部门主任请假：不需要前端指定审批人，系统自动分配
        # 1天：部门主任直接审批完成（不需要分配副总和总经理）
        # 1天以上，3天以下（含3天）：部门主任审批 → 部门分管副总审批
        # 3天以上（不含3天）：部门主任审批 → 部门分管副总审批 → 总经理审批
        if leave.days > 1:
            # 需要副总审批
            assigned_vp_id = assign_vice_president_for_leave(leave, current_user, db)
            if assigned_vp_id:
                leave.assigned_vp_id = assigned_vp_id
        
        if leave.days > 3:
            # 需要总经理审批
            assigned_gm_id = assign_general_manager_for_leave(leave, db)
            if assigned_gm_id:
                leave.assigned_gm_id = assigned_gm_id
    
    elif current_user.role == UserRole.VICE_PRESIDENT:
        # 副总请假：
        # 3天以下（含3天）：副总审批（默认本人，可手动选定其它副总）
        # 3天以上（不含3天）：副总审批（默认本人，可手动选定其它副总） → 总经理审批
        if not leave.assigned_vp_id:
            # 默认本人审批
            leave.assigned_vp_id = current_user.id
        else:
            # 验证指定的副总是否存在
            vp = db.query(User).filter(
                User.id == leave.assigned_vp_id,
                User.role == UserRole.VICE_PRESIDENT,
                User.is_active == True
            ).first()
            if not vp:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="指定的副总不存在或未激活"
                )
        
        if leave.days > 3:
            # 需要总经理审批
            assigned_gm_id = assign_general_manager_for_leave(leave, db)
            if assigned_gm_id:
                leave.assigned_gm_id = assigned_gm_id
    
    elif current_user.role == UserRole.GENERAL_MANAGER:
        # 总经理请假：总经理本人直接审批完成
        # 不需要分配审批人，状态直接设为已批准（或者保持pending，由总经理本人审批）
        # 这里保持pending状态，由审批接口处理
        # 设置assigned_gm_id为自己，以便显示正确的审批人姓名
        if not leave.assigned_gm_id:
            leave.assigned_gm_id = current_user.id
    
    db.add(leave)
    db.commit()
    db.refresh(leave)
    
    # 发送审批提醒消息给第一个审批人
    try:
        # 确保正确获取请假类型名称
        application_item = get_leave_type_name(leave, db, leave_type_name)
        application_time = get_leave_application_time(leave)
        application_detail = build_leave_application_detail(leave)
        reason_text = get_leave_reason(leave)
        first_approver = None
        if current_user.role in [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD]:
            # 员工和部门主任：第一个审批人是部门主任
            if current_user.department_id:
                dept = db.query(Department).filter(Department.id == current_user.department_id).first()
                if dept and dept.head_id:
                    first_approver = db.query(User).filter(
                        User.id == dept.head_id,
                        User.is_active == True
                    ).first()
                # 如果部门没有设置head_id，查找该部门中角色为部门主任的用户
                if not first_approver:
                    first_approver = db.query(User).filter(
                        User.department_id == current_user.department_id,
                        User.role == UserRole.DEPARTMENT_HEAD,
                        User.is_active == True
                    ).first()
        elif current_user.role == UserRole.VICE_PRESIDENT:
            # 副总：第一个审批人是assigned_vp_id
            if leave.assigned_vp_id:
                first_approver = db.query(User).filter(User.id == leave.assigned_vp_id).first()
        elif current_user.role == UserRole.GENERAL_MANAGER:
            # 总经理：第一个审批人是assigned_gm_id（自己）
            if leave.assigned_gm_id:
                first_approver = db.query(User).filter(User.id == leave.assigned_gm_id).first()
        
        if first_approver and first_approver.wechat_openid:
            send_approval_notification(
                approver_openid=first_approver.wechat_openid,
                application_type="leave",
                application_id=leave.id,
                applicant_name=current_user.real_name,
                application_item=application_item,
                application_time=application_time,
                application_detail=application_detail,
                reason=reason_text
            )
    except Exception as e:
        # 消息推送失败不影响主流程，只记录日志
        import logging
        logging.getLogger(__name__).error(f"发送审批提醒消息失败: {str(e)}")
    
    return to_leave_response(leave)


@router.get("/my", response_model=List[LeaveApplicationResponse])
def get_my_leave_applications(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取我的请假申请"""
    leaves_query = db.query(LeaveApplication).options(joinedload(LeaveApplication.leave_type)).filter(
        LeaveApplication.user_id == current_user.id
    )
    
    leaves = leaves_query.order_by(LeaveApplication.created_at.desc()).offset(skip).limit(limit).all()

    leave_type_map = {}
    type_ids = {leave.leave_type_id for leave in leaves if leave.leave_type_id}
    if type_ids:
        types = db.query(LeaveType.id, LeaveType.name).filter(LeaveType.id.in_(type_ids)).all()
        leave_type_map = {t.id: t.name for t in types}
    
    # 收集所有审批人ID，便于查询姓名
    approver_ids = set()
    department_ids = set()  # 用于查询部门主任
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
        # 对于pending状态的申请，需要查询申请人的部门主任
        # 同时，如果是总经理申请且assigned_gm_id为空，需要包含申请人ID
        if leave.status == LeaveStatus.PENDING:
            applicant = db.query(User).filter(User.id == leave.user_id).first()
            if applicant:
                if applicant.department_id:
                    department_ids.add(applicant.department_id)
                # 如果是总经理申请且assigned_gm_id为空，需要包含申请人ID以便查询姓名
                if applicant.role == UserRole.GENERAL_MANAGER and not leave.assigned_gm_id:
                    approver_ids.add(leave.user_id)

    approver_map = {}
    if approver_ids:
        approvers = db.query(User.id, User.real_name).filter(User.id.in_(approver_ids)).all()
        approver_map = {user.id: user.real_name for user in approvers}
    
    # 查询部门主任（用于pending状态的申请）
    dept_to_head_map = {}
    if department_ids:
        departments = db.query(Department).filter(Department.id.in_(department_ids)).all()
        dept_head_ids = [dept.head_id for dept in departments if dept.head_id]
        if dept_head_ids:
            dept_heads = db.query(User.id, User.real_name).filter(User.id.in_(dept_head_ids)).all()
            dept_head_id_to_name = {user.id: user.real_name for user in dept_heads}
            # 建立部门ID到部门主任姓名的映射
            for dept in departments:
                if dept.head_id and dept.head_id in dept_head_id_to_name:
                    dept_to_head_map[dept.id] = dept_head_id_to_name[dept.head_id]
        
        # 如果部门没有设置head_id，尝试查找该部门中角色为部门主任的用户
        for dept in departments:
            if dept.id not in dept_to_head_map:
                # 查找该部门中角色为部门主任的用户
                dept_head = db.query(User).filter(
                    User.department_id == dept.id,
                    User.role == UserRole.DEPARTMENT_HEAD,
                    User.is_active == True
                ).first()
                if dept_head:
                    dept_to_head_map[dept.id] = dept_head.real_name
    
    # 建立申请人ID到部门ID的映射
    applicant_to_dept_map = {}
    if department_ids:
        applicants = db.query(User.id, User.department_id).filter(
            User.id.in_([leave.user_id for leave in leaves if leave.status == LeaveStatus.PENDING])
        ).all()
        applicant_to_dept_map = {app.id: app.department_id for app in applicants if app.department_id}

    # 获取所有申请人的信息，用于判断角色
    applicant_ids = [leave.user_id for leave in leaves]
    applicants_map = {}
    if applicant_ids:
        applicants = db.query(User.id, User.role, User.department_id).filter(User.id.in_(applicant_ids)).all()
        applicants_map = {app.id: app for app in applicants}
    
    responses = []
    for leave in leaves:
        data = LeaveApplicationResponse.from_orm(leave).dict()
        data["assigned_vp_name"] = approver_map.get(leave.assigned_vp_id)
        data["assigned_gm_name"] = approver_map.get(leave.assigned_gm_id)
        data["dept_approver_name"] = approver_map.get(leave.dept_approver_id)
        data["vp_approver_name"] = approver_map.get(leave.vp_approver_id)
        data["gm_approver_name"] = approver_map.get(leave.gm_approver_id)
        data["leave_type_name"] = leave_type_map.get(leave.leave_type_id) or (
            leave.leave_type.name if leave.leave_type else None
        )
        
        # 对于pending状态的申请，根据申请人角色添加待审批人信息
        if leave.status == LeaveStatus.PENDING:
            applicant = applicants_map.get(leave.user_id)
            if applicant:
                if applicant.role in [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD]:
                    # 员工和部门主任：待部门主任审批
                    applicant_dept_id = applicant.department_id
                    if applicant_dept_id and applicant_dept_id in dept_to_head_map:
                        data["pending_dept_head_name"] = dept_to_head_map[applicant_dept_id]
                elif applicant.role == UserRole.VICE_PRESIDENT:
                    # 副总：待副总审批（assigned_vp_id）
                    if leave.assigned_vp_id:
                        data["pending_vp_name"] = approver_map.get(leave.assigned_vp_id)
                elif applicant.role == UserRole.GENERAL_MANAGER:
                    # 总经理：待总经理审批（本人）
                    if leave.assigned_gm_id:
                        data["pending_gm_name"] = approver_map.get(leave.assigned_gm_id)
                    else:
                        # 如果assigned_gm_id为空，使用申请人ID（总经理本人）
                        data["pending_gm_name"] = approver_map.get(leave.user_id)
        
        responses.append(to_leave_response(leave, data))

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
    
    return to_leave_response(leave)


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
        # 副总：查看分配给自己的申请
        # 1. 副总自己的申请（pending状态，assigned_vp_id是自己）
        # 2. 部门主任已批准待副总审批的申请（dept_approved状态，assigned_vp_id是自己）
        query = query.filter(
            LeaveApplication.assigned_vp_id == current_user.id
        ).filter(
            (LeaveApplication.status == LeaveStatus.PENDING) |
            (LeaveApplication.status == LeaveStatus.DEPT_APPROVED)
        )
    elif current_user.role == UserRole.GENERAL_MANAGER:
        # 总经理：查看分配给自己的申请
        # 1. 总经理自己的申请（pending状态）
        # 2. 副总已批准待总经理审批的申请（vp_approved状态，assigned_gm_id是自己或未指定）
        query = query.filter(
            (
                (LeaveApplication.status == LeaveStatus.PENDING) &
                (LeaveApplication.user_id == current_user.id)
            ) |
            (
                (LeaveApplication.status == LeaveStatus.VP_APPROVED) &
                (
                    (LeaveApplication.assigned_gm_id == current_user.id) |
                    (LeaveApplication.assigned_gm_id.is_(None))
                )
            )
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
    
    query = query.options(joinedload(LeaveApplication.leave_type))
    leaves = query.order_by(LeaveApplication.created_at.desc()).offset(skip).limit(limit).all()
    
    leave_type_map = {}
    type_ids = {leave.leave_type_id for leave in leaves if leave.leave_type_id}
    if type_ids:
        types = db.query(LeaveType.id, LeaveType.name).filter(LeaveType.id.in_(type_ids)).all()
        leave_type_map = {t.id: t.name for t in types}
    
    # 收集所有申请人ID，查询申请人姓名
    applicant_ids = [leave.user_id for leave in leaves]
    applicant_map = {}
    if applicant_ids:
        applicants = db.query(User.id, User.real_name).filter(User.id.in_(applicant_ids)).all()
        applicant_map = {user.id: user.real_name for user in applicants}
    
    # 构建响应，添加申请人姓名
    responses = []
    for leave in leaves:
        data = LeaveApplicationResponse.from_orm(leave).dict()
        data["applicant_name"] = applicant_map.get(leave.user_id, f"用户{leave.user_id}")
        data["leave_type_name"] = leave_type_map.get(leave.leave_type_id)
        responses.append(to_leave_response(leave, data))
    
    return responses


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
        "leave_type_id": leave.leave_type_id,
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
    
    leave_dict["leave_type_name"] = leave.leave_type.name if leave.leave_type else None
    
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
    if "leave_type_id" in update_data:
        leave_type = get_active_leave_type(db, update_data["leave_type_id"])
        update_data["leave_type_id"] = leave_type.id
    for field, value in update_data.items():
        setattr(leave, field, value)
    
    db.commit()
    db.refresh(leave)
    
    return to_leave_response(leave)


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
        # 如果是副总审批自己的申请（pending状态），需要特殊处理
        if leave.status == LeaveStatus.PENDING and leave.user_id == current_user.id:
            # 副总审批自己的申请，直接完成
            leave.vp_approver_id = current_user.id
            leave.vp_approved_at = now
            leave.vp_comment = approval.comment
            
            if approval.approved:
                # 根据天数判断下一步
                if leave.days <= 3:
                    leave.status = LeaveStatus.APPROVED
                else:
                    # 需要总经理审批
                    leave.status = LeaveStatus.VP_APPROVED
            else:
                leave.status = LeaveStatus.REJECTED
        else:
            # 正常的副总审批流程（dept_approved状态）
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
        # 如果是总经理审批自己的申请（pending状态），需要特殊处理
        if leave.status == LeaveStatus.PENDING and leave.user_id == current_user.id:
            # 总经理审批自己的申请，直接完成
            leave.gm_approver_id = current_user.id
            leave.gm_approved_at = now
            leave.gm_comment = approval.comment
            
            if approval.approved:
                leave.status = LeaveStatus.APPROVED
            else:
                leave.status = LeaveStatus.REJECTED
        else:
            # 正常的总经理审批流程（vp_approved状态）
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
    
    # 发送消息通知
    try:
        # 获取申请人信息（如果之前没有获取）
        if not applicant:
            applicant = db.query(User).filter(User.id == leave.user_id).first()
        
        application_item = get_leave_type_name(leave, db)
        application_time = get_leave_application_time(leave)
        application_detail = build_leave_application_detail(leave)
        reason_text = get_leave_reason(leave)
        
        if approval.approved:
            # 审批通过
            if leave.status == LeaveStatus.APPROVED:
                # 审批完成，给申请人发送结果通知
                if applicant and applicant.wechat_openid:
                    send_approval_result_notification(
                        applicant_openid=applicant.wechat_openid,
                        application_type="leave",
                        application_id=leave.id,
                        applicant_name=applicant.real_name,
                        application_item=application_item,
                        approved=True,
                        approver_name=current_user.real_name,
                        approval_date=now.strftime("%Y-%m-%d")
                    )
            elif leave.status == LeaveStatus.DEPT_APPROVED:
                # 部门主任已批准，需要副总审批，给副总发送消息
                if leave.assigned_vp_id:
                    next_approver = db.query(User).filter(User.id == leave.assigned_vp_id).first()
                    if next_approver and next_approver.wechat_openid:
                        send_approval_notification(
                            approver_openid=next_approver.wechat_openid,
                            application_type="leave",
                            application_id=leave.id,
                            applicant_name=applicant.real_name if applicant else "未知",
                            application_item=application_item,
                            application_time=application_time,
                            application_detail=application_detail,
                            reason=reason_text,
                            status_text="待副总审批"
                        )
            elif leave.status == LeaveStatus.VP_APPROVED:
                # 副总已批准，需要总经理审批，给总经理发送消息
                if leave.assigned_gm_id:
                    next_approver = db.query(User).filter(User.id == leave.assigned_gm_id).first()
                    if next_approver and next_approver.wechat_openid:
                        send_approval_notification(
                            approver_openid=next_approver.wechat_openid,
                            application_type="leave",
                            application_id=leave.id,
                            applicant_name=applicant.real_name if applicant else "未知",
                            application_item=application_item,
                            application_time=application_time,
                            application_detail=application_detail,
                            reason=reason_text,
                            status_text="待总经理审批"
                        )
        else:
            # 审批拒绝，给申请人发送结果通知
            if applicant and applicant.wechat_openid:
                send_approval_result_notification(
                    applicant_openid=applicant.wechat_openid,
                    application_type="leave",
                    application_id=leave.id,
                    applicant_name=applicant.real_name,
                    application_item=application_item,
                    approved=False,
                    approver_name=current_user.real_name,
                    approval_date=now.strftime("%Y-%m-%d")
                )
    except Exception as e:
        # 消息推送失败不影响主流程，只记录日志
        import logging
        logging.getLogger(__name__).error(f"发送审批消息失败: {str(e)}")
    
    return to_leave_response(leave)


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
    leave_type_id: Optional[int] = None,
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
    
    if leave_type_id:
        query = query.filter(LeaveApplication.leave_type_id == leave_type_id)
    
    leaves = query.order_by(
        LeaveApplication.created_at.desc()
    ).offset(skip).limit(limit).all()
    
    # 收集所有审批人ID，便于查询姓名
    approver_ids = set()
    department_ids = set()  # 用于查询部门主任
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
        # 对于pending状态的申请，需要查询申请人的部门主任
        if leave.status == LeaveStatus.PENDING:
            applicant = db.query(User).filter(User.id == leave.user_id).first()
            if applicant and applicant.department_id:
                department_ids.add(applicant.department_id)
            # 如果是总经理申请且assigned_gm_id为空，需要包含申请人ID以便查询姓名
            if applicant and applicant.role == UserRole.GENERAL_MANAGER and not leave.assigned_gm_id:
                approver_ids.add(leave.user_id)

    approver_map = {}
    if approver_ids:
        approvers = db.query(User.id, User.real_name).filter(User.id.in_(approver_ids)).all()
        approver_map = {user.id: user.real_name for user in approvers}
    
    # 查询部门主任（用于pending状态的申请）
    dept_to_head_map = {}
    if department_ids:
        departments = db.query(Department).filter(Department.id.in_(department_ids)).all()
        dept_head_ids = [dept.head_id for dept in departments if dept.head_id]
        if dept_head_ids:
            dept_heads = db.query(User.id, User.real_name).filter(User.id.in_(dept_head_ids)).all()
            dept_head_id_to_name = {user.id: user.real_name for user in dept_heads}
            # 建立部门ID到部门主任姓名的映射
            for dept in departments:
                if dept.head_id and dept.head_id in dept_head_id_to_name:
                    dept_to_head_map[dept.id] = dept_head_id_to_name[dept.head_id]
        
        # 如果部门没有设置head_id，尝试查找该部门中角色为部门主任的用户
        for dept in departments:
            if dept.id not in dept_to_head_map:
                # 查找该部门中角色为部门主任的用户
                dept_head = db.query(User).filter(
                    User.department_id == dept.id,
                    User.role == UserRole.DEPARTMENT_HEAD,
                    User.is_active == True
                ).first()
                if dept_head:
                    dept_to_head_map[dept.id] = dept_head.real_name

    # 获取所有申请人的信息，用于判断角色
    applicant_ids = [leave.user_id for leave in leaves]
    applicants_map = {}
    if applicant_ids:
        applicants = db.query(User.id, User.role, User.department_id).filter(User.id.in_(applicant_ids)).all()
        applicants_map = {app.id: app for app in applicants}
    
    responses = []
    for leave in leaves:
        data = LeaveApplicationResponse.from_orm(leave).dict()
        data["assigned_vp_name"] = approver_map.get(leave.assigned_vp_id)
        data["assigned_gm_name"] = approver_map.get(leave.assigned_gm_id)
        data["dept_approver_name"] = approver_map.get(leave.dept_approver_id)
        data["vp_approver_name"] = approver_map.get(leave.vp_approver_id)
        data["gm_approver_name"] = approver_map.get(leave.gm_approver_id)
        
        # 对于pending状态的申请，根据申请人角色添加待审批人信息
        if leave.status == LeaveStatus.PENDING:
            applicant = applicants_map.get(leave.user_id)
            if applicant:
                if applicant.role in [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD]:
                    # 员工和部门主任：待部门主任审批
                    applicant_dept_id = applicant.department_id
                    if applicant_dept_id and applicant_dept_id in dept_to_head_map:
                        data["pending_dept_head_name"] = dept_to_head_map[applicant_dept_id]
                elif applicant.role == UserRole.VICE_PRESIDENT:
                    # 副总：待副总审批（assigned_vp_id）
                    if leave.assigned_vp_id:
                        data["pending_vp_name"] = approver_map.get(leave.assigned_vp_id)
                elif applicant.role == UserRole.GENERAL_MANAGER:
                    # 总经理：待总经理审批（本人）
                    if leave.assigned_gm_id:
                        data["pending_gm_name"] = approver_map.get(leave.assigned_gm_id)
                    else:
                        # 如果assigned_gm_id为空，使用申请人ID（总经理本人）
                        data["pending_gm_name"] = approver_map.get(leave.user_id)
        
        data["leave_type_name"] = leave.leave_type.name if leave.leave_type else None
        responses.append(to_leave_response(leave, data))

    return responses


