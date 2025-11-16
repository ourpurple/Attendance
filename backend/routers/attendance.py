from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import List, Optional, Dict, Any
from datetime import datetime, date, timedelta
import json
import httpx
from ..database import get_db
from ..models import Attendance, User, AttendancePolicy, UserRole
from ..schemas import (
    AttendanceCheckin, AttendanceCheckout, AttendanceResponse, 
    AttendancePolicyResponse, AttendancePolicyCreate, AttendancePolicyUpdate,
    BatchGeocodeRequest, BatchGeocodeResponse, GeocodeResult, LocationPoint
)
from ..security import get_current_user, get_current_active_admin
from ..config import settings
from ..geocode_cache import get_cached_address, set_cached_address

router = APIRouter(prefix="/attendance", tags=["考勤管理"])


def get_policy_for_date(policy: AttendancePolicy, check_date: datetime) -> Dict[str, Any]:
    """
    获取指定日期的策略规则
    
    Args:
        policy: 打卡策略对象
        check_date: 检查日期
        
    Returns:
        包含策略规则的字典
    """
    # 获取星期几（0=周一, 6=周日）
    weekday = check_date.weekday()
    
    # 默认规则
    rules = {
        'work_start_time': policy.work_start_time,
        'work_end_time': policy.work_end_time,
        'checkin_start_time': policy.checkin_start_time,
        'checkin_end_time': policy.checkin_end_time,
        'checkout_start_time': policy.checkout_start_time,
        'checkout_end_time': policy.checkout_end_time,
        'late_threshold_minutes': policy.late_threshold_minutes,
        'early_threshold_minutes': policy.early_threshold_minutes,
    }
    
    # 如果有每周规则，则应用特定规则
    if policy.weekly_rules:
        try:
            weekly_rules = json.loads(policy.weekly_rules)
            if str(weekday) in weekly_rules:
                day_rules = weekly_rules[str(weekday)]
                rules.update(day_rules)
        except (json.JSONDecodeError, TypeError):
            pass  # 使用默认规则
    
    return rules


def calculate_work_hours(checkin_time: datetime, checkout_time: datetime) -> float:
    """计算工作时长（小时）"""
    delta = checkout_time - checkin_time
    return round(delta.total_seconds() / 3600, 2)


def is_late(checkin_time: datetime, policy: AttendancePolicy) -> bool:
    """判断是否迟到"""
    rules = get_policy_for_date(policy, checkin_time)
    work_start = datetime.strptime(rules['work_start_time'], "%H:%M").time()
    checkin = checkin_time.time()
    
    # 加上迟到阈值
    work_start_with_threshold = (
        datetime.combine(date.today(), work_start) + 
        timedelta(minutes=rules['late_threshold_minutes'])
    ).time()
    
    return checkin > work_start_with_threshold


def is_early_leave(checkout_time: datetime, policy: AttendancePolicy) -> bool:
    """判断是否早退"""
    rules = get_policy_for_date(policy, checkout_time)
    work_end = datetime.strptime(rules['work_end_time'], "%H:%M").time()
    checkout = checkout_time.time()
    
    # 减去早退阈值
    work_end_with_threshold = (
        datetime.combine(date.today(), work_end) - 
        timedelta(minutes=rules['early_threshold_minutes'])
    ).time()
    
    return checkout < work_end_with_threshold


