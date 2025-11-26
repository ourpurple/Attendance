"""
日期工具类
统一日期格式化处理
"""
from datetime import datetime, date
from typing import Optional


class DateUtils:
    """日期工具类"""
    
    @staticmethod
    def format_datetime(value: Optional[datetime]) -> str:
        """格式化日期时间为字符串 (YYYY-MM-DD HH:MM)"""
        if isinstance(value, datetime):
            return value.strftime("%Y-%m-%d %H:%M")
        if isinstance(value, date):
            return datetime.combine(value, datetime.min.time()).strftime("%Y-%m-%d %H:%M")
        if value:
            return str(value)
        return ""
    
    @staticmethod
    def format_date(value: Optional[date]) -> str:
        """格式化日期为字符串 (YYYY-MM-DD)"""
        if isinstance(value, datetime):
            return value.strftime("%Y-%m-%d")
        if isinstance(value, date):
            return value.strftime("%Y-%m-%d")
        if value:
            return str(value)
        return ""
    
    @staticmethod
    def format_time(value: Optional[datetime]) -> str:
        """格式化时间为字符串 (HH:MM)"""
        if isinstance(value, datetime):
            return value.strftime("%H:%M")
        if value:
            return str(value)
        return ""
    
    @staticmethod
    def parse_date(date_str: str) -> Optional[date]:
        """解析日期字符串"""
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def parse_datetime(datetime_str: str) -> Optional[datetime]:
        """解析日期时间字符串"""
        try:
            return datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")
        except (ValueError, TypeError):
            try:
                return datetime.strptime(datetime_str, "%Y-%m-%d %H:%M")
            except (ValueError, TypeError):
                return None

