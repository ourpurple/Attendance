"""
自定义异常类
定义业务逻辑中使用的各种异常
"""
from fastapi import status


class BusinessException(Exception):
    """业务异常基类"""
    
    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class ValidationException(BusinessException):
    """验证异常"""
    
    def __init__(self, message: str):
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_ENTITY)


class NotFoundException(BusinessException):
    """资源不存在异常"""
    
    def __init__(self, resource_type: str = "资源", resource_id = None):
        if resource_id is not None:
            message = f"{resource_type}不存在: {resource_id}"
        else:
            message = f"{resource_type}不存在"
        super().__init__(message, status.HTTP_404_NOT_FOUND)


class PermissionDeniedException(BusinessException):
    """权限拒绝异常"""
    
    def __init__(self, message: str = "没有权限执行此操作"):
        super().__init__(message, status.HTTP_403_FORBIDDEN)


class ConflictException(BusinessException):
    """冲突异常（如乐观锁冲突）"""
    
    def __init__(self, message: str = "数据已被修改，请刷新后重试"):
        super().__init__(message, status.HTTP_409_CONFLICT)


class AuthenticationException(BusinessException):
    """认证异常"""
    
    def __init__(self, message: str = "认证失败"):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED)


class RateLimitException(BusinessException):
    """频率限制异常"""
    
    def __init__(self, message: str = "请求过于频繁，请稍后再试"):
        super().__init__(message, status.HTTP_429_TOO_MANY_REQUESTS)


__all__ = [
    "BusinessException",
    "ValidationException",
    "NotFoundException",
    "PermissionDeniedException",
    "ConflictException",
    "AuthenticationException",
    "RateLimitException",
]
