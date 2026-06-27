from datetime import datetime

from backend.schemas import UserCreate, UserUpdate


def test_user_create_accepts_html_date_hire_date():
    user = UserCreate.model_validate(
        {
            "username": "new_employee",
            "real_name": "New Employee",
            "password": "password123",
            "role": "employee",
            "hire_date": "2026-06-26",
        }
    )

    assert user.hire_date == datetime(2026, 6, 26)


def test_user_update_accepts_empty_hire_date():
    user_update = UserUpdate.model_validate({"hire_date": ""})

    assert user_update.hire_date is None
