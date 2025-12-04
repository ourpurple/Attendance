"""
时区处理工具类
统一处理时区转换，确保数据库存储UTC时间，前端显示本地时间
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
import pytz


# 默认时区：中国标准时间 (UTC+8)
DEFAULT_TIMEZONE = pytz.timezone('Asia/Shanghai')


def to_utc(dt: datetime, from_timezone: Optional[pytz.timezone] = None) -> datetime:
    """
    将本地时间转换为UTC时间
    
    Args:
        dt: 要转换的时间
        from_timezone: 源时区，默认为Asia/Shanghai
    
    Returns:
        UTC时间（带时区信息）
    """
    if from_timezone is None:
        from_timezone = DEFAULT_TIMEZONE
    
    # 如果已经有时区信息
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc)
    
    # 如果没有时区信息，假定为本地时间
    localized = from_timezone.localize(dt)
    return localized.astimezone(timezone.utc)


def to_local(dt: datetime, to_timezone: Optional[pytz.timezone] = None) -> datetime:
    """
    将UTC时间转换为本地时间
    
    Args:
        dt: 要转换的时间（应该是UTC时间）
        to_timezone: 目标时区，默认为Asia/Shanghai
    
    Returns:
        本地时间（带时区信息）
    """
    if to_timezone is None:
        to_timezone = DEFAULT_TIMEZONE
    
    # 如果没有时区信息，假定为UTC
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    
    return dt.astimezone(to_timezone)


def now_utc() -> datetime:
    """
    获取当前UTC时间
    
    Returns:
        当前UTC时间（带时区信息）
    """
    return datetime.now(timezone.utc)


def now_local(tz: Optional[pytz.timezone] = None) -> datetime:
    """
    获取当前本地时间
    
    Args:
        tz: 时区，默认为Asia/Shanghai
    
    Returns:
        当前本地时间（带时区信息）
    """
    if tz is None:
        tz = DEFAULT_TIMEZONE
    
    return datetime.now(tz)


def format_datetime(dt: datetime, fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """
    格式化时间为字符串
    
    Args:
        dt: 要格式化的时间
        fmt: 格式字符串
    
    Returns:
        格式化后的字符串
    """
    return dt.strftime(fmt)


def parse_datetime(dt_str: str, fmt: str = "%Y-%m-%d %H:%M:%S", 
                   tz: Optional[pytz.timezone] = None) -> datetime:
    """
    解析时间字符串
    
    Args:
        dt_str: 时间字符串
        fmt: 格式字符串
        tz: 时区，默认为Asia/Shanghai
    
    Returns:
        解析后的时间（带时区信息）
    """
    if tz is None:
        tz = DEFAULT_TIMEZONE
    
    dt = datetime.strptime(dt_str, fmt)
    return tz.localize(dt)


def date_to_datetime(date_obj, tz: Optional[pytz.timezone] = None) -> datetime:
    """
    将date对象转换为datetime对象（时间为00:00:00）
    
    Args:
        date_obj: date对象
        tz: 时区，默认为Asia/Shanghai
    
    Returns:
        datetime对象（带时区信息）
    """
    if tz is None:
        tz = DEFAULT_TIMEZONE
    
    dt = datetime.combine(date_obj, datetime.min.time())
    return tz.localize(dt)


def get_date_range_utc(start_date, end_date, 
                       tz: Optional[pytz.timezone] = None) -> tuple[datetime, datetime]:
    """
    获取日期范围的UTC时间
    
    Args:
        start_date: 开始日期
        end_date: 结束日期
        tz: 时区，默认为Asia/Shanghai
    
    Returns:
        (start_datetime_utc, end_datetime_utc)
    """
    if tz is None:
        tz = DEFAULT_TIMEZONE
    
    # 开始时间：当天00:00:00
    start_dt = date_to_datetime(start_date, tz)
    start_utc = to_utc(start_dt, tz)
    
    # 结束时间：当天23:59:59
    end_dt = datetime.combine(end_date, datetime.max.time())
    end_dt = tz.localize(end_dt)
    end_utc = to_utc(end_dt, tz)
    
    return start_utc, end_utc
