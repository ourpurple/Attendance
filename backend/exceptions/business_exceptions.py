"""
业务异常类定义
"""
from typing import Any


class BusinessException(Exception):
    """业务异常基类"""
    
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class ValidationException(BusinessException):
    """验证异常"""
    
    def __init__(self, message: str = "验证失败"):
        super().__init__(message, status_code=400)


class NotFoundException(BusinessException):
    """资源不存在异常"""
    
    def __init__(self, resource: str = "资源", resource_id: Any = None):
        if resource_id is not None:
            message = f"{resource}不存在 (ID: {resource_id})"
        else:
            message = f"{resource}不存在"
        super().__init__(message, status_code=404)


class PermissionDeniedException(BusinessException):
    """权限不足异常"""
    
    def __init__(self, message: str = "权限不足"):
        super().__init__(message, status_code=403)


class ConflictException(BusinessException):
    """资源冲突异常"""
    
    def __init__(self, message: str = "资源冲突"):
        super().__init__(message, status_code=409)

