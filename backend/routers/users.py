"""
用户路由（重构版）
使用Service层架构
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import User, UserRole
from ..schemas import UserResponse, UserCreate, UserUpdate, PasswordChange, AnnualLeaveInfo
from ..security import get_current_user, get_current_active_admin
from ..services.user_service import UserService
from ..exceptions import BusinessException, ValidationException, NotFoundException, PermissionDeniedException, ConflictException

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
    try:
        service = UserService(db)
        service.change_password(
            user_id=current_user.id,
            old_password=password_change.old_password,
            new_password=password_change.new_password
        )
        return None
    except (BusinessException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/approvers", response_model=List[UserResponse])
def get_approvers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取可用的审批人列表（所有登录用户可访问）"""
    try:
        service = UserService(db)
        approvers = service.get_approvers()
        return approvers
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/me/annual-leave", response_model=AnnualLeaveInfo)
def get_annual_leave_info(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取当前用户的年假使用情况"""
    try:
        service = UserService(db)
        info = service.get_annual_leave_info(current_user.id)
        return AnnualLeaveInfo(**info)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/", response_model=List[UserResponse])
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取用户列表（管理员）"""
    try:
        service = UserService(db)
        users = service.get_all_users(skip=skip, limit=limit)
        return users
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/{user_id}", response_model=UserResponse)
def read_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取指定用户信息"""
    try:
        service = UserService(db)
        user = service.get_user(user_id)
        
        # 权限检查：只有管理员或用户本人可以查看
        if current_user.role != UserRole.ADMIN and current_user.id != user_id:
            raise PermissionDeniedException("无权查看此用户信息")
        
        return user
    except (BusinessException, NotFoundException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_create: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """创建用户（管理员）"""
    try:
        service = UserService(db)
        user = service.create_user(
            username=user_create.username,
            password=user_create.password,
            real_name=user_create.real_name,
            email=user_create.email,
            phone=user_create.phone,
            role=user_create.role,
            department_id=user_create.department_id,
            annual_leave_days=user_create.annual_leave_days if user_create.annual_leave_days is not None else 10.0,
            enable_attendance=user_create.enable_attendance
        )
        return user
    except (BusinessException, ConflictException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """更新用户信息（管理员）"""
    try:
        service = UserService(db)
        
        # 将 UserUpdate 转换为 Service 方法的参数
        update_data = user_update.model_dump(exclude_unset=True)
        
        user = service.update_user(
            user_id=user_id,
            real_name=update_data.get("real_name"),
            email=update_data.get("email"),
            phone=update_data.get("phone"),
            role=update_data.get("role"),
            department_id=update_data.get("department_id"),
            is_active=update_data.get("is_active"),
            password=update_data.get("password"),
            annual_leave_days=update_data.get("annual_leave_days"),
            enable_attendance=update_data.get("enable_attendance")
        )
        
        return user
    except (BusinessException, NotFoundException, ConflictException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """删除用户（管理员）"""
    try:
        service = UserService(db)
        service.delete_user(user_id=user_id, current_user_id=current_user.id)
        return None
    except (BusinessException, NotFoundException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/{user_id}/clear-wechat-binding", status_code=status.HTTP_204_NO_CONTENT)
def clear_wechat_binding(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """清理用户的微信绑定（管理员）"""
    try:
        service = UserService(db)
        service.clear_wechat_binding(user_id)
        
        # 记录日志
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"管理员 {current_user.username} 清理了用户 {user_id} 的微信绑定")
        
        return None
    except (BusinessException, NotFoundException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
