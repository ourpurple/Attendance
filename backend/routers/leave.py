"""
请假路由（重构版）
使用Service层架构
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, date
from ..database import get_db
from ..models import User, UserRole, LeaveStatus, LeaveType, Department, LeaveApplication
from ..schemas import (
    LeaveApplicationCreate, LeaveApplicationUpdate, 
    LeaveApplicationResponse, LeaveApproval
)
from ..security import get_current_user, get_current_active_admin
from ..services.leave_service import LeaveService
from ..services.wechat_message import send_approval_notification, send_approval_result_notification
from ..utils.response_utils import ResponseUtils
from ..exceptions import BusinessException, ValidationException, NotFoundException, PermissionDeniedException

router = APIRouter(prefix="/leave", tags=["请假管理"])


def enrich_leave_response(leave, db: Session, current_user: User) -> LeaveApplicationResponse:
    """
    丰富请假申请响应数据，添加审批人姓名等信息
    """
    from ..models import User
    
    data = LeaveApplicationResponse.from_orm(leave).model_dump()
    
    # 添加请假类型名称
    if not data.get("leave_type_name"):
        data["leave_type_name"] = leave.leave_type.name if leave.leave_type else None
    
    # 添加审批人姓名
    approver_ids = []
    if leave.assigned_vp_id:
        approver_ids.append(leave.assigned_vp_id)
    if leave.assigned_gm_id:
        approver_ids.append(leave.assigned_gm_id)
    if leave.dept_approver_id:
        approver_ids.append(leave.dept_approver_id)
    if leave.vp_approver_id:
        approver_ids.append(leave.vp_approver_id)
    if leave.gm_approver_id:
        approver_ids.append(leave.gm_approver_id)
    
    if approver_ids:
        approvers = db.query(User.id, User.real_name).filter(User.id.in_(approver_ids)).all()
        approver_map = {user.id: user.real_name for user in approvers}
        
        data["assigned_vp_name"] = approver_map.get(leave.assigned_vp_id)
        data["assigned_gm_name"] = approver_map.get(leave.assigned_gm_id)
        data["dept_approver_name"] = approver_map.get(leave.dept_approver_id)
        data["vp_approver_name"] = approver_map.get(leave.vp_approver_id)
        data["gm_approver_name"] = approver_map.get(leave.gm_approver_id)
    
    # 对于pending状态的申请，根据申请人角色添加待审批人信息
    if leave.status == LeaveStatus.PENDING:
        applicant = db.query(User).filter(User.id == leave.user_id).first()
        if applicant:
            if applicant.role in [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD]:
                # 员工和部门主任：待部门主任审批
                if applicant.department_id:
                    dept = db.query(Department).filter(Department.id == applicant.department_id).first()
                    if dept and dept.head_id:
                        head = db.query(User).filter(User.id == dept.head_id).first()
                        if head:
                            data["pending_dept_head_name"] = head.real_name
            elif applicant.role == UserRole.VICE_PRESIDENT:
                # 副总：待副总审批（assigned_vp_id）
                if leave.assigned_vp_id:
                    vp = db.query(User).filter(User.id == leave.assigned_vp_id).first()
                    if vp:
                        data["pending_vp_name"] = vp.real_name
            elif applicant.role == UserRole.GENERAL_MANAGER:
                # 总经理：待总经理审批（本人）
                if leave.assigned_gm_id:
                    gm = db.query(User).filter(User.id == leave.assigned_gm_id).first()
                    if gm:
                        data["pending_gm_name"] = gm.real_name
                else:
                    # 如果assigned_gm_id为空，使用申请人ID（总经理本人）
                    data["pending_gm_name"] = applicant.real_name
    
    return LeaveApplicationResponse(**data)


@router.post("/", response_model=LeaveApplicationResponse, status_code=status.HTTP_201_CREATED)
def create_leave_application(
    leave_create: LeaveApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建请假申请"""
    try:
        service = LeaveService(db)
        leave = service.create_leave_application(
            user=current_user,
            start_date=leave_create.start_date,
            end_date=leave_create.end_date,
            days=leave_create.days,
            reason=leave_create.reason,
            leave_type_id=leave_create.leave_type_id,
            assigned_vp_id=leave_create.assigned_vp_id,
            assigned_gm_id=leave_create.assigned_gm_id
        )
        
        # 发送审批提醒消息给第一个审批人
        try:
            application_item = ResponseUtils.get_leave_type_name(leave)
            application_time = ResponseUtils.get_leave_application_time(leave)
            reason_text = ResponseUtils.get_leave_reason(leave)
            
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
                    reason=reason_text
                )
        except Exception as e:
            # 消息推送失败不影响主流程，只记录日志
            import logging
            logging.getLogger(__name__).error(f"发送审批提醒消息失败: {str(e)}")
        
        return enrich_leave_response(leave, db, current_user)
    except (BusinessException, ValidationException, NotFoundException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


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
    """获取请假申请列表（管理员）"""
    try:
        service = LeaveService(db)
        leaves = service.leave_repo.get_all_by_date_range(
            start_date=start_date,
            end_date=end_date,
            user_id=user_id,
            skip=skip,
            limit=limit
        )
        
        # Repository 已经加载了关联数据，直接使用
        if not leaves:
            return []
        
        responses = []
        for leave in leaves:
            data = enrich_leave_response(leave, db, current_user).model_dump()
            data["applicant_name"] = leave.user.real_name if leave.user else f"用户{leave.user_id}"
            responses.append(LeaveApplicationResponse(**data))
        
        return responses
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/my", response_model=List[LeaveApplicationResponse])
def get_my_leave_applications(
    skip: int = 0,
    limit: int = 100,
    status: Optional[LeaveStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取我的请假申请"""
    try:
        service = LeaveService(db)
        leaves = service.get_user_leaves(
            user_id=current_user.id,
            status=status,
            skip=skip,
            limit=limit
        )
        
        # 需要加载关联数据（如果leaves为空，直接返回）
        if not leaves:
            return []
        
        leave_ids = [leave.id for leave in leaves]
        leaves = db.query(LeaveApplication).options(
            joinedload(LeaveApplication.leave_type)
        ).filter(
            LeaveApplication.id.in_(leave_ids)
        ).all()
        
        return [enrich_leave_response(leave, db, current_user) for leave in leaves]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/pending", response_model=List[LeaveApplicationResponse])
def get_pending_leave_applications(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取待我审批的请假申请"""
    try:
        service = LeaveService(db)
        leaves = service.get_pending_leaves(
            approver=current_user,
            skip=skip,
            limit=limit
        )
        
        # 需要加载关联数据（如果leaves为空，直接返回）
        if not leaves:
            return []
        
        leave_ids = [leave.id for leave in leaves]
        leaves = db.query(LeaveApplication).options(
            joinedload(LeaveApplication.leave_type),
            joinedload(LeaveApplication.user)
        ).filter(
            LeaveApplication.id.in_(leave_ids)
        ).all()
        
        responses = []
        for leave in leaves:
            data = enrich_leave_response(leave, db, current_user).model_dump()
            data["applicant_name"] = leave.user.real_name if leave.user else f"用户{leave.user_id}"
            responses.append(LeaveApplicationResponse(**data))
        
        return responses
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/{leave_id}", response_model=LeaveApplicationResponse)
def get_leave_application(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取请假申请详情"""
    try:
        service = LeaveService(db)
        leave = service.leave_repo.get(leave_id)
        
        if not leave:
            raise NotFoundException("请假申请", leave_id)
        
        # 权限检查：只有申请人、审批人或管理员可以查看
        if (current_user.id != leave.user_id and 
            current_user.role not in [UserRole.ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER]):
            raise PermissionDeniedException("无权查看此申请")
        
        # 加载关联数据
        leave = db.query(LeaveApplication).options(
            joinedload(LeaveApplication.leave_type),
            joinedload(LeaveApplication.user)
        ).filter(LeaveApplication.id == leave_id).first()
        
        return enrich_leave_response(leave, db, current_user)
    except (BusinessException, NotFoundException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/{leave_id}/cancel", response_model=LeaveApplicationResponse)
def cancel_leave_application(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """撤回请假申请（只能撤回待审批状态的申请）"""
    try:
        service = LeaveService(db)
        leave = service.cancel_leave(leave_id, current_user)
        
        # 加载关联数据
        leave = db.query(LeaveApplication).options(
            joinedload(LeaveApplication.leave_type)
        ).filter(LeaveApplication.id == leave_id).first()
        
        return enrich_leave_response(leave, db, current_user)
    except (BusinessException, NotFoundException, PermissionDeniedException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/{leave_id}/approve", response_model=LeaveApplicationResponse)
def approve_leave_application(
    leave_id: int,
    approval: LeaveApproval,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """审批请假申请"""
    try:
        service = LeaveService(db)
        leave = service.approve_leave(
            leave_id=leave_id,
            approver=current_user,
            approved=approval.approved,
            comment=approval.comment
        )
        
        # 发送审批结果通知
        try:
            applicant = db.query(User).filter(User.id == leave.user_id).first()
            if applicant and applicant.wechat_openid:
                send_approval_result_notification(
                    applicant_openid=applicant.wechat_openid,
                    application_type="leave",
                    application_id=leave.id,
                    approved=approval.approved,
                    approver_name=current_user.real_name,
                    comment=approval.comment
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"发送审批结果通知失败: {str(e)}")
        
        # 加载关联数据
        leave = db.query(LeaveApplication).options(
            joinedload(LeaveApplication.leave_type),
            joinedload(LeaveApplication.user)
        ).filter(LeaveApplication.id == leave_id).first()
        
        return enrich_leave_response(leave, db, current_user)
    except (BusinessException, NotFoundException, PermissionDeniedException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/{leave_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_leave_application(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除请假申请（只能删除已取消的申请）"""
    try:
        service = LeaveService(db)
        leave = service.leave_repo.get(leave_id)
        
        if not leave:
            raise NotFoundException("请假申请", leave_id)
        
        if leave.user_id != current_user.id and current_user.role != UserRole.ADMIN:
            raise PermissionDeniedException("只能删除自己的申请")
        
        if leave.status != LeaveStatus.CANCELLED.value:
            raise ValidationException("只能删除已取消的申请")
        
        db.delete(leave)
        db.commit()
        return None
    except (BusinessException, NotFoundException, PermissionDeniedException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
