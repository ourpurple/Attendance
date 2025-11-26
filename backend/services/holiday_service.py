"""
节假日服务
封装节假日相关的业务逻辑
"""
from typing import Optional, List
from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session

from ..models import Holiday, User, UserRole
from ..repositories.base_repository import BaseRepository
from ..exceptions import NotFoundException, ValidationException, ConflictException, PermissionDeniedException
from ..utils.transaction import transaction


class HolidayRepository(BaseRepository[Holiday]):
    """节假日Repository"""
    
    def __init__(self, db: Session):
        super().__init__(Holiday, db)
    
    def get_by_date(self, date_str: str) -> Optional[Holiday]:
        """根据日期获取节假日"""
        return self.db.query(Holiday).filter(Holiday.date == date_str).first()
    
    def get_by_year(self, year: int, skip: int = 0, limit: int = 100) -> List[Holiday]:
        """根据年份获取节假日列表"""
        return (
            self.db.query(Holiday)
            .filter(Holiday.date.like(f"{year}-%"))
            .order_by(Holiday.date)
            .offset(skip)
            .limit(limit)
            .all()
        )


class HolidayService:
    """节假日服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        self.holiday_repo = HolidayRepository(db)
    
    def get_holiday(self, holiday_id: int) -> Holiday:
        """获取节假日"""
        holiday = self.holiday_repo.get(holiday_id)
        if not holiday:
            raise NotFoundException("节假日配置", holiday_id)
        return holiday
    
    def get_holidays(
        self,
        year: Optional[int] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Holiday]:
        """获取节假日列表"""
        if year:
            return self.holiday_repo.get_by_year(year, skip, limit)
        return self.holiday_repo.get_all(skip, limit)
    
    def check_workday(self, check_date: str) -> dict:
        """检查指定日期是否为工作日（公开接口，无需登录）"""
        # 验证日期格式
        try:
            date_obj = datetime.strptime(check_date, "%Y-%m-%d").date()
        except ValueError:
            raise ValidationException("日期格式错误，应为 YYYY-MM-DD")
        
        # 查询节假日配置
        holiday = self.holiday_repo.get_by_date(check_date)
        
        # 如果有节假日配置，按配置判断
        if holiday:
            if holiday.type == "holiday":
                return {
                    "date": check_date,
                    "is_workday": False,
                    "reason": "法定节假日",
                    "holiday_name": holiday.name
                }
            elif holiday.type == "company_holiday":
                return {
                    "date": check_date,
                    "is_workday": False,
                    "reason": "公司节假日",
                    "holiday_name": holiday.name
                }
            elif holiday.type == "workday":
                return {
                    "date": check_date,
                    "is_workday": True,
                    "reason": "调休工作日",
                    "holiday_name": holiday.name
                }
        
        # 没有配置，按周几判断
        weekday = date_obj.weekday()  # 0=周一, 6=周日
        
        if weekday >= 5:  # 周六、周日
            return {
                "date": check_date,
                "is_workday": False,
                "reason": "周末",
                "holiday_name": None
            }
        else:  # 周一到周五
            return {
                "date": check_date,
                "is_workday": True,
                "reason": "正常工作日",
                "holiday_name": None
            }
    
    @transaction
    def create_holiday(
        self,
        date_str: str,
        name: str,
        holiday_type: str,
        description: Optional[str] = None,
        current_user: Optional[User] = None
    ) -> Holiday:
        """创建节假日配置（管理员）"""
        # 权限检查
        if current_user and current_user.role != UserRole.ADMIN:
            raise PermissionDeniedException("只有管理员可以配置节假日")
        
        # 检查日期格式
        try:
            datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            raise ValidationException("日期格式错误，应为 YYYY-MM-DD")
        
        # 检查日期是否已存在
        existing = self.holiday_repo.get_by_date(date_str)
        if existing:
            raise ConflictException(f"日期 {date_str} 已存在配置")
        
        # 验证类型
        if holiday_type not in ["holiday", "workday", "company_holiday"]:
            raise ValidationException(
                "类型必须是 holiday（休息日-法定节假日）、workday（调休工作日）或 company_holiday（休息日-公司节假日）"
            )
        
        # 创建节假日
        holiday = self.holiday_repo.create(
            date=date_str,
            name=name,
            type=holiday_type,
            description=description
        )
        
        return holiday
    
    @transaction
    def create_holidays_batch(
        self,
        start_date: str,
        end_date: str,
        name: str,
        holiday_type: str,
        description: Optional[str] = None,
        current_user: Optional[User] = None
    ) -> List[Holiday]:
        """批量创建节假日配置（日期范围）（管理员）"""
        # 权限检查
        if current_user and current_user.role != UserRole.ADMIN:
            raise PermissionDeniedException("只有管理员可以配置节假日")
        
        # 检查日期格式
        try:
            start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise ValidationException("日期格式错误，应为 YYYY-MM-DD")
        
        # 检查日期范围
        if start_date_obj > end_date_obj:
            raise ValidationException("开始日期不能晚于结束日期")
        
        # 验证类型
        if holiday_type not in ["holiday", "workday", "company_holiday"]:
            raise ValidationException(
                "类型必须是 holiday（休息日-法定节假日）、workday（调休工作日）或 company_holiday（休息日-公司节假日）"
            )
        
        # 生成日期范围内的所有日期
        current_date = start_date_obj
        holidays_to_create = []
        existing_dates = []
        
        while current_date <= end_date_obj:
            date_str = current_date.isoformat()
            
            # 检查日期是否已存在
            existing = self.holiday_repo.get_by_date(date_str)
            
            if existing:
                existing_dates.append(date_str)
            else:
                holidays_to_create.append({
                    "date": date_str,
                    "name": name,
                    "type": holiday_type,
                    "description": description
                })
            
            current_date += timedelta(days=1)
        
        # 如果有已存在的日期，返回错误
        if existing_dates:
            raise ConflictException(
                f"以下日期已存在配置: {', '.join(existing_dates[:5])}{'...' if len(existing_dates) > 5 else ''}"
            )
        
        # 批量创建节假日
        created_holidays = []
        for holiday_data in holidays_to_create:
            holiday = self.holiday_repo.create(**holiday_data)
            created_holidays.append(holiday)
        
        return created_holidays
    
    @transaction
    def update_holiday(
        self,
        holiday_id: int,
        name: Optional[str] = None,
        holiday_type: Optional[str] = None,
        description: Optional[str] = None,
        current_user: Optional[User] = None
    ) -> Holiday:
        """更新节假日配置（管理员）"""
        # 权限检查
        if current_user and current_user.role != UserRole.ADMIN:
            raise PermissionDeniedException("只有管理员可以配置节假日")
        
        holiday = self.get_holiday(holiday_id)
        
        update_data = {}
        if name is not None:
            update_data['name'] = name
        if holiday_type is not None:
            # 验证类型
            if holiday_type not in ["holiday", "workday", "company_holiday"]:
                raise ValidationException(
                    "类型必须是 holiday（休息日-法定节假日）、workday（调休工作日）或 company_holiday（休息日-公司节假日）"
                )
            update_data['type'] = holiday_type
        if description is not None:
            update_data['description'] = description
        
        return self.holiday_repo.update(holiday_id, **update_data)
    
    @transaction
    def delete_holiday(
        self,
        holiday_id: int,
        current_user: Optional[User] = None
    ) -> None:
        """删除节假日配置（管理员）"""
        # 权限检查
        if current_user and current_user.role != UserRole.ADMIN:
            raise PermissionDeniedException("只有管理员可以配置节假日")
        
        self.get_holiday(holiday_id)  # 验证存在
        self.holiday_repo.delete(holiday_id)

