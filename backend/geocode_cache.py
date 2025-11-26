"""
地理编码缓存模块
使用统一缓存接口来减少高德地图API调用
"""
from typing import Optional, Dict
import hashlib
from .utils.cache import get_cache, generate_cache_key

# 缓存过期时间（天）
CACHE_EXPIRE_DAYS = 30

# 获取缓存实例
_cache = get_cache()


def _get_cache_key(latitude: float, longitude: float) -> str:
    """生成缓存键（经纬度四舍五入到小数点后4位）"""
    # 四舍五入到小数点后4位，减少缓存键数量
    lat_rounded = round(latitude, 4)
    lon_rounded = round(longitude, 4)
    key_str = f"geocode:{lat_rounded},{lon_rounded}"
    return hashlib.md5(key_str.encode()).hexdigest()


def get_cached_address(latitude: float, longitude: float) -> Optional[str]:
    """
    从缓存中获取地址
    
    Args:
        latitude: 纬度
        longitude: 经度
        
    Returns:
        地址文本，如果缓存不存在或已过期则返回None
    """
    cache_key = _get_cache_key(latitude, longitude)
    return _cache.get(cache_key)


def set_cached_address(latitude: float, longitude: float, address: str):
    """
    将地址保存到缓存
    
    Args:
        latitude: 纬度
        longitude: 经度
        address: 地址文本
    """
    cache_key = _get_cache_key(latitude, longitude)
    _cache.set(cache_key, address, expire_days=CACHE_EXPIRE_DAYS)


def clear_expired_cache():
    """清理过期的缓存"""
    # 统一缓存接口会自动处理过期清理
    if hasattr(_cache._backend, 'clear_expired'):
        _cache._backend.clear_expired()


def get_cache_stats() -> Dict:
    """获取缓存统计信息"""
    return _cache.get_stats()


