from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SystemSetting, User
from ..schemas import SystemSettingUpdate
from ..security import get_current_active_admin

router = APIRouter(prefix="/system-settings", tags=["系统设置"])

GM_AUTO_APPROVE_KEY = "auto_approve_gm_level"
COMP_LEAVE_YEARLY_RESET_KEY = "comp_leave_yearly_reset"
ANNUAL_LEAVE_YEARLY_RESET_KEY = "annual_leave_yearly_reset"
ANNUAL_LEAVE_START_YEAR_KEY = "annual_leave_start_year"
ANNUAL_LEAVE_DEFAULT_START_YEAR = 2025


def _get_bool_setting(db: Session, key: str, default: bool = False) -> bool:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not row:
        return default
    return str(row.value).strip().lower() in ["1", "true", "yes", "on"]


def _get_int_setting(db: Session, key: str, default: int) -> int:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not row:
        return default
    try:
        return int(str(row.value).strip())
    except (TypeError, ValueError):
        return default


def _set_int_setting(db: Session, key: str, value: int, description: str) -> None:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row:
        row.value = str(value)
        if description:
            row.description = description
    else:
        row = SystemSetting(key=key, value=str(value), description=description)
        db.add(row)


def _set_bool_setting(db: Session, key: str, value: bool, description: str) -> None:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row:
        row.value = "true" if value else "false"
        if description:
            row.description = description
    else:
        row = SystemSetting(
            key=key,
            value="true" if value else "false",
            description=description
        )
        db.add(row)


@router.get("/")
def get_system_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    return {
        "auto_approve_gm_level": _get_bool_setting(db, GM_AUTO_APPROVE_KEY, False),
        "comp_leave_yearly_reset": _get_bool_setting(db, COMP_LEAVE_YEARLY_RESET_KEY, False),
        "annual_leave_yearly_reset": _get_bool_setting(db, ANNUAL_LEAVE_YEARLY_RESET_KEY, False),
        "annual_leave_start_year": _get_int_setting(db, ANNUAL_LEAVE_START_YEAR_KEY, ANNUAL_LEAVE_DEFAULT_START_YEAR),
    }


@router.put("/")
def update_system_settings(
    payload: SystemSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    if payload.auto_approve_gm_level is not None:
        _set_bool_setting(
            db,
            GM_AUTO_APPROVE_KEY,
            payload.auto_approve_gm_level,
            "开启后，任何流转到总经理审批节点的申请将自动批准"
        )
    if payload.comp_leave_yearly_reset is not None:
        _set_bool_setting(
            db,
            COMP_LEAVE_YEARLY_RESET_KEY,
            payload.comp_leave_yearly_reset,
            "开启后加班调休余额按自然年跨年清零"
        )
    if payload.annual_leave_yearly_reset is not None:
        _set_bool_setting(
            db,
            ANNUAL_LEAVE_YEARLY_RESET_KEY,
            payload.annual_leave_yearly_reset,
            "开启后年假余额按自然年跨年清零；关闭则逐年发放基础年假并将未休结转累计"
        )
    if payload.annual_leave_start_year is not None:
        _set_int_setting(
            db,
            ANNUAL_LEAVE_START_YEAR_KEY,
            payload.annual_leave_start_year,
            "年假逐年结转的起算年份（每年自该年起发放一份基础年假）"
        )
    db.commit()
    return {
        "auto_approve_gm_level": _get_bool_setting(db, GM_AUTO_APPROVE_KEY, False),
        "comp_leave_yearly_reset": _get_bool_setting(db, COMP_LEAVE_YEARLY_RESET_KEY, False),
        "annual_leave_yearly_reset": _get_bool_setting(db, ANNUAL_LEAVE_YEARLY_RESET_KEY, False),
        "annual_leave_start_year": _get_int_setting(db, ANNUAL_LEAVE_START_YEAR_KEY, ANNUAL_LEAVE_DEFAULT_START_YEAR),
    }


def is_gm_auto_approve_enabled(db: Session) -> bool:
    return _get_bool_setting(db, GM_AUTO_APPROVE_KEY, False)


def is_comp_leave_yearly_reset_enabled(db: Session) -> bool:
    return _get_bool_setting(db, COMP_LEAVE_YEARLY_RESET_KEY, False)


def is_annual_leave_yearly_reset_enabled(db: Session) -> bool:
    return _get_bool_setting(db, ANNUAL_LEAVE_YEARLY_RESET_KEY, False)


def get_annual_leave_start_year(db: Session) -> int:
    return _get_int_setting(db, ANNUAL_LEAVE_START_YEAR_KEY, ANNUAL_LEAVE_DEFAULT_START_YEAR)
