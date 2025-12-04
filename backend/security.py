from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .config import settings
from .database import get_db
from .models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码
    
    注意：如果密码超过72字节，需要先用SHA256哈希，与get_password_hash保持一致
    """
    import hashlib
    
    password_bytes = plain_password.encode('utf-8')
    
    # 如果密码超过72字节，先用SHA256哈希（与get_password_hash保持一致）
    if len(password_bytes) > 72:
        plain_password = hashlib.sha256(password_bytes).hexdigest()
    
    return pwd_context.verify(plain_password, hashed_password)


def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    验证密码强度
    
    要求：
    - 最少8个字符
    - 至少包含一个大写字母
    - 至少包含一个小写字母
    - 至少包含一个数字
    
    Returns:
        (is_valid, error_message)
    """
    if len(password) < 8:
        return False, "密码长度至少8个字符"
    
    if not any(c.isupper() for c in password):
        return False, "密码必须包含至少一个大写字母"
    
    if not any(c.islower() for c in password):
        return False, "密码必须包含至少一个小写字母"
    
    if not any(c.isdigit() for c in password):
        return False, "密码必须包含至少一个数字"
    
    return True, ""


def get_password_hash(password: str) -> str:
    """
    获取密码哈希
    
    注意：bcrypt限制密码长度不能超过72字节
    对于超长密码，使用SHA256预哈希处理
    """
    import hashlib
    
    password_bytes = password.encode('utf-8')
    
    # 如果密码超过72字节，先用SHA256哈希
    if len(password_bytes) > 72:
        password = hashlib.sha256(password_bytes).hexdigest()
    
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    """解码令牌"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """获取当前用户"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise credentials_exception
    
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="用户已被禁用")
    
    return user


async def get_current_active_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """获取当前活跃的管理员用户"""
    from .models import UserRole
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    return current_user



