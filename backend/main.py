from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging
import sys
from .config import settings
from .database import init_db
from .routers import auth, users, departments, attendance, leave, overtime, statistics, holidays, vp_departments, attendance_viewers, leave_types
from .middleware import setup_exception_handlers

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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


