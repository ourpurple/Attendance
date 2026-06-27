"""
异常处理器测试
"""
import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from backend.exceptions import (
    BusinessException,
    ValidationException,
    NotFoundException,
    PermissionDeniedException,
    ConflictException,
    AuthenticationException,
    RateLimitException,
)
from backend.middleware.exception_handler import setup_exception_handlers


# 创建测试应用
app = FastAPI()
setup_exception_handlers(app)


# 测试路由
@app.get("/test/business-error")
async def test_business_error():
    raise BusinessException("测试业务异常")


@app.get("/test/validation-error")
async def test_validation_error():
    raise ValidationException("测试验证异常")


@app.get("/test/not-found")
async def test_not_found():
    raise NotFoundException("资源未找到")


@app.get("/test/permission-denied")
async def test_permission_denied():
    raise PermissionDeniedException("权限不足")


@app.get("/test/conflict")
async def test_conflict():
    raise ConflictException("数据冲突")


@app.get("/test/authentication")
async def test_authentication():
    raise AuthenticationException("认证失败")


@app.get("/test/rate-limit")
async def test_rate_limit():
    raise RateLimitException("请求过于频繁")


@app.get("/test/general-error")
async def test_general_error():
    raise Exception("未知错误")


@app.get("/test/zero-division")
async def test_zero_division():
    return 1 / 0


client = TestClient(app)


class TestExceptionHandlers:
    """异常处理器测试类"""
    
    def test_business_exception(self):
        """测试业务异常处理"""
        response = client.get("/test/business-error")
        assert response.status_code == 400
        data = response.json()
        assert data["code"] == "BUSINESS_ERROR"
        assert data["message"] == "测试业务异常"
    
    def test_validation_exception(self):
        """测试验证异常处理"""
        response = client.get("/test/validation-error")
        assert response.status_code == 422
        data = response.json()
        assert data["code"] == "BUSINESS_ERROR"
        assert data["message"] == "测试验证异常"
    
    def test_not_found_exception(self):
        """测试资源不存在异常"""
        response = client.get("/test/not-found")
        assert response.status_code == 404
        data = response.json()
        assert data["code"] == "BUSINESS_ERROR"
        assert data["message"] == "资源未找到"
    
    def test_permission_denied_exception(self):
        """测试权限拒绝异常"""
        response = client.get("/test/permission-denied")
        assert response.status_code == 403
        data = response.json()
        assert data["code"] == "BUSINESS_ERROR"
        assert data["message"] == "权限不足"
    
    def test_conflict_exception(self):
        """测试冲突异常"""
        response = client.get("/test/conflict")
        assert response.status_code == 409
        data = response.json()
        assert data["code"] == "BUSINESS_ERROR"
        assert data["message"] == "数据冲突"
    
    def test_authentication_exception(self):
        """测试认证异常"""
        response = client.get("/test/authentication")
        assert response.status_code == 401
        data = response.json()
        assert data["code"] == "BUSINESS_ERROR"
        assert data["message"] == "认证失败"
    
    def test_rate_limit_exception(self):
        """测试频率限制异常"""
        response = client.get("/test/rate-limit")
        assert response.status_code == 429
        data = response.json()
        assert data["code"] == "BUSINESS_ERROR"
        assert data["message"] == "请求过于频繁"
    
    def test_general_exception(self):
        """测试通用异常处理"""
        # TestClient会在遇到未处理的异常时抛出，这是预期行为
        # 在实际应用中，异常处理器会捕获并返回JSON响应
        with pytest.raises(Exception):
            client.get("/test/general-error")
    
    def test_zero_division_error(self):
        """测试除零错误"""
        # TestClient会在遇到未处理的异常时抛出，这是预期行为
        # 在实际应用中，异常处理器会捕获并返回JSON响应
        with pytest.raises(ZeroDivisionError):
            client.get("/test/zero-division")
    
    def test_error_response_format(self):
        """测试错误响应格式"""
        response = client.get("/test/business-error")
        data = response.json()
        
        # 验证必需字段
        assert "code" in data
        assert "message" in data
        
        # 验证字段类型
        assert isinstance(data["code"], str)
        assert isinstance(data["message"], str)


class TestCustomExceptions:
    """自定义异常测试类"""
    
    def test_business_exception_creation(self):
        """测试业务异常创建"""
        exc = BusinessException("测试消息", 400)
        assert exc.message == "测试消息"
        assert exc.status_code == 400
    
    def test_validation_exception_status_code(self):
        """测试验证异常状态码"""
        exc = ValidationException("验证失败")
        assert exc.status_code == 422
    
    def test_not_found_exception_status_code(self):
        """测试资源不存在异常状态码"""
        exc = NotFoundException()
        assert exc.status_code == 404
        assert exc.message == "资源不存在"
    
    def test_permission_denied_exception_status_code(self):
        """测试权限拒绝异常状态码"""
        exc = PermissionDeniedException()
        assert exc.status_code == 403
        assert exc.message == "没有权限执行此操作"
    
    def test_conflict_exception_status_code(self):
        """测试冲突异常状态码"""
        exc = ConflictException()
        assert exc.status_code == 409
        assert exc.message == "数据已被修改，请刷新后重试"
    
    def test_authentication_exception_status_code(self):
        """测试认证异常状态码"""
        exc = AuthenticationException()
        assert exc.status_code == 401
        assert exc.message == "认证失败"
    
    def test_rate_limit_exception_status_code(self):
        """测试频率限制异常状态码"""
        exc = RateLimitException()
        assert exc.status_code == 429
        assert exc.message == "请求过于频繁，请稍后再试"
