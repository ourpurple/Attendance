"""
时区处理测试
"""
import pytest
from datetime import datetime, date, timezone
import pytz
from backend.utils.timezone import (
    to_utc,
    to_local,
    now_utc,
    now_local,
    format_datetime,
    parse_datetime,
    date_to_datetime,
    get_date_range_utc,
    DEFAULT_TIMEZONE
)


class TestTimezoneUtils:
    """时区工具测试"""
    
    def test_to_utc_naive_datetime(self):
        """测试将无时区信息的datetime转换为UTC"""
        # 2024-01-01 12:00:00 CST (Asia/Shanghai)
        local_dt = datetime(2024, 1, 1, 12, 0, 0)
        utc_dt = to_utc(local_dt)
        
        # CST是UTC+8，所以12:00 CST = 04:00 UTC
        assert utc_dt.hour == 4
        assert utc_dt.tzinfo == timezone.utc
    
    def test_to_utc_aware_datetime(self):
        """测试将有时区信息的datetime转换为UTC"""
        # 2024-01-01 12:00:00 CST
        local_dt = DEFAULT_TIMEZONE.localize(datetime(2024, 1, 1, 12, 0, 0))
        utc_dt = to_utc(local_dt)
        
        assert utc_dt.hour == 4
        assert utc_dt.tzinfo == timezone.utc
    
    def test_to_local_naive_datetime(self):
        """测试将无时区信息的datetime转换为本地时间"""
        # 假定为UTC时间
        utc_dt = datetime(2024, 1, 1, 4, 0, 0)
        local_dt = to_local(utc_dt)
        
        # UTC 04:00 = CST 12:00
        assert local_dt.hour == 12
        assert local_dt.tzinfo is not None
        assert str(local_dt.tzinfo) == 'Asia/Shanghai'
    
    def test_to_local_aware_datetime(self):
        """测试将有时区信息的datetime转换为本地时间"""
        utc_dt = datetime(2024, 1, 1, 4, 0, 0, tzinfo=timezone.utc)
        local_dt = to_local(utc_dt)
        
        assert local_dt.hour == 12
        assert local_dt.tzinfo is not None
        assert str(local_dt.tzinfo) == 'Asia/Shanghai'
    
    def test_now_utc(self):
        """测试获取当前UTC时间"""
        utc_now = now_utc()
        
        assert utc_now.tzinfo == timezone.utc
        # 确保时间是最近的
        assert (datetime.now(timezone.utc) - utc_now).total_seconds() < 1
    
    def test_now_local(self):
        """测试获取当前本地时间"""
        local_now = now_local()
        
        assert local_now.tzinfo is not None
        assert str(local_now.tzinfo) == 'Asia/Shanghai'
        # 确保时间是最近的
        assert (datetime.now(DEFAULT_TIMEZONE) - local_now).total_seconds() < 1
    
    def test_format_datetime(self):
        """测试格式化时间"""
        dt = datetime(2024, 1, 1, 12, 30, 45)
        formatted = format_datetime(dt)
        
        assert formatted == "2024-01-01 12:30:45"
    
    def test_format_datetime_custom_format(self):
        """测试自定义格式化"""
        dt = datetime(2024, 1, 1, 12, 30, 45)
        formatted = format_datetime(dt, "%Y/%m/%d")
        
        assert formatted == "2024/01/01"
    
    def test_parse_datetime(self):
        """测试解析时间字符串"""
        dt_str = "2024-01-01 12:30:45"
        dt = parse_datetime(dt_str)
        
        assert dt.year == 2024
        assert dt.month == 1
        assert dt.day == 1
        assert dt.hour == 12
        assert dt.minute == 30
        assert dt.second == 45
        assert dt.tzinfo is not None
        assert str(dt.tzinfo) == 'Asia/Shanghai'
    
    def test_date_to_datetime(self):
        """测试将date转换为datetime"""
        d = date(2024, 1, 1)
        dt = date_to_datetime(d)
        
        assert dt.year == 2024
        assert dt.month == 1
        assert dt.day == 1
        assert dt.hour == 0
        assert dt.minute == 0
        assert dt.second == 0
        assert dt.tzinfo is not None
        assert str(dt.tzinfo) == 'Asia/Shanghai'
    
    def test_get_date_range_utc(self):
        """测试获取日期范围的UTC时间"""
        start_date = date(2024, 1, 1)
        end_date = date(2024, 1, 2)
        
        start_utc, end_utc = get_date_range_utc(start_date, end_date)
        
        # 2024-01-01 00:00:00 CST = 2023-12-31 16:00:00 UTC
        assert start_utc.year == 2023
        assert start_utc.month == 12
        assert start_utc.day == 31
        assert start_utc.hour == 16
        
        # 2024-01-02 23:59:59 CST = 2024-01-02 15:59:59 UTC
        assert end_utc.year == 2024
        assert end_utc.month == 1
        assert end_utc.day == 2
        assert end_utc.hour == 15
    
    def test_roundtrip_conversion(self):
        """测试往返转换"""
        # 本地时间 -> UTC -> 本地时间
        original = DEFAULT_TIMEZONE.localize(datetime(2024, 1, 1, 12, 0, 0))
        utc = to_utc(original)
        back_to_local = to_local(utc)
        
        # 应该相等（可能时区对象不同，但时间相同）
        assert original.year == back_to_local.year
        assert original.month == back_to_local.month
        assert original.day == back_to_local.day
        assert original.hour == back_to_local.hour
        assert original.minute == back_to_local.minute
        assert original.second == back_to_local.second
