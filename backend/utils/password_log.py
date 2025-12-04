"""
密码修改日志记录工具
"""
from sqlalchemy.orm import Session
from fastapi import Request
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def log_password_change(
    db: Session,
    user_id: int,
    changed_by_id: int,
    change_type: str = "self_change",
    request: Optional[Request] = None
) -> None:
    """
    记录密码修改日志
    
    Args:
        db: 数据库会话
        user_id: 被修改密码的用户ID
        changed_by_id: 修改人ID（可能是管理员或用户自己）
        change_type: 修改类型 (self_change=用户自己修改, admin_reset=管理员重置)
        request: FastAPI请求对象（用于获取IP和User-Agent）
    """
    from ..models import PasswordChangeLog
    
    # 获取IP地址
    ip_address = None
    user_agent = None
    
    if request:
        # 优先从X-Forwarded-For获取真实IP
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            ip_address = forwarded.split(",")[0].strip()
        else:
            # 从X-Real-IP获取
            real_ip = request.headers.get("X-Real-IP")
            if real_ip:
                ip_address = real_ip
            else:
                # 使用直连IP
                ip_address = request.client.host if request.client else None
        
        # 获取User-Agent
        user_agent = request.headers.get("User-Agent")
    
    # 创建日志记录
    log_entry = PasswordChangeLog(
        user_id=user_id,
        changed_by_id=changed_by_id,
        ip_address=ip_address,
        user_agent=user_agent,
        change_type=change_type
    )
    
    try:
        db.add(log_entry)
        db.commit()
        logger.info(
            f"Password change logged: user_id={user_id}, "
            f"changed_by={changed_by_id}, type={change_type}, ip={ip_address}"
        )
    except Exception as e:
        logger.error(f"Failed to log password change: {e}")
        db.rollback()


def get_password_change_history(
    db: Session,
    user_id: int,
    limit: int = 10
) -> list:
    """
    获取用户的密码修改历史
    
    Args:
        db: 数据库会话
        user_id: 用户ID
        limit: 返回记录数量限制
    
    Returns:
        密码修改历史记录列表
    """
    from ..models import PasswordChangeLog, User
    
    logs = db.query(PasswordChangeLog).filter(
        PasswordChangeLog.user_id == user_id
    ).order_by(
        PasswordChangeLog.created_at.desc()
    ).limit(limit).all()
    
    result = []
    for log in logs:
        changed_by = db.query(User).filter(User.id == log.changed_by_id).first()
        result.append({
            "id": log.id,
            "changed_at": log.created_at,
            "changed_by": changed_by.real_name if changed_by else "未知",
            "change_type": log.change_type,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent
        })
    
    return result
