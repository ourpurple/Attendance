from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, date, timedelta
from .. import models, schemas
from ..database import get_db
from ..security import get_current_user

router = APIRouter(
    prefix="/holidays",
    tags=["holidays"],
    responses={404: {"description": "Not found"}},
)


@router.post("/", response_model=schemas.Holiday)
def create_holiday(
    holiday: schemas.HolidayCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """创建节假日配置（管理员）"""
    # 只有管理员可以配置节假日
    if current_user.role != models.UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有管理员可以配置节假日"
        )
    
    # 检查日期格式
    try:
        datetime.strptime(holiday.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="日期格式错误，应为 YYYY-MM-DD"
        )
    
    # 检查日期是否已存在
    existing = db.query(models.Holiday).filter(
        models.Holiday.date == holiday.date
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"日期 {holiday.date} 已存在配置"
        )
    
    # 验证类型
    if holiday.type not in ["holiday", "workday", "company_holiday"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="类型必须是 holiday（休息日-法定节假日）、workday（调休工作日）或 company_holiday（休息日-公司节假日）"
        )
    
    # 创建节假日
    db_holiday = models.Holiday(**holiday.dict())
    db.add(db_holiday)
    db.commit()
    db.refresh(db_holiday)
    
    return db_holiday


@router.post("/batch", response_model=List[schemas.Holiday])
def create_holidays_batch(
    batch: schemas.HolidayBatchCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """批量创建节假日配置（日期范围）（管理员）"""
    # 只有管理员可以配置节假日
    if current_user.role != models.UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有管理员可以配置节假日"
        )
    
    # 检查日期格式
    try:
        start_date = datetime.strptime(batch.start_date, "%Y-%m-%d").date()
        end_date = datetime.strptime(batch.end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="日期格式错误，应为 YYYY-MM-DD"
        )
    
    # 检查日期范围
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="开始日期不能晚于结束日期"
        )
    
    # 验证类型
    if batch.type not in ["holiday", "workday", "company_holiday"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="类型必须是 holiday（休息日-法定节假日）、workday（调休工作日）或 company_holiday（休息日-公司节假日）"
        )
    
    # 生成日期范围内的所有日期
    current_date = start_date
    holidays_to_create = []
    existing_dates = []
    
    while current_date <= end_date:
        date_str = current_date.isoformat()
        
        # 检查日期是否已存在
        existing = db.query(models.Holiday).filter(
            models.Holiday.date == date_str
        ).first()
        
        if existing:
            existing_dates.append(date_str)
        else:
            holidays_to_create.append({
                "date": date_str,
                "name": batch.name,
                "type": batch.type,
                "description": batch.description
            })
        
        current_date += timedelta(days=1)
    
    # 如果有已存在的日期，返回警告信息
    if existing_dates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"以下日期已存在配置: {', '.join(existing_dates[:5])}{'...' if len(existing_dates) > 5 else ''}"
        )
    
    # 批量创建节假日
    created_holidays = []
    for holiday_data in holidays_to_create:
        db_holiday = models.Holiday(**holiday_data)
        db.add(db_holiday)
        created_holidays.append(db_holiday)
    
    db.commit()
    
    # 刷新所有创建的节假日
    for holiday in created_holidays:
        db.refresh(holiday)
    
    return created_holidays


@router.get("/", response_model=List[schemas.Holiday])
def get_holidays(
    year: int = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """获取节假日列表"""
    query = db.query(models.Holiday)
    
    # 按年份筛选
    if year:
        query = query.filter(models.Holiday.date.like(f"{year}-%"))
    
    # 按日期排序
    query = query.order_by(models.Holiday.date)
    
    holidays = query.offset(skip).limit(limit).all()
    return holidays


@router.get("/check/{check_date}", response_model=schemas.WorkdayCheck)
def check_workday(
    check_date: str,
    db: Session = Depends(get_db)
):
    """检查指定日期是否为工作日（公开接口，无需登录）"""
    # 验证日期格式
    try:
        date_obj = datetime.strptime(check_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="日期格式错误，应为 YYYY-MM-DD"
        )
    
    # 查询节假日配置
    holiday = db.query(models.Holiday).filter(
        models.Holiday.date == check_date
    ).first()
    
    # 如果有节假日配置，按配置判断
    if holiday:
        if holiday.type == "holiday":
            # 法定节假日，休息
            return schemas.WorkdayCheck(
                date=check_date,
                is_workday=False,
                reason="法定节假日",
                holiday_name=holiday.name
            )
        elif holiday.type == "company_holiday":
            # 公司节假日，休息
            return schemas.WorkdayCheck(
                date=check_date,
                is_workday=False,
                reason="公司节假日",
                holiday_name=holiday.name
            )
        elif holiday.type == "workday":
            # 调休工作日，上班
            return schemas.WorkdayCheck(
                date=check_date,
                is_workday=True,
                reason="调休工作日",
                holiday_name=holiday.name
            )
    
    # 没有配置，按周几判断
    weekday = date_obj.weekday()  # 0=周一, 6=周日
    
    if weekday >= 5:  # 周六、周日
        return schemas.WorkdayCheck(
            date=check_date,
            is_workday=False,
            reason="周末",
            holiday_name=None
        )
    else:  # 周一到周五
        return schemas.WorkdayCheck(
            date=check_date,
            is_workday=True,
            reason="正常工作日",
            holiday_name=None
        )


@router.get("/{holiday_id}", response_model=schemas.Holiday)
def get_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """获取节假日详情"""
    holiday = db.query(models.Holiday).filter(models.Holiday.id == holiday_id).first()
    if not holiday:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="节假日配置不存在"
        )
    return holiday


@router.put("/{holiday_id}", response_model=schemas.Holiday)
def update_holiday(
    holiday_id: int,
    holiday_update: schemas.HolidayUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """更新节假日配置（管理员）"""
    # 只有管理员可以配置节假日
    if current_user.role != models.UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有管理员可以配置节假日"
        )
    
    # 查询节假日
    db_holiday = db.query(models.Holiday).filter(models.Holiday.id == holiday_id).first()
    if not db_holiday:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="节假日配置不存在"
        )
    
    # 更新字段
    update_data = holiday_update.dict(exclude_unset=True)
    
    # 验证类型
    if "type" in update_data and update_data["type"] not in ["holiday", "workday", "company_holiday"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="类型必须是 holiday（休息日-法定节假日）、workday（调休工作日）或 company_holiday（休息日-公司节假日）"
        )
    
    for field, value in update_data.items():
        setattr(db_holiday, field, value)
    
    db_holiday.updated_at = datetime.now()
    db.commit()
    db.refresh(db_holiday)
    
    return db_holiday


@router.delete("/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """删除节假日配置（管理员）"""
    # 只有管理员可以配置节假日
    if current_user.role != models.UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有管理员可以配置节假日"
        )
    
    # 查询节假日
    db_holiday = db.query(models.Holiday).filter(models.Holiday.id == holiday_id).first()
    if not db_holiday:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="节假日配置不存在"
        )
    
    db.delete(db_holiday)
    db.commit()
    
    return None


