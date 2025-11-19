from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # 应用配置
    APP_NAME: str = "考勤请假系统"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # 数据库配置
    DATABASE_URL: str = "sqlite:///./attendance.db"
    
    # JWT配置
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7天
    
    # CORS配置
    CORS_ORIGINS: list = ["*"]
    
    # 高德地图API配置
    AMAP_API_KEY: Optional[str] = None  # 高德地图API Key
    
    # 微信小程序配置
    WECHAT_APPID: Optional[str] = None  # 微信小程序AppID
    WECHAT_SECRET: Optional[str] = None  # 微信小程序AppSecret
    WECHAT_APPROVAL_TEMPLATE_ID: Optional[str] = None  # 审批提醒订阅消息模板ID
    WECHAT_RESULT_TEMPLATE_ID: Optional[str] = None  # 审批结果通知订阅消息模板ID
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


settings = Settings()


