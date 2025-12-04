"""
配置管理模块
支持环境变量和配置验证
"""
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from typing import Optional, List
import os


class Settings(BaseSettings):
    """应用配置类"""
    
    # 应用配置
    APP_NAME: str = Field(default="考勤请假系统", description="应用名称")
    APP_VERSION: str = Field(default="1.0.0", description="应用版本")
    DEBUG: bool = Field(default=True, description="调试模式")
    ENVIRONMENT: str = Field(default="development", description="运行环境: development, testing, production")
    
    # 数据库配置
    DATABASE_URL: str = Field(
        default="sqlite:///./attendance.db",
        description="数据库连接URL"
    )
    
    # JWT配置
    SECRET_KEY: str = Field(
        default="your-secret-key-change-in-production",
        description="JWT密钥（生产环境必须修改）"
    )
    ALGORITHM: str = Field(default="HS256", description="JWT算法")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=60 * 24 * 7,  # 7天
        description="访问令牌过期时间（分钟）"
    )
    
    # CORS配置
    CORS_ORIGINS: List[str] = Field(
        default=["*"],
        description="允许的CORS来源（生产环境应配置具体域名）"
    )
    CORS_ALLOW_CREDENTIALS: bool = Field(
        default=True,
        description="是否允许携带凭证"
    )
    CORS_ALLOW_METHODS: List[str] = Field(
        default=["*"],
        description="允许的HTTP方法"
    )
    CORS_ALLOW_HEADERS: List[str] = Field(
        default=["*"],
        description="允许的HTTP头"
    )
    
    # 高德地图API配置
    AMAP_API_KEY: Optional[str] = Field(
        default=None,
        description="高德地图API Key"
    )
    
    # 微信小程序配置
    WECHAT_APPID: Optional[str] = Field(
        default=None,
        description="微信小程序AppID"
    )
    WECHAT_SECRET: Optional[str] = Field(
        default=None,
        description="微信小程序AppSecret"
    )
    WECHAT_APPROVAL_TEMPLATE_ID: Optional[str] = Field(
        default=None,
        description="审批提醒订阅消息模板ID"
    )
    WECHAT_RESULT_TEMPLATE_ID: Optional[str] = Field(
        default=None,
        description="审批结果通知订阅消息模板ID"
    )
    
    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str, info) -> str:
        """验证SECRET_KEY"""
        if info.data.get("ENVIRONMENT") == "production":
            if v == "your-secret-key-change-in-production":
                raise ValueError("生产环境必须修改SECRET_KEY")
            if len(v) < 32:
                raise ValueError("SECRET_KEY长度至少32个字符")
        return v
    
    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        """验证数据库URL"""
        if not v:
            raise ValueError("DATABASE_URL不能为空")
        return v
    
    @field_validator("CORS_ORIGINS")
    @classmethod
    def validate_cors_origins(cls, v: List[str], info) -> List[str]:
        """验证CORS配置"""
        if not v:
            return ["*"]
        
        # 生产环境警告使用通配符
        if info.data.get("ENVIRONMENT") == "production" and "*" in v:
            import warnings
            warnings.warn(
                "生产环境使用CORS通配符(*)存在安全风险，建议配置具体的域名白名单",
                UserWarning
            )
        
        return v
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"  # 忽略未定义的字段


def validate_settings(settings_instance: Optional[Settings] = None) -> None:
    """
    验证配置
    在应用启动时调用，确保关键配置正确
    
    Args:
        settings_instance: 要验证的Settings实例，如果为None则使用全局settings
    """
    if settings_instance is None:
        settings_instance = settings
    
    errors = []
    
    # 检查生产环境配置
    if settings_instance.ENVIRONMENT == "production":
        if settings_instance.DEBUG:
            errors.append("生产环境不能启用DEBUG模式")
        
        if settings_instance.SECRET_KEY == "your-secret-key-change-in-production":
            errors.append("生产环境必须修改SECRET_KEY")
        
        if settings_instance.DATABASE_URL.startswith("sqlite"):
            errors.append("生产环境不建议使用SQLite，建议使用PostgreSQL或MySQL")
    
    # 检查微信配置（如果配置了部分，应该全部配置）
    wechat_configs = [
        settings_instance.WECHAT_APPID,
        settings_instance.WECHAT_SECRET,
    ]
    wechat_configured = [c for c in wechat_configs if c]
    
    if len(wechat_configured) > 0 and len(wechat_configured) < len(wechat_configs):
        errors.append("微信配置不完整：如果配置了WECHAT_APPID或WECHAT_SECRET，应该全部配置")
    
    if errors:
        error_msg = "配置验证失败：\n" + "\n".join(f"  - {e}" for e in errors)
        raise ValueError(error_msg)


# 创建配置实例
settings = Settings()

# 根据环境变量设置默认值
if os.getenv("ENVIRONMENT"):
    settings.ENVIRONMENT = os.getenv("ENVIRONMENT")
