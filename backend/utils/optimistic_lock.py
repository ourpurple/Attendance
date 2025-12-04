"""
乐观锁实现
用于处理并发更新冲突
"""
from functools import wraps
from typing import Callable, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
import logging

logger = logging.getLogger(__name__)


class OptimisticLockError(Exception):
    """乐观锁冲突异常"""
    pass


def with_optimistic_lock(func: Callable) -> Callable:
    """
    乐观锁装饰器
    
    使用方法：
    1. 在模型中添加version字段：
       version = Column(Integer, default=1, nullable=False)
    
    2. 在更新操作前检查version：
       @with_optimistic_lock
       def update_entity(db: Session, entity_id: int, data: dict, expected_version: int):
           entity = db.query(Entity).filter(Entity.id == entity_id).first()
           if entity.version != expected_version:
               raise OptimisticLockError("数据已被其他用户修改")
           
           # 更新数据
           for key, value in data.items():
               setattr(entity, key, value)
           
           # 增加版本号
           entity.version += 1
           db.commit()
           return entity
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except OptimisticLockError as e:
            logger.warning(f"Optimistic lock conflict: {e}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(e)
            )
    
    return wrapper


def check_version(entity: Any, expected_version: int) -> None:
    """
    检查实体版本
    
    Args:
        entity: 数据库实体对象
        expected_version: 期望的版本号
    
    Raises:
        OptimisticLockError: 版本不匹配时抛出
    """
    if not hasattr(entity, 'version'):
        logger.warning(f"Entity {type(entity).__name__} does not have version field")
        return
    
    if entity.version != expected_version:
        raise OptimisticLockError(
            f"数据已被其他用户修改（当前版本：{entity.version}，期望版本：{expected_version}）"
        )


def increment_version(entity: Any) -> None:
    """
    增加实体版本号
    
    Args:
        entity: 数据库实体对象
    """
    if hasattr(entity, 'version'):
        entity.version += 1
    else:
        logger.warning(f"Entity {type(entity).__name__} does not have version field")
