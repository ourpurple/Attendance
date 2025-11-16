from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .config import settings
from .database import init_db
from .routers import auth, users, departments, attendance, leave, overtime, statistics, holidays, vp_departments

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

# 静态文件服务（用于前端）
try:
    app.mount("/admin", StaticFiles(directory="frontend/admin", html=True), name="admin")
    app.mount("/mobile", StaticFiles(directory="frontend/mobile", html=True), name="mobile")
except:
    pass  # 如果目录不存在，跳过


@app.on_event("startup")
async def startup_event():
    """应用启动时初始化数据库"""
    init_db()


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


