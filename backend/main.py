from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import logging
import sys
from .config import settings
from .database import init_db
from .routers import auth, users, departments, attendance, leave, overtime, statistics, holidays, vp_departments, attendance_viewers, leave_types, monitoring
from .middleware import setup_exception_handlers
from .middleware.rate_limit import RateLimitMiddleware

# 配置日志，确保输出到标准输出（systemd journal）
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

# 创建FastAPI应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="考勤与请假管理系统API"
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)

# 添加频率限制中间件
app.add_middleware(
    RateLimitMiddleware,
    requests_per_minute=60,  # 每分钟60次请求
    requests_per_hour=1000   # 每小时1000次请求
)

# 请求体大小限制中间件
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    """限制请求体大小为10MB"""
    max_size = 10 * 1024 * 1024  # 10MB
    
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > max_size:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": "请求体过大，最大允许10MB"}
        )
    
    return await call_next(request)

# 设置全局异常处理器
setup_exception_handlers(app)

# 注册路由
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(departments.router, prefix="/api")
app.include_router(attendance.router, prefix="/api")
app.include_router(leave.router, prefix="/api")
app.include_router(overtime.router, prefix="/api")
app.include_router(statistics.router, prefix="/api")
app.include_router(holidays.router, prefix="/api")
app.include_router(vp_departments.router, prefix="/api")
app.include_router(attendance_viewers.router, prefix="/api")
app.include_router(leave_types.router, prefix="/api")
app.include_router(monitoring.router, prefix="/api")

# 静态文件服务（用于前端）
import os
from pathlib import Path

# 获取项目根目录（backend/main.py 的父目录的父目录）
BASE_DIR = Path(__file__).resolve().parent.parent
ADMIN_DIR = BASE_DIR / "frontend" / "admin"
MOBILE_DIR = BASE_DIR / "frontend" / "mobile"

try:
    if ADMIN_DIR.exists():
        app.mount("/admin", StaticFiles(directory=str(ADMIN_DIR), html=True), name="admin")
        print(f"✓ Admin前端已挂载: {ADMIN_DIR}")
    else:
        print(f"⚠️  Admin前端目录不存在: {ADMIN_DIR}")
    
    if MOBILE_DIR.exists():
        app.mount("/mobile", StaticFiles(directory=str(MOBILE_DIR), html=True), name="mobile")
        print(f"✓ Mobile前端已挂载: {MOBILE_DIR}")
    else:
        print(f"⚠️  Mobile前端目录不存在: {MOBILE_DIR}")
except Exception as e:
    print(f"❌ 挂载静态文件失败: {e}")
    import traceback
    traceback.print_exc()


@app.on_event("startup")
async def startup_event():
    """应用启动时初始化数据库和验证配置"""
    from .config import validate_settings
    from .database import engine
    from .utils.query_logger import enable_query_logging
    
    # 验证配置
    try:
        validate_settings()
        print("✓ 配置验证通过")
    except ValueError as e:
        print(f"⚠️  配置验证警告: {e}")
        # 非生产环境允许继续运行
        if settings.ENVIRONMENT == "production":
            raise
    
    # 初始化数据库
    init_db()
    print("✓ 数据库初始化完成")
    
    # 启用查询日志（仅在DEBUG模式下）
    if settings.DEBUG:
        enable_query_logging(engine, slow_query_threshold=0.1)
        print("✓ 查询日志已启用（慢查询阈值: 0.1秒）")


@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "考勤与请假系统API",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "admin": "/admin",
        "mobile": "/mobile"
    }


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}


