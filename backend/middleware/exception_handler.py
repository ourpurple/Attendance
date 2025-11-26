"""
全局异常处理器
统一处理所有异常并返回标准格式的响应
"""
import logging
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
)

logger = logging.getLogger(__name__)


async def business_exception_handler(request: Request, exc: BusinessException):
    """业务异常处理器"""
    logger.warning(f"业务异常: {exc.message} (路径: {request.url.path})")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message}
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
    logger.warning(f"验证失败: {error_detail} (路径: {request.url.path})")
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": error_detail}
    )


async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    """SQLAlchemy异常处理器"""
    logger.error(f"数据库错误: {str(exc)} (路径: {request.url.path})", exc_info=True)
    
    # 处理完整性约束错误
    if isinstance(exc, IntegrityError):
        error_msg = str(exc.orig)
        if "UNIQUE constraint" in error_msg:
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content={"detail": "数据已存在，不能重复创建"}
            )
        elif "FOREIGN KEY constraint" in error_msg:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": "关联数据不存在"}
            )
        elif "NOT NULL constraint" in error_msg:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": "必填字段不能为空"}
            )
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "数据库操作失败"}
    )


async def general_exception_handler(request: Request, exc: Exception):
    """通用异常处理器"""
    logger.error(
        f"未处理的异常: {type(exc).__name__}: {str(exc)} (路径: {request.url.path})",
        exc_info=True
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "服务器内部错误"}
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
    
    # 验证异常
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    
    # 数据库异常
    app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
    app.add_exception_handler(IntegrityError, sqlalchemy_exception_handler)
    
    # 通用异常（放在最后，作为兜底）
    app.add_exception_handler(Exception, general_exception_handler)

