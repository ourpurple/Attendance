"""
统一缓存接口
支持内存缓存和Redis缓存（可选）
"""
from typing import Optional, Any, Dict, Callable
from datetime import datetime, timedelta
from abc import ABC, abstractmethod
import json
import hashlib


class CacheBackend(ABC):
    """缓存后端抽象基类"""
    
    @abstractmethod
    def get(self, key: str) -> Optional[Any]:
        """获取缓存值"""
        pass
    
    @abstractmethod
    def set(self, key: str, value: Any, expire_seconds: Optional[int] = None) -> None:
        """设置缓存值"""
        pass
    
    @abstractmethod
    def delete(self, key: str) -> None:
        """删除缓存值"""
        pass
    
    @abstractmethod
    def clear(self) -> None:
        """清空所有缓存"""
        pass
    
    @abstractmethod
    def exists(self, key: str) -> bool:
        """检查键是否存在"""
        pass


class MemoryCacheBackend(CacheBackend):
    """内存缓存后端"""
    
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
    
    def get(self, key: str) -> Optional[Any]:
        """获取缓存值"""
        if key not in self._cache:
            return None
        
        entry = self._cache[key]
        
        # 检查是否过期
        if "expires_at" in entry:
            if datetime.now() > entry["expires_at"]:
                del self._cache[key]
                return None
        
        return entry.get("value")
    
    def set(self, key: str, value: Any, expire_seconds: Optional[int] = None) -> None:
        """设置缓存值"""
        entry = {"value": value}
        
        if expire_seconds:
            entry["expires_at"] = datetime.now() + timedelta(seconds=expire_seconds)
        
        self._cache[key] = entry
    
    def delete(self, key: str) -> None:
        """删除缓存值"""
        if key in self._cache:
            del self._cache[key]
    
    def clear(self) -> None:
        """清空所有缓存"""
        self._cache.clear()
    
    def exists(self, key: str) -> bool:
        """检查键是否存在"""
        if key not in self._cache:
            return False
        
        # 检查是否过期
        entry = self._cache[key]
        if "expires_at" in entry:
            if datetime.now() > entry["expires_at"]:
                del self._cache[key]
                return False
        
        return True
    
    def clear_expired(self) -> int:
        """清理过期的缓存，返回清理的数量"""
        now = datetime.now()
        expired_keys = []
        
        for key, entry in self._cache.items():
            if "expires_at" in entry:
                if now > entry["expires_at"]:
                    expired_keys.append(key)
        
        for key in expired_keys:
            del self._cache[key]
        
        return len(expired_keys)
    
    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        total_size = sum(len(str(v).encode()) for v in self._cache.values())
        return {
            "total_entries": len(self._cache),
            "cache_size_mb": total_size / (1024 * 1024),
            "backend": "memory"
        }


class Cache:
    """统一缓存接口"""
    
    def __init__(self, backend: Optional[CacheBackend] = None):
        """
        初始化缓存
        
        Args:
            backend: 缓存后端，如果为None则使用内存缓存
        """
        self._backend = backend or MemoryCacheBackend()
    
    def get(self, key: str) -> Optional[Any]:
        """获取缓存值"""
        return self._backend.get(key)
    
    def set(
        self,
        key: str,
        value: Any,
        expire_seconds: Optional[int] = None,
        expire_days: Optional[int] = None
    ) -> None:
        """
        设置缓存值
        
        Args:
            key: 缓存键
            value: 缓存值
            expire_seconds: 过期时间（秒）
            expire_days: 过期时间（天）
        """
        if expire_days:
            expire_seconds = expire_days * 24 * 60 * 60
        
        self._backend.set(key, value, expire_seconds)
    
    def delete(self, key: str) -> None:
        """删除缓存值"""
        self._backend.delete(key)
    
    def clear(self) -> None:
        """清空所有缓存"""
        self._backend.clear()
    
    def exists(self, key: str) -> bool:
        """检查键是否存在"""
        return self._backend.exists(key)
    
    def get_or_set(
        self,
        key: str,
        default: Callable[[], Any],
        expire_seconds: Optional[int] = None,
        expire_days: Optional[int] = None
    ) -> Any:
        """
        获取缓存值，如果不存在则调用default函数获取值并缓存
        
        Args:
            key: 缓存键
            default: 获取默认值的函数
            expire_seconds: 过期时间（秒）
            expire_days: 过期时间（天）
        
        Returns:
            缓存值或默认值
        """
        value = self.get(key)
        if value is not None:
            return value
        
        value = default()
        self.set(key, value, expire_seconds=expire_seconds, expire_days=expire_days)
        return value
    
    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        if isinstance(self._backend, MemoryCacheBackend):
            return self._backend.get_stats()
        return {"backend": type(self._backend).__name__}


# 全局缓存实例
_default_cache = Cache()


def get_cache() -> Cache:
    """获取默认缓存实例"""
    return _default_cache


def generate_cache_key(prefix: str, *args, **kwargs) -> str:
    """
    生成缓存键
    
    Args:
        prefix: 键前缀
        *args: 位置参数
        **kwargs: 关键字参数
    
    Returns:
        缓存键字符串
    """
    # 将参数序列化为字符串
    key_parts = [prefix]
    
    if args:
        key_parts.append(json.dumps(args, sort_keys=True))
    
    if kwargs:
        key_parts.append(json.dumps(kwargs, sort_keys=True))
    
    key_str = ":".join(key_parts)
    
    # 如果键太长，使用MD5哈希
    if len(key_str) > 200:
        key_str = prefix + ":" + hashlib.md5(key_str.encode()).hexdigest()
    
    return key_str

