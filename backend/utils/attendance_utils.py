from datetime import date, datetime
from typing import Optional


def is_on_or_after_hire_date(hire_date: Optional[datetime], target_date: date) -> bool:
    """Return whether attendance should be expected on target_date."""
    if hire_date is None:
        return True

    hire_day = hire_date.date() if isinstance(hire_date, datetime) else hire_date
    return target_date >= hire_day
