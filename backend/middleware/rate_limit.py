"""
API频率限制中间件
使用内存存储实现简单的频率限制
"""
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, Tuple
import logging

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    频率限制中间件
    
    使用滑动窗口算法限制请求频率
    """
    
    def __init__(self, app, requests_per_minute: int = 60, requests_per_hour: int = 1000):
        """
        初始化频率限制中间件
        
        Args:
            app: FastAPI应用实例
            requests_per_minute: 每分钟最大请求数
            requests_per_hour: 每小时最大请求数
        """
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        
        # 存储格式: {client_ip: [(timestamp, count), ...]}
        self.request_history: Dict[str, list] = defaultdict(list)
        
        # 白名单路径（不受频率限制）
        self.whitelist_paths = [
            "/docs",
            "/redoc",
            "/openapi.json",
            "/api/health",
            "/",
        ]
    
    def _get_client_ip(self, request: Request) -> str:
        """获取客户端IP地址"""
        # 优先从X-Forwarded-For获取真实IP
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        # 从X-Real-IP获取
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # 最后使用直连IP
        return request.client.host if request.client else "unknown"
    
    def _clean_old_requests(self, client_ip: str, now: datetime):
        """清理过期的请求记录"""
        if client_ip not in self.request_history:
            return
        
        # 只保留最近1小时的记录
        one_hour_ago = now - timedelta(hours=1)
        self.request_history[client_ip] = [
            (ts, count) for ts, count in self.request_history[client_ip]
            if ts > one_hour_ago
        ]
        
        # 如果没有记录了，删除该IP
        if not self.request_history[client_ip]:
            del self.request_history[client_ip]
    
    def _check_rate_limit(self, client_ip: str, now: datetime) -> Tuple[bool, str]:
        """
        检查是否超过频率限制
        
        Returns:
            (is_allowed, error_message)
        """
        # 清理旧记录
        self._clean_old_requests(client_ip, now)
        
        # 获取该IP的请求历史
        history = self.request_history[client_ip]
        
        # 检查每分钟限制
        one_minute_ago = now - timedelta(minutes=1)
        recent_requests = sum(count for ts, count in history if ts > one_minute_ago)
        
        if recent_requests >= self.requests_per_minute:
            return False, f"请求过于频繁，每分钟最多{self.requests_per_minute}次请求"
        
        # 检查每小时限制
        one_hour_ago = now - timedelta(hours=1)
        hourly_requests = sum(count for ts, count in history if ts > one_hour_ago)
        
        if hourly_requests >= self.requests_per_hour:
            return False, f"请求过于频繁，每小时最多{self.requests_per_hour}次请求"
        
        return True, ""
    
    async def dispatch(self, request: Request, call_next):
        """处理请求"""
        # 检查是否在白名单中
        if any(request.url.path.startswith(path) for path in self.whitelist_paths):
            return await call_next(request)
        
        # 获取客户端IP
        client_ip = self._get_client_ip(request)
        now = datetime.now()
        
        # 检查频率限制
        is_allowed, error_message = self._check_rate_limit(client_ip, now)
        
        if not is_allowed:
            logger.warning(f"Rate limit exceeded for IP: {client_ip}, path: {request.url.path}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=error_message
            )
        
        # 记录本次请求
        self.request_history[client_ip].append((now, 1))
        
        # 继续处理请求
        response = await call_next(request)
        
        # 添加频率限制响应头
        response.headers["X-RateLimit-Limit-Minute"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Limit-Hour"] = str(self.requests_per_hour)
        
        return response
