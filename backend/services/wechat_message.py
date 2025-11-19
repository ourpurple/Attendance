"""
微信订阅消息推送服务
"""
import httpx
import time
import logging
from typing import Optional, Dict, Any
from ..config import settings

logger = logging.getLogger(__name__)

# 全局缓存access_token
_access_token_cache: Optional[Dict[str, Any]] = None


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
    global _access_token_cache
    
    # 检查缓存是否有效（提前5分钟刷新）
    if _access_token_cache and _access_token_cache.get("expires_at", 0) > time.time() + 300:
        return _access_token_cache.get("access_token")
    
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
                
                # 缓存token
                _access_token_cache = {
                    "access_token": access_token,
                    "expires_at": time.time() + expires_in
                }
                
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
                logger.info(f"成功发送订阅消息给用户 {openid[:10]}...")
                return True
            else:
                errmsg = result.get("errmsg", "未知错误")
                # 43101表示用户拒绝接收消息，这是正常情况，不记录为错误
                if errcode == 43101:
                    logger.info(f"用户 {openid[:10]}... 拒绝接收订阅消息")
                else:
                    logger.warning(f"发送订阅消息失败: {errmsg} (errcode: {errcode})")
                return False
                
    except Exception as e:
        logger.error(f"发送订阅消息异常: {str(e)}")
        return False


def send_approval_notification(
    approver_openid: str,
    application_type: str,  # "leave" 或 "overtime"
    application_id: int,
    applicant_name: str,
    application_item: str,
    application_time: str,
    application_detail: str,
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
        start_date: 开始日期
        end_date: 结束日期
        reason: 申请原因
    
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
    # thing28: 申请项目（请假类型：普通请假、加班调休、年假调休；加班性质：主动加班、被动加班）
    # thing4: 申请详情（时间段等）
    logger.info(f"发送审批提醒消息 - 申请项目: {application_item}, 申请详情: {application_detail}")
    data = {
        "name1": {"value": _clip(applicant_name)},               # 申请人
        "time2": {"value": _clip(application_time)},             # 申请时间
        "thing28": {"value": _clip(application_item)},           # 申请项目（请假类型或加班性质）
        "thing4": {"value": _clip(application_detail)},          # 申请详情（时间段等）
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
        comment: 审批意见
    
    Returns:
        是否发送成功
    """
    if not settings.WECHAT_RESULT_TEMPLATE_ID:
        logger.warning("审批结果通知模板ID未配置，跳过消息推送")
        return False
    
    # 构建页面路径
    if application_type == "leave":
        page = f"pages/leave/leave?id={application_id}"
    else:
        page = f"pages/overtime/overtime?id={application_id}"
    
    # 构建模板数据
    # 字段对应“审批结果通知”模板
    status_text = "已通过" if approved else "已拒绝"
    data = {
        "thing14": {"value": _clip(applicant_name)},         # 申请人
        "thing28": {"value": _clip(application_item)},       # 审批事项
        "phrase1": {"value": _clip(status_text)},            # 审批结果
        "name2": {"value": _clip(approver_name)},            # 审批人
        "date3": {"value": _clip(approval_date)}             # 审批日期
    }
    
    return send_subscribe_message(
        applicant_openid,
        settings.WECHAT_RESULT_TEMPLATE_ID,
        page,
        data
    )

