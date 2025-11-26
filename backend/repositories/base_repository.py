"""
基础Repository类
提供通用的CRUD操作
"""
from typing import Generic, TypeVar, Type, Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import datetime

ModelType = TypeVar("ModelType")


class BaseRepository(Generic[ModelType]):
    """基础Repository类，提供通用CRUD操作"""
    
    def __init__(self, model: Type[ModelType], db: Session):
        """
        初始化Repository
        
        Args:
            model: SQLAlchemy模型类
            db: 数据库会话
        """
        self.model = model
        self.db = db
    
    def get(self, id: int) -> Optional[ModelType]:
        """根据ID获取单个记录"""
        return self.db.query(self.model).filter(self.model.id == id).first()
    
    def get_all(
        self, 
        skip: int = 0, 
        limit: int = 100,
        filters: Optional[Dict[str, Any]] = None,
        order_by: Optional[str] = None
    ) -> List[ModelType]:
        """
        获取所有记录
        
        Args:
            skip: 跳过记录数
            limit: 限制返回记录数
            filters: 过滤条件字典
            order_by: 排序字段
        """
        query = self.db.query(self.model)
        
        # 应用过滤条件
        if filters:
            for key, value in filters.items():
                if hasattr(self.model, key):
                    if isinstance(value, list):
                        query = query.filter(getattr(self.model, key).in_(value))
                    else:
                        query = query.filter(getattr(self.model, key) == value)
        
        # 应用排序
        if order_by:
            if order_by.startswith("-"):
                # 降序
                field = order_by[1:]
                if hasattr(self.model, field):
                    query = query.order_by(getattr(self.model, field).desc())
            else:
                # 升序
                if hasattr(self.model, order_by):
                    query = query.order_by(getattr(self.model, order_by))
        
        return query.offset(skip).limit(limit).all()
    
    def create(self, **kwargs) -> ModelType:
        """创建新记录"""
        instance = self.model(**kwargs)
        self.db.add(instance)
        self.db.flush()  # 不提交，由调用者控制事务
        return instance
    
    def update(self, id: int, **kwargs) -> Optional[ModelType]:
        """更新记录"""
        instance = self.get(id)
        if not instance:
            return None
        
        for key, value in kwargs.items():
            if hasattr(instance, key):
                setattr(instance, key, value)
        
        # 自动更新updated_at字段（如果存在）
        if hasattr(instance, "updated_at"):
            instance.updated_at = datetime.now()
        
        self.db.flush()
        return instance
    
    def delete(self, id: int) -> bool:
        """删除记录"""
        instance = self.get(id)
        if not instance:
            return False
        
        self.db.delete(instance)
        self.db.flush()
        return True
    
    def count(self, filters: Optional[Dict[str, Any]] = None) -> int:
        """统计记录数"""
        query = self.db.query(self.model)
        
        if filters:
            for key, value in filters.items():
                if hasattr(self.model, key):
                    if isinstance(value, list):
                        query = query.filter(getattr(self.model, key).in_(value))
                    else:
                        query = query.filter(getattr(self.model, key) == value)
        
        return query.count()
    
    def exists(self, id: int) -> bool:
        """检查记录是否存在"""
        return self.get(id) is not None

