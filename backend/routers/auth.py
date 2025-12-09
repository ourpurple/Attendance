from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
import httpx
from ..database import get_db
from ..models import User
from ..schemas import UserLogin, Token, UserCreate, UserResponse, WechatLogin
from ..security import verify_password, get_password_hash, create_access_token
from ..config import settings

router = APIRouter(prefix="/auth", tags=["认证"])


async def get_wechat_openid(code: str) -> str:
    """通过微信code获取openid"""
    if not settings.WECHAT_APPID or not settings.WECHAT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="微信配置未设置"
        )
    
    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": settings.WECHAT_APPID,
        "secret": settings.WECHAT_SECRET,
        "js_code": code,
        "grant_type": "authorization_code"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=10.0)
            data = response.json()
            
            if "errcode" in data:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"获取微信OpenID失败: {data.get('errmsg', '未知错误')}"
                )
            
            openid = data.get("openid")
            if not openid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="未能获取微信OpenID"
                )
            
            return openid
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"请求微信API失败: {str(e)}"
        )


@router.post("/login", response_model=Token)
async def login(user_login: UserLogin, db: Session = Depends(get_db)):
    """用户登录（支持绑定微信OpenID）"""
    user = db.query(User).filter(User.username == user_login.username).first()
    
    if not user or not verify_password(user_login.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户已被禁用"
        )
    
    # 如果提供了微信code，进行绑定
    if user_login.wechat_code:
        try:
            openid = await get_wechat_openid(user_login.wechat_code)
            
            # 检查该openid是否已被其他用户绑定
            existing_user = db.query(User).filter(User.wechat_openid == openid).first()
            if existing_user and existing_user.id != user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"该微信账号已被用户「{existing_user.real_name}({existing_user.username})」绑定，请联系管理员清理绑定关系"
                )
            
            # 绑定openid到当前用户
            user.wechat_openid = openid
            db.commit()
        except HTTPException as e:
            # 如果是code失效的错误，提供更友好的错误信息
            if "invalid code" in str(e.detail) or "code been used" in str(e.detail):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="微信授权码已失效，请重新获取"
                )
            # 其他HTTP异常直接抛出
            raise
        except Exception as e:
            # 如果绑定失败，不影响登录
            pass
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/wechat-login", response_model=Token)
async def wechat_login(wechat_login: WechatLogin, db: Session = Depends(get_db)):
    """微信登录（通过OpenID）"""
    try:
        # 获取微信OpenID
        openid = await get_wechat_openid(wechat_login.code)
        
        # 查找已绑定该OpenID的用户
        user = db.query(User).filter(User.wechat_openid == openid).first()
        
        if not user:
            # 未绑定，返回404提示需要绑定
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="需要绑定账号"
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="用户已被禁用"
            )
        
        # 生成token
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username},
            expires_delta=access_token_expires
        )
        
        return {"access_token": access_token, "token_type": "bearer"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="微信登录失败"
        )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_create: UserCreate, db: Session = Depends(get_db)):
    """用户注册（仅用于初始化，生产环境应该由管理员创建用户）"""
    # 检查用户名是否已存在
    if db.query(User).filter(User.username == user_create.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )
    
    # 检查邮箱是否已存在
    if user_create.email and db.query(User).filter(User.email == user_create.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邮箱已存在"
        )
    
    # 创建用户
    user = User(
        username=user_create.username,
        password_hash=get_password_hash(user_create.password),
        real_name=user_create.real_name,
        email=user_create.email,
        phone=user_create.phone,
        role=user_create.role,
        department_id=user_create.department_id
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user



