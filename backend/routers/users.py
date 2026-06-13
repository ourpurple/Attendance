from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import (
    AnnualLeaveAdjustment,
    Attendance,
    AttendanceViewer,
    CompLeaveAdjustment,
    Department,
    LeaveApplication,
    OvertimeApplication,
    PassiveOvertimeAdjustment,
    User,
    UserRole,
    VicePresidentDepartment,
)
from ..schemas import UserResponse, UserCreate, UserUpdate, PasswordChange, AnnualLeaveInfo, CompLeaveInfo
from ..security import get_current_user, get_current_active_admin, get_password_hash, verify_password
from ..leave_balance import compute_annual_leave, compute_comp_leave
from .system_settings import is_comp_leave_yearly_reset_enabled

router = APIRouter(prefix="/users", tags=["用户管理"])


@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return current_user


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    password_change: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """修改当前用户密码"""
    # 验证旧密码
    if not verify_password(password_change.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="原密码错误"
        )
    
    # 验证新密码长度
    if len(password_change.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码长度至少为6位"
        )
    
    # 更新密码
    current_user.password_hash = get_password_hash(password_change.new_password)
    db.commit()
    
    return None


@router.get("/approvers", response_model=List[UserResponse])
def get_approvers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取可用的审批人列表（所有登录用户可访问）"""
    # 只返回部门主任、副总、总经理，且必须激活
    approvers = db.query(User).filter(
        User.role.in_([
            UserRole.DEPARTMENT_HEAD,
            UserRole.VICE_PRESIDENT,
            UserRole.GENERAL_MANAGER
        ]),
        User.is_active == True
    ).order_by(
        User.role,
        User.id
    ).all()
    
    return approvers


@router.get("/me/annual-leave", response_model=AnnualLeaveInfo)
def get_annual_leave_info(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取当前用户的年假使用情况"""
    balance = compute_annual_leave(db, current_user)
    return AnnualLeaveInfo(
        total_days=balance["total_days"],
        used_days=balance["used_days"],
        adjustment_days=balance["adjustment_days"],
        remaining_days=balance["remaining_days"],
    )


@router.get("/me/comp-leave", response_model=CompLeaveInfo)
def get_comp_leave_info(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取当前用户的加班调休额度使用情况（主动加班折算）"""
    yearly_reset = is_comp_leave_yearly_reset_enabled(db)
    balance = compute_comp_leave(db, current_user, yearly_reset=yearly_reset)
    return CompLeaveInfo(
        earned_days=balance["earned_days"],
        used_days=balance["used_days"],
        adjustment_days=balance["adjustment_days"],
        remaining_days=balance["remaining_days"],
        yearly_reset=yearly_reset,
    )


@router.get("/", response_model=List[UserResponse])
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取用户列表（管理员）"""
    users = db.query(User).offset(skip).limit(limit).all()
    return users


@router.get("/{user_id}", response_model=UserResponse)
def read_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取指定用户信息"""
    # 只有管理员或用户本人可以查看
    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    return user


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_create: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """创建用户（管理员）"""
    # 检查用户名是否已存在
    if db.query(User).filter(User.username == user_create.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )
    
    # 检查邮箱是否已存在
    if user_create.email and db.query(User).filter(User.email == user_create.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邮箱已存在"
        )
    
    user = User(
        username=user_create.username,
        password_hash=get_password_hash(user_create.password),
        real_name=user_create.real_name,
        email=user_create.email,
        phone=user_create.phone,
        role=user_create.role,
        department_id=user_create.department_id,
        annual_leave_days=user_create.annual_leave_days if user_create.annual_leave_days is not None else 10.0,
        hire_date=user_create.hire_date,
        enable_attendance=user_create.enable_attendance
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """更新用户信息（管理员）"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 更新字段
    update_data = user_update.model_dump(exclude_unset=True)
    
    # 如果更新密码，需要哈希
    if "password" in update_data and update_data["password"]:
        update_data["password_hash"] = get_password_hash(update_data.pop("password"))
    
    for field, value in update_data.items():
        setattr(user, field, value)
    
    db.commit()
    db.refresh(user)
    
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """删除用户（管理员）"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 不能删除自己
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能删除自己"
        )
    
    # 管理员删除用户时同步清理该用户的业务数据，并解除其作为审批人/部门负责人的引用。
    db.query(Department).filter(Department.head_id == user_id).update(
        {Department.head_id: None},
        synchronize_session=False,
    )
    db.query(VicePresidentDepartment).filter(
        VicePresidentDepartment.vice_president_id == user_id
    ).delete(synchronize_session=False)
    db.query(AttendanceViewer).filter(
        AttendanceViewer.user_id == user_id
    ).delete(synchronize_session=False)

    db.query(LeaveApplication).filter(
        LeaveApplication.assigned_vp_id == user_id
    ).update({LeaveApplication.assigned_vp_id: None}, synchronize_session=False)
    db.query(LeaveApplication).filter(
        LeaveApplication.assigned_gm_id == user_id
    ).update({LeaveApplication.assigned_gm_id: None}, synchronize_session=False)
    db.query(LeaveApplication).filter(
        LeaveApplication.dept_approver_id == user_id
    ).update({LeaveApplication.dept_approver_id: None}, synchronize_session=False)
    db.query(LeaveApplication).filter(
        LeaveApplication.vp_approver_id == user_id
    ).update({LeaveApplication.vp_approver_id: None}, synchronize_session=False)
    db.query(LeaveApplication).filter(
        LeaveApplication.gm_approver_id == user_id
    ).update({LeaveApplication.gm_approver_id: None}, synchronize_session=False)

    db.query(OvertimeApplication).filter(
        OvertimeApplication.assigned_approver_id == user_id
    ).update({OvertimeApplication.assigned_approver_id: None}, synchronize_session=False)
    db.query(OvertimeApplication).filter(
        OvertimeApplication.approver_id == user_id
    ).update({OvertimeApplication.approver_id: None}, synchronize_session=False)

    db.query(CompLeaveAdjustment).filter(
        CompLeaveAdjustment.created_by_id == user_id
    ).update({CompLeaveAdjustment.created_by_id: None}, synchronize_session=False)
    db.query(PassiveOvertimeAdjustment).filter(
        PassiveOvertimeAdjustment.created_by_id == user_id
    ).update({PassiveOvertimeAdjustment.created_by_id: None}, synchronize_session=False)
    db.query(AnnualLeaveAdjustment).filter(
        AnnualLeaveAdjustment.created_by_id == user_id
    ).update({AnnualLeaveAdjustment.created_by_id: None}, synchronize_session=False)

    db.query(Attendance).filter(Attendance.user_id == user_id).delete(synchronize_session=False)
    db.query(LeaveApplication).filter(LeaveApplication.user_id == user_id).delete(synchronize_session=False)
    db.query(OvertimeApplication).filter(OvertimeApplication.user_id == user_id).delete(synchronize_session=False)
    db.query(CompLeaveAdjustment).filter(CompLeaveAdjustment.user_id == user_id).delete(synchronize_session=False)
    db.query(PassiveOvertimeAdjustment).filter(PassiveOvertimeAdjustment.user_id == user_id).delete(synchronize_session=False)
    db.query(AnnualLeaveAdjustment).filter(AnnualLeaveAdjustment.user_id == user_id).delete(synchronize_session=False)

    db.delete(user)
    db.commit()
    
    return None


@router.post("/{user_id}/clear-wechat-binding", status_code=status.HTTP_204_NO_CONTENT)
def clear_wechat_binding(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """清理用户的微信绑定（管理员）"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 清理微信绑定
    user.wechat_openid = None
    db.commit()
    
    return None


