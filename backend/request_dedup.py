"""Helpers for database-backed duplicate request protection."""

from __future__ import annotations

import enum
import hashlib
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Optional


ACTIVE_LEAVE_STATUS_VALUES = {
    "pending",
    "dept_approved",
    "vp_approved",
    "approved",
}

ACTIVE_OVERTIME_STATUS_VALUES = {
    "pending",
    "approved",
}


def normalize_status_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, enum.Enum):
        return str(value.value).strip().lower()
    return str(value).strip().lower()


def normalize_reason_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def is_active_leave_status(value: Any) -> bool:
    return normalize_status_value(value) in ACTIVE_LEAVE_STATUS_VALUES


def is_active_overtime_status(value: Any) -> bool:
    return normalize_status_value(value) in ACTIVE_OVERTIME_STATUS_VALUES


def _normalize_datetime_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        normalized = value
        if normalized.tzinfo is not None:
            normalized = normalized.astimezone(timezone.utc).replace(tzinfo=None)
        return normalized.replace(microsecond=0).isoformat(timespec="seconds")
    return str(value)


def _normalize_decimal_value(value: Any, scale: str = "0.0001") -> str:
    if value is None:
        return ""
    try:
        decimal_value = Decimal(str(value)).quantize(Decimal(scale), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return str(value)

    text = format(decimal_value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _hash_payload(*parts: Any) -> str:
    payload = "|".join(str(part) for part in parts)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_leave_active_request_key(
    *,
    user_id: Optional[int],
    start_date: Any,
    end_date: Any,
    days: Any,
    reason: Any,
    leave_type_id: Optional[int],
    status: Any,
) -> Optional[str]:
    if not user_id or not leave_type_id or not is_active_leave_status(status):
        return None

    return _hash_payload(
        "leave-v1",
        user_id,
        _normalize_datetime_value(start_date),
        _normalize_datetime_value(end_date),
        _normalize_decimal_value(days),
        normalize_reason_text(reason),
        leave_type_id,
    )


def build_overtime_active_request_key(
    *,
    user_id: Optional[int],
    start_time: Any,
    end_time: Any,
    hours: Any,
    days: Any,
    reason: Any,
    overtime_type: Any,
    status: Any,
) -> Optional[str]:
    if not user_id or not is_active_overtime_status(status):
        return None

    return _hash_payload(
        "overtime-v1",
        user_id,
        _normalize_datetime_value(start_time),
        _normalize_datetime_value(end_time),
        _normalize_decimal_value(hours),
        _normalize_decimal_value(days),
        normalize_reason_text(reason),
        normalize_status_value(overtime_type),
    )


def is_active_request_key_conflict(exc: Exception, table_name: str) -> bool:
    message = str(getattr(exc, "orig", exc)).lower()
    if "unique" not in message:
        return False

    expected_tokens = {
        f"{table_name}.active_request_key".lower(),
        f"idx_{table_name}_active_request_key".lower(),
        f"{table_name}_active_request_key_key".lower(),
    }
    return any(token in message for token in expected_tokens) or "active_request_key" in message