@router.post("/checkin", response_model=AttendanceResponse)
def checkin(
    checkin_data: AttendanceCheckin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """上班打卡"""
    # 获取当前日期
    today = datetime.now().date()
    
    # 检查今天是否已经打过卡
    existing_attendance = db.query(Attendance).filter(
        and_(
            Attendance.user_id == current_user.id,
            func.date(Attendance.date) == today
        )
    ).first()
    
    if existing_attendance and existing_attendance.checkin_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="今天已经打过上班卡"
        )
    
    # 获取活跃的打卡策略
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
    
    checkin_time = datetime.now()
    
    # 验证打卡时间是否在策略允许的范围内
    if policy:
        rules = get_policy_for_date(policy, checkin_time)
        checkin_start = datetime.strptime(rules['checkin_start_time'], "%H:%M").time()
        checkin_end = datetime.strptime(rules['checkin_end_time'], "%H:%M").time()
        checkin_time_only = checkin_time.time()
        
        if checkin_time_only < checkin_start or checkin_time_only > checkin_end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"当前时间不在上班打卡时间范围内（{rules['checkin_start_time']} - {rules['checkin_end_time']}）"
            )
    
    late = is_late(checkin_time, policy) if policy else False
    
    if existing_attendance:
        # 更新现有记录
        existing_attendance.checkin_time = checkin_time
        # 优先使用地址文本，如果没有则使用坐标字符串
        existing_attendance.checkin_location = checkin_data.address or checkin_data.location
        existing_attendance.checkin_latitude = checkin_data.latitude
        existing_attendance.checkin_longitude = checkin_data.longitude
        existing_attendance.is_late = late
        attendance = existing_attendance
    else:
        # 创建新记录
        attendance = Attendance(
            user_id=current_user.id,
            checkin_time=checkin_time,
            # 优先使用地址文本，如果没有则使用坐标字符串
            checkin_location=checkin_data.address or checkin_data.location,
            checkin_latitude=checkin_data.latitude,
            checkin_longitude=checkin_data.longitude,
            is_late=late,
            date=datetime.combine(today, datetime.min.time())
        )
        db.add(attendance)
    
    db.commit()
    db.refresh(attendance)
    
    return attendance


@router.post("/checkout", response_model=AttendanceResponse)
def checkout(
    checkout_data: AttendanceCheckout,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """下班打卡"""
    # 获取当前日期
    today = datetime.now().date()
    
    # 查找今天的考勤记录
    attendance = db.query(Attendance).filter(
        and_(
            Attendance.user_id == current_user.id,
            func.date(Attendance.date) == today
        )
    ).first()
    
    if not attendance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先打上班卡"
        )
    
    if attendance.checkout_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="今天已经打过下班卡"
        )
    
    # 获取活跃的打卡策略
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
    
    checkout_time = datetime.now()
    
    # 验证打卡时间是否在策略允许的范围内
    if policy:
        rules = get_policy_for_date(policy, checkout_time)
        checkout_start = datetime.strptime(rules['checkout_start_time'], "%H:%M").time()
        checkout_end = datetime.strptime(rules['checkout_end_time'], "%H:%M").time()
        checkout_time_only = checkout_time.time()
        
        if checkout_time_only < checkout_start or checkout_time_only > checkout_end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"当前时间不在下班打卡时间范围内（{rules['checkout_start_time']} - {rules['checkout_end_time']}）"
            )
    
    early = is_early_leave(checkout_time, policy) if policy else False
    
    # 更新记录
    attendance.checkout_time = checkout_time
    # 优先使用地址文本，如果没有则使用坐标字符串
    attendance.checkout_location = checkout_data.address or checkout_data.location
    attendance.checkout_latitude = checkout_data.latitude
    attendance.checkout_longitude = checkout_data.longitude
    attendance.is_early_leave = early
    
    # 计算工作时长
    if attendance.checkin_time:
        attendance.work_hours = calculate_work_hours(attendance.checkin_time, checkout_time)
    
    db.commit()
    db.refresh(attendance)
    
    return attendance


