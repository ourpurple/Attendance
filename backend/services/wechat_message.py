"""
微信订阅消息推送服务
"""
import httpx
import time
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from ..config import settings

logger = logging.getLogger(__name__)

# 全局缓存access_token
from ..utils.cache import get_cache

# 使用统一缓存接口
_cache = get_cache()
ACCESS_TOKEN_CACHE_KEY = "wechat:access_token"


def _clip(value: Optional[str], max_len: int = 20) -> str:
    """裁剪模板字段值，避免超过限制"""
    if not value:
        return ""
    value = str(value)
    return value[:max_len]


def get_access_token() -> Optional[str]:
    """
    获取微信access_token（带缓存机制）
    
    Returns:
        access_token字符串，如果获取失败返回None
    """
    # 检查缓存是否有效（提前5分钟刷新，即缓存时间减少5分钟）
    cached_token = _cache.get(ACCESS_TOKEN_CACHE_KEY)
    if cached_token:
        return cached_token
    
    if not settings.WECHAT_APPID or not settings.WECHAT_SECRET:
        logger.warning("微信配置未设置，无法获取access_token")
        return None
    
    try:
        url = "https://api.weixin.qq.com/cgi-bin/token"
        params = {
            "grant_type": "client_credential",
            "appid": settings.WECHAT_APPID,
            "secret": settings.WECHAT_SECRET
        }
        
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if "access_token" in data:
                access_token = data["access_token"]
                expires_in = data.get("expires_in", 7200)
                
                # 缓存token（提前5分钟过期，确保及时刷新）
                expire_seconds = max(expires_in - 300, 60)  # 至少保留60秒
                _cache.set(ACCESS_TOKEN_CACHE_KEY, access_token, expire_seconds=expire_seconds)
                
                logger.info("成功获取微信access_token")
                return access_token
            else:
                error_msg = data.get("errmsg", "未知错误")
                logger.error(f"获取微信access_token失败: {error_msg}")
                return None
                
    except Exception as e:
        logger.error(f"获取微信access_token异常: {str(e)}")
        return None


def send_subscribe_message(
    openid: str,
    template_id: str,
    page: str,
    data: Dict[str, Dict[str, str]]
) -> bool:
    """
    发送微信订阅消息
    
    Args:
        openid: 用户微信openid
        template_id: 订阅消息模板ID
        page: 点击消息跳转的页面路径
        data: 模板数据，格式: {"thing1": {"value": "xxx"}, ...}
    
    Returns:
        是否发送成功
    """
    access_token = get_access_token()
    if not access_token:
        logger.warning("无法获取access_token，跳过消息推送")
        return False
    
    if not openid:
        logger.warning("用户openid为空，跳过消息推送")
        return False
    
    try:
        url = f"https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token={access_token}"
        payload = {
            "touser": openid,
            "template_id": template_id,
            "page": page,
            "data": data
        }
        
        with httpx.Client(timeout=10.0) as client:
            response = client.post(url, json=payload)
            response.raise_for_status()
            result = response.json()
            
            errcode = result.get("errcode", 0)
            if errcode == 0:
                logger.info(f"成功发送订阅消息给用户 {openid[:10]}... (模板ID: {template_id[:20]}...)")
                return True
            else:
                errmsg = result.get("errmsg", "未知错误")
                # 43101表示用户拒绝接收消息，这是正常情况，不记录为错误
                if errcode == 43101:
                    logger.info(f"用户 {openid[:10]}... 拒绝接收订阅消息 (模板ID: {template_id[:20]}...)")
                else:
                    logger.warning(f"发送订阅消息失败: {errmsg} (errcode: {errcode}, 模板ID: {template_id[:20]}..., 用户: {openid[:10]}...)")
                return False
                
    except Exception as e:
        logger.error(f"发送订阅消息异常: {str(e)} (模板ID: {template_id[:20]}..., 用户: {openid[:10]}...)")
        return False


