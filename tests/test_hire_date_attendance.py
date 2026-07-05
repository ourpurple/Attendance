from datetime import datetime

from backend.models import Attendance, AttendanceStatus, User, UserRole
from backend.security import create_access_token, get_password_hash


def auth_header(user: User) -> dict:
    token = create_access_token(data={"sub": user.username})
    return {"Authorization": f"Bearer {token}"}


def create_user(test_db, username: str, role: UserRole, hire_date=None) -> User:
    user = User(
        username=username,
        password_hash=get_password_hash("Password123"),
        real_name=username,
        role=role,
        hire_date=hire_date,
        is_active=True,
        enable_attendance=True,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


def test_attendance_overview_excludes_users_before_hire_date(client, test_db):
    manager = create_user(test_db, "gm", UserRole.GENERAL_MANAGER)
    active_employee = create_user(
        test_db,
        "already_hired",
        UserRole.EMPLOYEE,
        hire_date=datetime(2026, 6, 1),
    )
    create_user(
        test_db,
        "future_hire",
        UserRole.EMPLOYEE,
        hire_date=datetime(2026, 7, 10),
    )

    response = client.get(
        "/api/attendance/overview?target_date=2026-07-01",
        headers=auth_header(manager),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total_users"] == 2
    assert {item["user_id"] for item in data["items"]} == {manager.id, active_employee.id}


def test_attendance_overview_shows_non_workday_overtime_punch(client, test_db):
    manager = create_user(test_db, "gm_overtime_viewer", UserRole.GENERAL_MANAGER)
    employee = create_user(test_db, "weekend_worker", UserRole.EMPLOYEE)
    punch_time = datetime(2026, 7, 5, 9, 30)

    test_db.add(
        Attendance(
            user_id=employee.id,
            date=datetime(2026, 7, 5),
            checkin_time=punch_time,
            checkin_status=AttendanceStatus.OVERTIME_PUNCH.value,
            morning_status=AttendanceStatus.OVERTIME_PUNCH.value,
        )
    )
    test_db.commit()

    response = client.get(
        "/api/attendance/overview?target_date=2026-07-05",
        headers=auth_header(manager),
    )

    assert response.status_code == 200
    data = response.json()
    employee_item = next(item for item in data["items"] if item["user_id"] == employee.id)

    assert data["is_workday"] is False
    assert data["on_overtime_count"] == 1
    assert employee_item["has_overtime"] is True
    assert employee_item["overtime_days"] == 0.0
    assert employee_item["overtime_start_time"] == "2026-07-05T09:30:00"


def test_daily_attendance_statistics_keeps_columns_blank_before_hire_date(client, test_db):
    admin = create_user(test_db, "admin_user", UserRole.ADMIN)
    employee = create_user(
        test_db,
        "new_employee",
        UserRole.EMPLOYEE,
        hire_date=datetime(2026, 7, 2),
    )

    response = client.get(
        "/api/statistics/attendance/daily?start_date=2026-07-01&end_date=2026-07-03",
        headers=auth_header(admin),
    )

    assert response.status_code == 200
    data = response.json()
    employee_stats = next(item for item in data["statistics"] if item["user_id"] == employee.id)

    assert [item["date"] for item in employee_stats["items"]] == [
        "2026-07-01",
        "2026-07-02",
        "2026-07-03",
    ]
    assert employee_stats["items"][0]["day_type"] == "not_hired"
    assert employee_stats["items"][0]["morning_status"] is None
    assert employee_stats["items"][0]["afternoon_status"] is None
    assert all(item["morning_status"] == "absent" for item in employee_stats["items"][1:])


def test_my_attendance_include_absent_skips_dates_before_hire_date(client, test_db):
    employee = create_user(
        test_db,
        "self_new_employee",
        UserRole.EMPLOYEE,
        hire_date=datetime(2025, 1, 2),
    )

    response = client.get(
        "/api/attendance/my?start_date=2025-01-01&end_date=2025-01-03&include_absent=true",
        headers=auth_header(employee),
    )

    assert response.status_code == 200
    data = response.json()

    assert [item["date"][:10] for item in data] == ["2025-01-03", "2025-01-02"]
    assert all(item["morning_status"] == "absent" for item in data)
