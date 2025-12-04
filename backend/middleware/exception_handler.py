"""
全局异常处理器
统一处理所有异常并返回标准格式的响应
"""
import logging
import traceback
from typing import Dict, Any
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from ..exceptions import (
    BusinessException,
    ValidationException,
    NotFoundException,
    PermissionDeniedException,
    ConflictException,
    AuthenticationException,
    RateLimitException,
)
from ..config import settings

logger = logging.getLogger(__name__)


def create_error_response(
    code: str,
    message: str,
    detail: Any = None,
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
) -> JSONResponse:
    """
    创建标准错误响应
    
    Args:
        code: 错误代码
        message: 错误消息
        detail: 详细信息（仅在DEBUG模式下返回）
        status_code: HTTP状态码
    
    Returns:
        JSONResponse: 标准格式的错误响应
    """
    content: Dict[str, Any] = {
        "code": code,
        "message": message,
    }
    
    # 仅在DEBUG模式下返回详细信息
    if detail and settings.DEBUG:
        content["detail"] = detail
    
    return JSONResponse(
        status_code=status_code,
        content=content
    )


async def business_exception_handler(request: Request, exc: BusinessException):
    """业务异常处理器"""
    logger.warning(
        f"业务异常: {exc.message} "
        f"(路径: {request.url.path}, "
        f"方法: {request.method}, "
        f"客户端: {request.client.host if request.client else 'unknown'})"
    )
    
    return create_error_response(
        code="BUSINESS_ERROR",
        message=exc.message,
        status_code=exc.status_code
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """验证异常处理器"""
    errors = exc.errors()
    error_messages = []
    
    for error in errors:
        field = ".".join(str(loc) for loc in error["loc"])
        message = error["msg"]
        error_messages.append(f"{field}: {message}")
    
    error_detail = "; ".join(error_messages)
    logger.warning(
        f"验证失败: {error_detail} "
        f"(路径: {request.url.path}, "
        f"方法: {request.method})"
    )
    
    return create_error_response(
        code="VALIDATION_ERROR",
        message="请求参数验证失败",
        detail=error_messages if settings.DEBUG else None,
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
    )


async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    """SQLAlchemy异常处理器"""
    error_detail = str(exc) if settings.DEBUG else None
    
    logger.error(
        f"数据库错误: {str(exc)} "
        f"(路径: {request.url.path}, "
        f"方法: {request.method})",
        exc_info=True
    )
    
    # 处理完整性约束错误
    if isinstance(exc, IntegrityError):
        error_msg = str(exc.orig)
        if "UNIQUE constraint" in error_msg:
            return create_error_response(
                code="DUPLICATE_ERROR",
                message="数据已存在，不能重复创建",
                detail=error_detail,
                status_code=status.HTTP_409_CONFLICT
            )
        elif "FOREIGN KEY constraint" in error_msg:
            return create_error_response(
                code="FOREIGN_KEY_ERROR",
                message="关联数据不存在",
                detail=error_detail,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        elif "NOT NULL constraint" in error_msg:
            return create_error_response(
                code="NULL_VALUE_ERROR",
                message="必填字段不能为空",
                detail=error_detail,
                status_code=status.HTTP_400_BAD_REQUEST
            )
    
    return create_error_response(
        code="DATABASE_ERROR",
        message="数据库操作失败",
        detail=error_detail,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
    )


async def general_exception_handler(request: Request, exc: Exception):
    """通用异常处理器"""
    # 获取堆栈跟踪（仅在DEBUG模式下）
    stack_trace = None
    if settings.DEBUG:
        stack_trace = traceback.format_exc()
    
    logger.error(
        f"未处理的异常: {type(exc).__name__}: {str(exc)} "
        f"(路径: {request.url.path}, "
        f"方法: {request.method}, "
        f"客户端: {request.client.host if request.client else 'unknown'})",
        exc_info=True
    )
    
    return create_error_response(
        code="INTERNAL_ERROR",
        message="服务器内部错误",
        detail=stack_trace,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
    )


def setup_exception_handlers(app):
    """
    设置全局异常处理器
    
    Args:
        app: FastAPI应用实例
    """
    # 业务异常
    app.add_exception_handler(BusinessException, business_exception_handler)
    app.add_exception_handler(ValidationException, business_exception_handler)
    app.add_exception_handler(NotFoundException, business_exception_handler)
    app.add_exception_handler(PermissionDeniedException, business_exception_handler)
    app.add_exception_handler(ConflictException, business_exception_handler)
    app.add_exception_handler(AuthenticationException, business_exception_handler)
    app.add_exception_handler(RateLimitException, business_exception_handler)
    
    # 验证异常
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    
    # 数据库异常
    app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
    app.add_exception_handler(IntegrityError, sqlalchemy_exception_handler)
    
    # 通用异常（放在最后，作为兜底）
    app.add_exception_handler(Exception, general_exception_handler)
    
    logger.info("✓ 全局异常处理器已设置")

