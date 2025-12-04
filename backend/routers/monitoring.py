"""
监控路由
提供系统监控和性能统计信息
"""
from fastapi import APIRouter, Depends
from ..security import get_current_active_admin
from ..models import User
from ..utils.query_logger import get_query_stats, reset_query_stats

router = APIRouter(prefix="/monitoring", tags=["监控"])


@router.get("/query-stats")
def get_query_statistics(
    current_user: User = Depends(get_current_active_admin)
):
    """
    获取查询统计信息（仅管理员）
    
    返回：
    - total_queries: 总查询数
    - slow_queries: 慢查询数
    - total_time: 总查询时间
    - average_time: 平均查询时间
    - slow_query_percentage: 慢查询百分比
    """
    stats = get_query_stats()
    return {
        "status": "success",
        "data": stats
    }


@router.post("/query-stats/reset")
def reset_query_statistics(
    current_user: User = Depends(get_current_active_admin)
):
    """
    重置查询统计信息（仅管理员）
    """
    reset_query_stats()
    return {
        "status": "success",
        "message": "查询统计信息已重置"
    }


@router.get("/health/detailed")
def detailed_health_check(
    current_user: User = Depends(get_current_active_admin)
):
    """
    详细健康检查（仅管理员）
    
    返回系统各组件的健康状态
    """
    from ..database import SessionLocal
    import sys
    import psutil
    import os
    
    # 数据库连接检查
    db_healthy = False
    try:
        db = SessionLocal()
        db.execute("SELECT 1")
        db.close()
        db_healthy = True
    except Exception as e:
        db_error = str(e)
    
    # 系统资源信息
    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()
    
    # 查询统计
    query_stats = get_query_stats()
    
    return {
        "status": "healthy" if db_healthy else "unhealthy",
        "components": {
            "database": {
                "status": "healthy" if db_healthy else "unhealthy",
                "error": None if db_healthy else db_error
            },
            "query_performance": {
                "status": "healthy" if query_stats.get("slow_query_percentage", 0) < 10 else "warning",
                "stats": query_stats
            }
        },
        "system": {
            "python_version": sys.version,
            "memory_usage_mb": round(memory_info.rss / 1024 / 1024, 2),
            "cpu_percent": process.cpu_percent(interval=0.1)
        }
    }
