"""
响应工具类
统一响应转换处理
"""
from typing import Optional, Dict, Any
from ..models import LeaveApplication, OvertimeApplication
from ..schemas import LeaveApplicationResponse, OvertimeApplicationResponse
from .date_utils import DateUtils


class ResponseUtils:
    """响应工具类"""
    
    @staticmethod
    def to_leave_response(leave: LeaveApplication, extra: Optional[dict] = None) -> LeaveApplicationResponse:
        """转换为请假申请响应"""
        data = LeaveApplicationResponse.from_orm(leave).model_dump()
        if extra:
            data.update(extra)
        if not data.get("leave_type_name"):
            data["leave_type_name"] = leave.leave_type.name if leave.leave_type else None
        if extra:
            data.update(extra)
        return LeaveApplicationResponse(**data)
    
    @staticmethod
    def to_overtime_response(overtime: OvertimeApplication, extra: Optional[dict] = None) -> OvertimeApplicationResponse:
        """转换为加班申请响应"""
        data = OvertimeApplicationResponse.from_orm(overtime).model_dump()
        if extra:
            data.update(extra)
        return OvertimeApplicationResponse(**data)
    
    @staticmethod
    def build_leave_application_detail(leave: LeaveApplication) -> str:
        """构建请假申请详情字符串"""
        start_str = DateUtils.format_date(leave.start_date)
        end_str = DateUtils.format_date(leave.end_date)
        if start_str and end_str:
            return f"{start_str} 至 {end_str} 共{leave.days}天"
        return start_str or end_str or ""
    
    @staticmethod
    def get_leave_type_name(leave: LeaveApplication, preset: Optional[str] = None) -> str:
        """获取请假类型名称"""
        if preset:
            return preset
        if leave.leave_type and leave.leave_type.name:
            return leave.leave_type.name
        return "普通请假"
    
    @staticmethod
    def get_leave_application_time(leave: LeaveApplication) -> str:
        """获取请假申请时间字符串"""
        return DateUtils.format_datetime(getattr(leave, "created_at", None))
    
    @staticmethod
    def get_leave_reason(leave: LeaveApplication) -> str:
        """获取请假原因"""
        return leave.reason or "无"
    
    @staticmethod
    def get_overtime_reason(overtime: OvertimeApplication) -> str:
        """获取加班原因"""
        return overtime.reason or "无"
    
    @staticmethod
    def build_overtime_application_detail(overtime: OvertimeApplication) -> str:
        """构建加班申请详情字符串"""
        start_str = DateUtils.format_datetime(overtime.start_time)
        end_str = DateUtils.format_datetime(overtime.end_time)
        if start_str and end_str:
            detail = f"{start_str} 至 {end_str}"
        else:
            detail = start_str or end_str or ""
        if overtime.hours is not None:
            detail = f"{detail} 共{overtime.hours}小时" if detail else f"共{overtime.hours}小时"
        return detail
    
    @staticmethod
    def get_overtime_application_time(overtime: OvertimeApplication) -> str:
        """获取加班申请时间字符串"""
        return DateUtils.format_datetime(getattr(overtime, "created_at", None))
    
    @staticmethod
    def get_overtime_type_text(overtime: OvertimeApplication) -> str:
        """获取加班类型文本"""
        from ..models import OvertimeType
        if overtime.overtime_type == OvertimeType.PASSIVE:
            return "被动加班"
        if overtime.overtime_type == OvertimeType.ACTIVE:
            return "主动加班"
        return "加班"

