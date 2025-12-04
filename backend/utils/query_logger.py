"""
SQLAlchemy查询日志工具
用于分析慢查询和优化性能
"""
import logging
import time
from sqlalchemy import event
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


class QueryLogger:
    """查询日志记录器"""
    
    def __init__(self, slow_query_threshold: float = 0.1):
        """
        初始化查询日志记录器
        
        Args:
            slow_query_threshold: 慢查询阈值（秒），默认0.1秒
        """
        self.slow_query_threshold = slow_query_threshold
        self.query_count = 0
        self.slow_query_count = 0
        self.total_time = 0.0
    
    def setup(self, engine: Engine):
        """
        设置查询日志监听器
        
        Args:
            engine: SQLAlchemy引擎
        """
        @event.listens_for(engine, "before_cursor_execute")
        def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
            """查询执行前"""
            conn.info.setdefault('query_start_time', []).append(time.time())
            logger.debug(f"开始执行查询: {statement[:100]}...")
        
        @event.listens_for(engine, "after_cursor_execute")
        def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
            """查询执行后"""
            total = time.time() - conn.info['query_start_time'].pop(-1)
            
            self.query_count += 1
            self.total_time += total
            
            # 记录慢查询
            if total > self.slow_query_threshold:
                self.slow_query_count += 1
                logger.warning(
                    f"慢查询检测 [{total:.4f}s]: {statement[:200]}... "
                    f"参数: {parameters}"
                )
            else:
                logger.debug(f"查询完成 [{total:.4f}s]: {statement[:100]}...")
    
    def get_stats(self) -> dict:
        """
        获取查询统计信息
        
        Returns:
            统计信息字典
        """
        avg_time = self.total_time / self.query_count if self.query_count > 0 else 0
        
        return {
            "total_queries": self.query_count,
            "slow_queries": self.slow_query_count,
            "total_time": round(self.total_time, 4),
            "average_time": round(avg_time, 4),
            "slow_query_percentage": round(
                (self.slow_query_count / self.query_count * 100) if self.query_count > 0 else 0,
                2
            )
        }
    
    def reset_stats(self):
        """重置统计信息"""
        self.query_count = 0
        self.slow_query_count = 0
        self.total_time = 0.0


# 全局查询日志记录器实例
query_logger = QueryLogger(slow_query_threshold=0.1)


def enable_query_logging(engine: Engine, slow_query_threshold: float = 0.1):
    """
    启用查询日志
    
    Args:
        engine: SQLAlchemy引擎
        slow_query_threshold: 慢查询阈值（秒）
    """
    global query_logger
    query_logger = QueryLogger(slow_query_threshold=slow_query_threshold)
    query_logger.setup(engine)
    logger.info(f"查询日志已启用，慢查询阈值: {slow_query_threshold}秒")


def get_query_stats() -> dict:
    """
    获取查询统计信息
    
    Returns:
        统计信息字典
    """
    return query_logger.get_stats()


def reset_query_stats():
    """重置查询统计信息"""
    query_logger.reset_stats()
