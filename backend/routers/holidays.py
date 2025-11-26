"""
节假日路由（重构版）
使用Service层架构
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas
from ..database import get_db
from ..security import get_current_user
from ..services.holiday_service import HolidayService
from ..exceptions import BusinessException, NotFoundException, ConflictException, ValidationException, PermissionDeniedException

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
    try:
        service = HolidayService(db)
        holiday_obj = service.create_holiday(
            date_str=holiday.date,
            name=holiday.name,
            holiday_type=holiday.type,
            description=holiday.description,
            current_user=current_user
        )
        return holiday_obj
    except (BusinessException, ConflictException, ValidationException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/batch", response_model=List[schemas.Holiday])
def create_holidays_batch(
    batch: schemas.HolidayBatchCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """批量创建节假日配置（日期范围）（管理员）"""
    try:
        service = HolidayService(db)
        holidays = service.create_holidays_batch(
            start_date=batch.start_date,
            end_date=batch.end_date,
            name=batch.name,
            holiday_type=batch.type,
            description=batch.description,
            current_user=current_user
        )
        return holidays
    except (BusinessException, ConflictException, ValidationException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/", response_model=List[schemas.Holiday])
def get_holidays(
    year: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """获取节假日列表"""
    try:
        service = HolidayService(db)
        holidays = service.get_holidays(year=year, skip=skip, limit=limit)
        return holidays
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/check/{check_date}", response_model=schemas.WorkdayCheck)
def check_workday(
    check_date: str,
    db: Session = Depends(get_db)
):
    """检查指定日期是否为工作日（公开接口，无需登录）"""
    try:
        service = HolidayService(db)
        result = service.check_workday(check_date)
        return schemas.WorkdayCheck(**result)
    except (BusinessException, ValidationException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/{holiday_id}", response_model=schemas.Holiday)
def get_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """获取节假日详情"""
    try:
        service = HolidayService(db)
        holiday = service.get_holiday(holiday_id)
        return holiday
    except NotFoundException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put("/{holiday_id}", response_model=schemas.Holiday)
def update_holiday(
    holiday_id: int,
    holiday_update: schemas.HolidayUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """更新节假日配置（管理员）"""
    try:
        service = HolidayService(db)
        
        update_data = holiday_update.dict(exclude_unset=True)
        holiday = service.update_holiday(
            holiday_id=holiday_id,
            name=update_data.get("name"),
            holiday_type=update_data.get("type"),
            description=update_data.get("description"),
            current_user=current_user
        )
        return holiday
    except (BusinessException, NotFoundException, ValidationException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """删除节假日配置（管理员）"""
    try:
        service = HolidayService(db)
        service.delete_holiday(holiday_id, current_user)
        return None
    except (BusinessException, NotFoundException, PermissionDeniedException) as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