@router.get("/check-late")
def check_late(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """检查当前时间打卡是否会迟到（打卡前调用）"""
    # 获取活跃的打卡策略
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
    
    if not policy:
        return {"will_be_late": False, "work_start_time": None, "current_time": None}
    
    checkin_time = datetime.now()
    will_be_late = is_late(checkin_time, policy)
    
    # 获取工作开始时间
    rules = get_policy_for_date(policy, checkin_time)
    work_start = rules.get('work_start_time', '09:00')
    
    return {
        "will_be_late": will_be_late,
        "work_start_time": work_start,
        "current_time": checkin_time.strftime("%H:%M:%S")
    }


@router.get("/check-early-leave")
def check_early_leave(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """检查当前时间打卡是否会早退（打卡前调用）"""
    # 获取活跃的打卡策略
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
    
    if not policy:
        return {"will_be_early_leave": False, "work_end_time": None, "current_time": None}
    
    checkout_time = datetime.now()
    will_be_early_leave = is_early_leave(checkout_time, policy)
    
    # 获取工作结束时间
    rules = get_policy_for_date(policy, checkout_time)
    work_end = rules.get('work_end_time', '18:00')
    
    return {
        "will_be_early_leave": will_be_early_leave,
        "work_end_time": work_end,
        "current_time": checkout_time.strftime("%H:%M:%S")
    }


@router.get("/my", response_model=List[AttendanceResponse])
def get_my_attendance(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取我的考勤记录"""
    query = db.query(Attendance).filter(Attendance.user_id == current_user.id)
    
    if start_date:
        query = query.filter(func.date(Attendance.date) >= start_date)
    if end_date:
        query = query.filter(func.date(Attendance.date) <= end_date)
    
    attendances = query.order_by(Attendance.date.desc()).offset(skip).limit(limit).all()
    return attendances


@router.get("/user/{user_id}", response_model=List[AttendanceResponse])
def get_user_attendance(
    user_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取指定用户的考勤记录（管理员或部门主任）"""
    # 权限检查
    if current_user.role not in [UserRole.ADMIN, UserRole.DEPARTMENT_HEAD, UserRole.VICE_PRESIDENT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    query = db.query(Attendance).filter(Attendance.user_id == user_id)
    
    if start_date:
        query = query.filter(func.date(Attendance.date) >= start_date)
    if end_date:
        query = query.filter(func.date(Attendance.date) <= end_date)
    
    attendances = query.order_by(Attendance.date.desc()).offset(skip).limit(limit).all()
    return attendances


@router.get("/", response_model=List[AttendanceResponse])
def list_attendance(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """获取所有考勤记录（管理员）"""
    query = db.query(Attendance)
    
    if start_date:
        query = query.filter(func.date(Attendance.date) >= start_date)
    if end_date:
        query = query.filter(func.date(Attendance.date) <= end_date)
    if user_id:
        query = query.filter(Attendance.user_id == user_id)
    
    attendances = query.order_by(Attendance.date.desc()).offset(skip).limit(limit).all()
    return attendances


# ==================== 打卡策略管理 ====================
@router.get("/policies", response_model=List[AttendancePolicyResponse])
def list_policies(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取打卡策略列表"""
    policies = db.query(AttendancePolicy).offset(skip).limit(limit).all()
    return policies


@router.post("/policies", response_model=AttendancePolicyResponse, status_code=status.HTTP_201_CREATED)
def create_policy(
    policy_create: AttendancePolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """创建打卡策略（管理员）"""
    # 如果新策略是活跃的，将其他策略设为非活跃
    if policy_create.is_active:
        db.query(AttendancePolicy).update({"is_active": False})
    
    policy = AttendancePolicy(**policy_create.model_dump())
    db.add(policy)
    db.commit()
    db.refresh(policy)
    
    return policy


@router.put("/policies/{policy_id}", response_model=AttendancePolicyResponse)
def update_policy(
    policy_id: int,
    policy_update: AttendancePolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """更新打卡策略（管理员）"""
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="策略不存在"
        )
    
    update_data = policy_update.model_dump(exclude_unset=True)
    
    # 如果要激活这个策略，先将其他策略设为非活跃
    if update_data.get("is_active"):
        db.query(AttendancePolicy).filter(AttendancePolicy.id != policy_id).update({"is_active": False})
    
    for field, value in update_data.items():
        setattr(policy, field, value)
    
    db.commit()
    db.refresh(policy)
    
    return policy


@router.delete("/policies/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """删除打卡策略（管理员）"""
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="策略不存在"
        )
    
    db.delete(policy)
    db.commit()
    
    return None


async def _reverse_geocode_internal(latitude: float, longitude: float) -> str:
    """
    内部逆地理编码函数，带缓存
    """
    # 先检查缓存
    cached_address = get_cached_address(latitude, longitude)
    if cached_address:
        return cached_address
    
    # 检查API Key配置
    api_key = settings.AMAP_API_KEY
    if not api_key or api_key.strip() == "":
        # 如果未配置API Key，返回坐标作为备选方案
        address = f"{latitude:.6f}, {longitude:.6f}"
        return address
    
    try:
        # 调用高德地图逆地理编码API
        # 注意：高德地图API要求经纬度格式为：经度,纬度
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                "https://restapi.amap.com/v3/geocode/regeo",
                params={
                    "key": api_key,
                    "location": f"{longitude},{latitude}",  # 高德地图要求：经度,纬度
                    "radius": 1000,
                    "extensions": "all",
                    "output": "json"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="高德地图API请求失败"
                )
            
            data = response.json()
            
            # 检查API返回状态
            if data.get("status") != "1":
                error_msg = data.get("info", "未知错误")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"高德地图API错误: {error_msg}"
                )
            
            # 提取地址信息
            regeocode = data.get("regeocode", {})
            if not regeocode:
                return {"address": f"{latitude:.6f}, {longitude:.6f}"}
            
            formatted_address = regeocode.get("formatted_address", "")
            addressComponent = regeocode.get("addressComponent", {})
            
            # 构建详细地址
            if formatted_address:
                # 如果有格式化地址，直接使用
                address = formatted_address
            else:
                # 否则手动构建地址
                province = addressComponent.get("province", "")
                city = addressComponent.get("city", "") or addressComponent.get("district", "")
                district = addressComponent.get("district", "")
                township = addressComponent.get("township", "")
                street = addressComponent.get("street", "")
                streetNumber = addressComponent.get("streetNumber", {})
                building = addressComponent.get("building", {})
                
                # 构建地址字符串
                address_parts = []
                if province:
                    address_parts.append(province)
                if city and city != province:
                    address_parts.append(city)
                if district and district != city:
                    address_parts.append(district)
                if township:
                    address_parts.append(township)
                if street:
                    address_parts.append(street)
                if streetNumber and streetNumber.get("number"):
                    address_parts.append(streetNumber["number"] + "号")
                if building and building.get("name"):
                    address_parts.append(building["name"])
                
                address = "".join(address_parts) if address_parts else f"{latitude:.6f}, {longitude:.6f}"
            
            # 保存到缓存
            set_cached_address(latitude, longitude, address)
            return address
            
    except httpx.TimeoutException:
        # API请求超时，返回坐标作为备选
        address = f"{latitude:.6f}, {longitude:.6f}"
        return address
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        # 如果出错，返回坐标作为备选
        import logging
        logging.error(f"高德地图API调用失败: {str(e)}")
        address = f"{latitude:.6f}, {longitude:.6f}"
        return address


@router.get("/geocode/reverse")
async def reverse_geocode(
    latitude: float,
    longitude: float,
    current_user: User = Depends(get_current_user)
):
    """
    逆地理编码：将经纬度转换为地址文本
    使用高德地图API，带缓存
    """
    address = await _reverse_geocode_internal(latitude, longitude)
    return {"address": address}


@router.post("/geocode/batch", response_model=BatchGeocodeResponse)
async def batch_reverse_geocode(
    request: BatchGeocodeRequest,
    current_user: User = Depends(get_current_user)
):
    """
    批量逆地理编码：将多个经纬度转换为地址文本
    使用高德地图API，带缓存，异步处理
    """
    import asyncio
    
    locations = request.locations
    
    async def get_address(loc: LocationPoint) -> GeocodeResult:
        """异步获取单个地址"""
        lat = loc.latitude
        lon = loc.longitude
        
        try:
            address = await _reverse_geocode_internal(lat, lon)
            return GeocodeResult(
                latitude=lat,
                longitude=lon,
                address=address
            )
        except Exception as e:
            return GeocodeResult(
                latitude=lat,
                longitude=lon,
                address=f"{lat:.6f}, {lon:.6f}",
                error=str(e)
            )
    
    # 并发处理所有地址转换（限制并发数为10，避免过多API调用）
    semaphore = asyncio.Semaphore(10)
    
    async def get_address_with_semaphore(loc: LocationPoint) -> GeocodeResult:
        async with semaphore:
            return await get_address(loc)
    
    # 并发执行所有地址转换
    results = await asyncio.gather(*[get_address_with_semaphore(loc) for loc in locations])
    
    return BatchGeocodeResponse(results=results)


