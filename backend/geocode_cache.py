"""
地理编码缓存模块
使用内存缓存来减少高德地图API调用
"""
from typing import Optional, Dict
from datetime import datetime, timedelta
import hashlib

# 内存缓存字典
_cache: Dict[str, Dict] = {}

# 缓存过期时间（天）
CACHE_EXPIRE_DAYS = 30


def _get_cache_key(latitude: float, longitude: float) -> str:
    """生成缓存键（经纬度四舍五入到小数点后4位）"""
    # 四舍五入到小数点后4位，减少缓存键数量
    lat_rounded = round(latitude, 4)
    lon_rounded = round(longitude, 4)
    key_str = f"{lat_rounded},{lon_rounded}"
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
    
    if cache_key not in _cache:
        return None
    
    cache_entry = _cache[cache_key]
    
    # 检查是否过期
    cached_time = cache_entry.get("cached_at")
    if cached_time:
        expire_time = cached_time + timedelta(days=CACHE_EXPIRE_DAYS)
        if datetime.now() > expire_time:
            # 缓存已过期，删除
            del _cache[cache_key]
            return None
    
    return cache_entry.get("address")


def set_cached_address(latitude: float, longitude: float, address: str):
    """
    将地址保存到缓存
    
    Args:
        latitude: 纬度
        longitude: 经度
        address: 地址文本
    """
    cache_key = _get_cache_key(latitude, longitude)
    _cache[cache_key] = {
        "address": address,
        "cached_at": datetime.now()
    }


def clear_expired_cache():
    """清理过期的缓存"""
    now = datetime.now()
    expired_keys = []
    
    for key, entry in _cache.items():
        cached_time = entry.get("cached_at")
        if cached_time:
            expire_time = cached_time + timedelta(days=CACHE_EXPIRE_DAYS)
            if now > expire_time:
                expired_keys.append(key)
    
    for key in expired_keys:
        del _cache[key]


def get_cache_stats() -> Dict:
    """获取缓存统计信息"""
    return {
        "total_entries": len(_cache),
        "cache_size_mb": sum(len(str(v).encode()) for v in _cache.values()) / (1024 * 1024)
    }


