"""
事务管理工具
提供统一的事务处理装饰器
"""
from functools import wraps
from typing import Callable, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import logging

logger = logging.getLogger(__name__)


def transaction(func: Callable) -> Callable:
    """
    事务装饰器
    自动处理数据库事务的提交和回滚
    
    使用示例:
        @transaction
        def my_function(db: Session, ...):
            # 数据库操作
            db.add(...)
            # 不需要手动commit，装饰器会自动处理
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        # 查找db参数
        db: Optional[Session] = None
        
        # 从位置参数中查找
        for arg in args:
            if isinstance(arg, Session):
                db = arg
                break
        
        # 从关键字参数中查找
        if db is None:
            db = kwargs.get('db')
        
        if db is None:
            # 如果没有找到db参数，直接执行函数
            return func(*args, **kwargs)
        
        try:
            # 执行函数
            result = func(*args, **kwargs)
            # 提交事务
            db.commit()
            return result
        except SQLAlchemyError as e:
            # 数据库错误，回滚
            db.rollback()
            logger.error(f"数据库事务回滚: {str(e)}", exc_info=True)
            raise
        except Exception as e:
            # 其他错误，回滚
            db.rollback()
            logger.error(f"事务回滚: {str(e)}", exc_info=True)
            raise
    
    return wrapper

