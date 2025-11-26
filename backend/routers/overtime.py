"""
加班路由（重构版）
使用Service层架构
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import date
from ..database import get_db
from ..models import User, UserRole, OvertimeStatus, OvertimeApplication
from ..schemas import (
    OvertimeApplicationCreate, OvertimeApplicationUpdate,
    OvertimeApplicationResponse, OvertimeApproval
)
from ..security import get_current_user, get_current_active_admin
from ..services.overtime_service import OvertimeService
from ..services.wechat_message import send_approval_notification, send_approval_result_notification
from ..utils.response_utils import ResponseUtils
from ..exceptions import BusinessException, ValidationException, NotFoundException, PermissionDeniedException

router = APIRouter(prefix="/overtime", tags=["加班管理"])


def enrich_overtime_response(overtime, db: Session) -> OvertimeApplicationResponse:
    """
    丰富加班申请响应数据，添加审批人姓名等信息
    """
    from ..models import User
    
    data = OvertimeApplicationResponse.from_orm(overtime).model_dump()
    
    # 添加审批人姓名
    approver_ids = []
    if overtime.assigned_approver_id:
        approver_ids.append(overtime.assigned_approver_id)
    if overtime.approver_id:
        approver_ids.append(overtime.approver_id)
    
    if approver_ids:
        approvers = db.query(User.id, User.real_name).filter(User.id.in_(approver_ids)).all()
        approver_map = {user.id: user.real_name for user in approvers}
        
        data["assigned_approver_name"] = approver_map.get(overtime.assigned_approver_id)
        data["approver_name"] = approver_map.get(overtime.approver_id)
    
    # 添加申请人姓名
    if overtime.user:
        data["applicant_name"] = overtime.user.real_name
    
    return OvertimeApplicationResponse(**data)


@router.post("/", response_model=OvertimeApplicationResponse, status_code=status.HTTP_201_CREATED)
def create_overtime_application(
    overtime_create: OvertimeApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建加班申请"""
    try:
        from ..models import OvertimeType
        
        service = OvertimeService(db)
        overtime = service.create_overtime_application(
            user=current_user,
            start_time=overtime_create.start_time,
            end_time=overtime_create.end_time,
            hours=overtime_create.hours,
            days=overtime_create.days,
            reason=overtime_create.reason,
            overtime_type=overtime_create.overtime_type or OvertimeType.ACTIVE,
            assigned_approver_id=overtime_create.assigned_approver_id
        )
        
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
                        application_item=ResponseUtils.get_overtime_type_text(overtime),
                        application_time=ResponseUtils.get_overtime_application_time(overtime),
                        reason=ResponseUtils.get_overtime_reason(overtime)
                    )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"发送审批提醒消息失败: {str(e)}")
        
        return enrich_overtime_response(overtime, db)
    except (BusinessException, ValidationException, NotFoundException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


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
    """获取加班申请列表（管理员）"""
    try:
        service = OvertimeService(db)
        overtimes = service.overtime_repo.get_all_by_date_range(
            start_date=start_date,
            end_date=end_date,
            user_id=user_id,
            skip=skip,
            limit=limit
        )
        
        # Repository 已经加载了关联数据，直接使用
        if not overtimes:
            return []
        
        return [enrich_overtime_response(overtime, db) for overtime in overtimes]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/my", response_model=List[OvertimeApplicationResponse])
def get_my_overtime_applications(
    skip: int = 0,
    limit: int = 100,
    status: Optional[OvertimeStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取我的加班申请"""
    try:
        service = OvertimeService(db)
        overtimes = service.get_user_overtimes(
            user_id=current_user.id,
            status=status,
            skip=skip,
            limit=limit
        )
        
        # 需要加载关联数据（如果overtimes为空，直接返回）
        if not overtimes:
            return []
        
        overtime_ids = [ot.id for ot in overtimes]
        overtimes = db.query(OvertimeApplication).options(
            joinedload(OvertimeApplication.user)
        ).filter(
            OvertimeApplication.id.in_(overtime_ids)
        ).all()
        
        return [enrich_overtime_response(overtime, db) for overtime in overtimes]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/pending", response_model=List[OvertimeApplicationResponse])
def get_pending_overtime_applications(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取待我审批的加班申请"""
    try:
        service = OvertimeService(db)
        overtimes = service.get_pending_overtimes(
            approver=current_user,
            skip=skip,
            limit=limit
        )
        
        # 需要加载关联数据（如果overtimes为空，直接返回）
        if not overtimes:
            return []
        
        overtime_ids = [ot.id for ot in overtimes]
        overtimes = db.query(OvertimeApplication).options(
            joinedload(OvertimeApplication.user)
        ).filter(
            OvertimeApplication.id.in_(overtime_ids)
        ).all()
        
        return [enrich_overtime_response(overtime, db) for overtime in overtimes]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/{overtime_id}", response_model=OvertimeApplicationResponse)
def get_overtime_application(
    overtime_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取加班申请详情"""
    try:
        service = OvertimeService(db)
        overtime = service.overtime_repo.get(overtime_id)
        
        if not overtime:
            raise NotFoundException("加班申请", overtime_id)
        
        # 权限检查：只有申请人、审批人或管理员可以查看
        if (current_user.id != overtime.user_id and 
            current_user.role not in [UserRole.ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER]):
            raise PermissionDeniedException("无权查看此申请")
        
        # 加载关联数据
        overtime = db.query(OvertimeApplication).options(
            joinedload(OvertimeApplication.user)
        ).filter(OvertimeApplication.id == overtime_id).first()
        
        return enrich_overtime_response(overtime, db)
    except (BusinessException, NotFoundException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/{overtime_id}/cancel", response_model=OvertimeApplicationResponse)
def cancel_overtime_application(
    overtime_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """撤回加班申请（只能撤回待审批状态的申请）"""
    try:
        service = OvertimeService(db)
        overtime = service.cancel_overtime(overtime_id, current_user)
        
        # 加载关联数据
        overtime = db.query(OvertimeApplication).options(
            joinedload(OvertimeApplication.user)
        ).filter(OvertimeApplication.id == overtime_id).first()
        
        return enrich_overtime_response(overtime, db)
    except (BusinessException, NotFoundException, PermissionDeniedException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/{overtime_id}/approve", response_model=OvertimeApplicationResponse)
def approve_overtime_application(
    overtime_id: int,
    approval: OvertimeApproval,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """审批加班申请"""
    try:
        service = OvertimeService(db)
        overtime = service.approve_overtime(
            overtime_id=overtime_id,
            approver=current_user,
            approved=approval.approved,
            comment=approval.comment
        )
        
        # 发送审批结果通知
        try:
            applicant = db.query(User).filter(User.id == overtime.user_id).first()
            if applicant and applicant.wechat_openid:
                send_approval_result_notification(
                    applicant_openid=applicant.wechat_openid,
                    application_type="overtime",
                    application_id=overtime.id,
                    approved=approval.approved,
                    approver_name=current_user.real_name,
                    comment=approval.comment
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"发送审批结果通知失败: {str(e)}")
        
        # 加载关联数据
        overtime = db.query(OvertimeApplication).options(
            joinedload(OvertimeApplication.user)
        ).filter(OvertimeApplication.id == overtime_id).first()
        
        return enrich_overtime_response(overtime, db)
    except (BusinessException, NotFoundException, PermissionDeniedException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/{overtime_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_overtime_application(
    overtime_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除加班申请（只能删除已取消的申请）"""
    try:
        service = OvertimeService(db)
        overtime = service.overtime_repo.get(overtime_id)
        
        if not overtime:
            raise NotFoundException("加班申请", overtime_id)
        
        if overtime.user_id != current_user.id and current_user.role != UserRole.ADMIN:
            raise PermissionDeniedException("只能删除自己的申请")
        
        if overtime.status != OvertimeStatus.CANCELLED.value:
            raise ValidationException("只能删除已取消的申请")
        
        db.delete(overtime)
        db.commit()
        return None
    except (BusinessException, NotFoundException, PermissionDeniedException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/approvers", response_model=List[dict])
def get_overtime_approvers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取加班审批人列表"""
    try:
        from ..models import User
        
        # 根据当前用户角色返回不同的审批人列表
        approvers = []
        
        if current_user.role == UserRole.VICE_PRESIDENT:
            # 副总可以看到所有副总和总经理
            approvers = db.query(User).filter(
                User.role.in_([UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER]),
                User.is_active == True
            ).all()
        elif current_user.role == UserRole.GENERAL_MANAGER:
            # 总经理可以看到所有总经理
            approvers = db.query(User).filter(
                User.role == UserRole.GENERAL_MANAGER,
                User.is_active == True
            ).all()
        elif current_user.role in [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD]:
            # 员工和部门主任可以看到本部门的部门主任
            if current_user.department_id:
                approvers = db.query(User).filter(
                    User.department_id == current_user.department_id,
                    User.role == UserRole.DEPARTMENT_HEAD,
                    User.is_active == True
                ).all()
        
        return [
            {
                "id": approver.id,
                "real_name": approver.real_name,
                "role": approver.role.value
            }
            for approver in approvers
        ]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