def send_approval_notification(
    approver_openid: str,
    application_type: str,  # "leave" 或 "overtime"
    application_id: int,
    applicant_name: str,
    application_item: str,
    application_time: str,
    reason: str,
    status_text: str = "待审批"
) -> bool:
    """
    发送审批提醒消息给审批人
    
    Args:
        approver_openid: 审批人微信openid
        applicant_name: 申请人姓名
        application_type: 申请类型 ("leave" 或 "overtime")
        application_id: 申请ID
        application_item: 申请项目（请假类型：普通请假、加班调休、年假调休；加班性质：主动加班、被动加班）
        application_time: 申请时间
        reason: 申请原因
        status_text: 审核状态
    
    Returns:
        是否发送成功
    """
    if not settings.WECHAT_APPROVAL_TEMPLATE_ID:
        logger.warning("审批提醒模板ID未配置，跳过消息推送")
        return False
    
    # 构建页面路径
    if application_type == "leave":
        page = f"pages/approval/approval?type=leave&id={application_id}"
    else:
        page = f"pages/approval/approval?type=overtime&id={application_id}"
    
    # 构建模板数据
    # 字段对应"待审批通知"模板
    # name1: 申请人
    # time2: 申请时间
    # thing4: 申请项目（请假类型：普通请假、加班调休、年假调休；加班性质：主动加班、被动加班）
    # thing11: 事由
    # phrase16: 审核状态
    logger.info(f"发送审批提醒消息 - 申请项目: {application_item}, 申请时间: {application_time}")
    data = {
        "name1": {"value": _clip(applicant_name)},               # 申请人
        "time2": {"value": _clip(application_time)},             # 申请时间
        "thing4": {"value": _clip(application_item)},            # 申请项目（请假类型或加班性质）
        "thing11": {"value": _clip(reason or "无")},             # 事由
        "phrase16": {"value": _clip(status_text)}                # 审核状态
    }
    
    return send_subscribe_message(
        approver_openid,
        settings.WECHAT_APPROVAL_TEMPLATE_ID,
        page,
        data
    )


def send_approval_result_notification(
    applicant_openid: str,
    application_type: str,  # "leave" 或 "overtime"
    application_id: int,
    applicant_name: str,
    application_item: str,
    approved: bool,
    approver_name: str,
    approval_date: str
) -> bool:
    """
    发送审批结果通知给申请人
    
    Args:
        applicant_openid: 申请人微信openid
        application_type: 申请类型 ("leave" 或 "overtime")
        application_id: 申请ID
        approved: 是否通过
        approver_name: 审批人姓名
        approval_date: 审批日期（格式：YYYY-MM-DD 或 YYYYMMDD）
    
    Returns:
        是否发送成功
    """
    if not settings.WECHAT_RESULT_TEMPLATE_ID:
        logger.warning("审批结果通知模板ID未配置，跳过消息推送")
        return False
    
    if not applicant_openid:
        logger.warning("申请人openid为空，跳过审批结果通知推送")
        return False
    
    # 构建页面路径
    if application_type == "leave":
        page = f"pages/leave/leave?id={application_id}"
    else:
        page = f"pages/overtime/overtime?id={application_id}"
    
    # 构建模板数据
    # 字段对应"审批结果通知"模板
    status_text = "已通过" if approved else "已拒绝"
    
    # 处理日期格式：微信的date类型要求格式为 "YYYY年MM月DD日"
    # 例如：2025年11月20日
    try:
        if approval_date:
            # 尝试解析日期
            if isinstance(approval_date, str):
                # 如果是字符串，尝试解析
                if "-" in approval_date:
                    # YYYY-MM-DD 格式
                    date_obj = datetime.strptime(approval_date.split()[0], "%Y-%m-%d")
                elif len(approval_date) == 8 and approval_date.isdigit():
                    # YYYYMMDD 格式
                    date_obj = datetime.strptime(approval_date, "%Y%m%d")
                else:
                    # 尝试其他格式
                    date_obj = datetime.strptime(approval_date.split()[0], "%Y-%m-%d")
            else:
                # 如果不是字符串，假设是datetime对象
                date_obj = approval_date if isinstance(approval_date, datetime) else datetime.now()
        else:
            # 如果日期为空，使用当前日期
            date_obj = datetime.now()
            logger.warning(f"审批日期为空，使用当前日期")
        
        # 格式化为微信要求的格式：YYYY年MM月DD日
        final_date = date_obj.strftime("%Y年%m月%d日")
        
    except (ValueError, AttributeError) as e:
        # 如果解析失败，使用当前日期
        logger.error(f"日期格式解析失败: {approval_date}, 错误: {str(e)}，使用当前日期")
        final_date = datetime.now().strftime("%Y年%m月%d日")
    
    logger.info(f"发送审批结果通知 - 申请人: {applicant_name}, 审批事项: {application_item}, 结果: {status_text}, 审批人: {approver_name}, 日期: {final_date}")
    
    data = {
        "thing14": {"value": _clip(applicant_name)},         # 申请人
        "thing28": {"value": _clip(application_item)},       # 审批事项
        "phrase1": {"value": _clip(status_text)},            # 审批结果
        "name2": {"value": _clip(approver_name)},            # 审批人
        "date3": {"value": final_date}                       # 审批日期（YYYY年MM月DD日格式，不使用_clip）
    }
    
    return send_subscribe_message(
        applicant_openid,
        settings.WECHAT_RESULT_TEMPLATE_ID,
        page,
        data
    )

