from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime
from ..database import get_db
from ..models import User, UserRole, LeaveApplication, LeaveStatus, LeaveType
from ..schemas import UserResponse, UserCreate, UserUpdate, PasswordChange, AnnualLeaveInfo
from ..security import get_current_user, get_current_active_admin, get_password_hash, verify_password

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
    # 获取总年假天数
    total_days = current_user.annual_leave_days or 10.0
    
    # 获取"年假调休"类型的ID
    annual_leave_type = db.query(LeaveType).filter(
        LeaveType.name == "年假调休",
        LeaveType.is_active == True
    ).first()
    
    if not annual_leave_type:
        # 如果没有找到年假调休类型，返回默认值
        return AnnualLeaveInfo(
            total_days=total_days,
            used_days=0.0,
            remaining_days=total_days
        )
    
    # 计算本年度已使用的年假天数
    # 获取当前年份的开始和结束时间
    current_year = datetime.now().year
    year_start = datetime(current_year, 1, 1)
    year_end = datetime(current_year, 12, 31, 23, 59, 59)
    
    # 查询本年度已批准的年假调休申请
    used_leave = db.query(func.sum(LeaveApplication.days)).filter(
        LeaveApplication.user_id == current_user.id,
        LeaveApplication.leave_type_id == annual_leave_type.id,
        LeaveApplication.status.in_([
            LeaveStatus.DEPT_APPROVED,
            LeaveStatus.VP_APPROVED,
            LeaveStatus.APPROVED
        ]),
        LeaveApplication.start_date >= year_start,
        LeaveApplication.start_date <= year_end
    ).scalar() or 0.0
    
    used_days = float(used_leave)
    remaining_days = max(0.0, total_days - used_days)
    
    return AnnualLeaveInfo(
        total_days=total_days,
        used_days=used_days,
        remaining_days=remaining_days
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
    
    # 检查是否有关联数据
    if user.attendances:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"该用户有 {len(user.attendances)} 条考勤记录，无法删除"
        )
    
    if user.leave_applications:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"该用户有 {len(user.leave_applications)} 条请假记录，无法删除"
        )
    
    if user.overtime_applications:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"该用户有 {len(user.overtime_applications)} 条加班记录，无法删除"
        )
    
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
    
    print(f"✅ 管理员 {current_user.username} 清理了用户 {user.username} 的微信绑定")
    
    return None


