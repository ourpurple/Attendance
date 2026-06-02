from datetime import datetime, timedelta

from backend.models import (
    Attendance,
    Department,
    LeaveApplication,
    LeaveStatus,
    LeaveType,
    OvertimeApplication,
    OvertimeStatus,
    User,
    UserRole,
    VicePresidentDepartment,
)
from backend.security import create_access_token, get_password_hash


def auth_header(user: User) -> dict:
    token = create_access_token(data={"sub": user.username}, expires_delta=timedelta(minutes=30))
    return {"Authorization": f"Bearer {token}"}


def create_user(test_db, username: str, role: UserRole, department_id=None) -> User:
    user = User(
        username=username,
        password_hash=get_password_hash("Password123"),
        real_name=username,
        role=role,
        department_id=department_id,
        is_active=True,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


def test_anonymous_register_is_rejected(client):
    response = client.post(
        "/api/auth/register",
        json={
            "username": "evil_admin",
            "password": "Password123",
            "real_name": "Evil Admin",
            "role": "admin",
        },
    )

    assert response.status_code in (401, 403)


def test_admin_register_can_create_user(client, test_db):
    admin = create_user(test_db, "admin_creator", UserRole.ADMIN)

    response = client.post(
        "/api/auth/register",
        headers=auth_header(admin),
        json={
            "username": "created_employee",
            "password": "Password123",
            "real_name": "Created Employee",
            "role": "employee",
        },
    )

    assert response.status_code == 201
    assert response.json()["role"] == "employee"


def test_login_failures_are_rate_limited(client, test_db):
    create_user(test_db, "limited_user", UserRole.EMPLOYEE)

    for _ in range(5):
        response = client.post(
            "/api/auth/login",
            json={"username": "limited_user", "password": "wrong"},
        )
        assert response.status_code == 401

    response = client.post(
        "/api/auth/login",
        json={"username": "limited_user", "password": "wrong"},
    )

    assert response.status_code == 429


def test_department_list_requires_authentication(client, test_db):
    test_db.add(Department(name="内部部门"))
    test_db.commit()

    response = client.get("/api/departments/")

    assert response.status_code in (401, 403)


def test_department_head_cannot_read_other_department_records(client, test_db):
    dept_a = Department(name="部门A")
    dept_b = Department(name="部门B")
    test_db.add_all([dept_a, dept_b])
    test_db.commit()
    test_db.refresh(dept_a)
    test_db.refresh(dept_b)

    head_a = create_user(test_db, "head_a", UserRole.DEPARTMENT_HEAD, dept_a.id)
    employee_b = create_user(test_db, "employee_b", UserRole.EMPLOYEE, dept_b.id)
    leave_type = LeaveType(name="测试假", is_active=True)
    test_db.add(leave_type)
    test_db.commit()
    test_db.refresh(leave_type)

    attendance = Attendance(
        user_id=employee_b.id,
        date=datetime(2026, 6, 1),
        checkin_time=datetime(2026, 6, 1, 9, 0),
    )
    leave = LeaveApplication(
        user_id=employee_b.id,
        start_date=datetime(2026, 6, 2),
        end_date=datetime(2026, 6, 2),
        days=1,
        reason="测试",
        status=LeaveStatus.APPROVED.value,
        leave_type_id=leave_type.id,
    )
    overtime = OvertimeApplication(
        user_id=employee_b.id,
        start_time=datetime(2026, 6, 3, 18, 0),
        end_time=datetime(2026, 6, 3, 20, 0),
        hours=2,
        days=0.5,
        reason="测试",
        status=OvertimeStatus.APPROVED.value,
    )
    test_db.add_all([attendance, leave, overtime])
    test_db.commit()
    test_db.refresh(leave)
    test_db.refresh(overtime)

    headers = auth_header(head_a)

    assert client.get(f"/api/attendance/user/{employee_b.id}", headers=headers).status_code == 403
    assert client.get(f"/api/leave/{leave.id}", headers=headers).status_code == 403
    assert client.get(f"/api/overtime/{overtime.id}", headers=headers).status_code == 403


def test_vp_can_read_managed_department_records(client, test_db):
    dept = Department(name="分管部门")
    test_db.add(dept)
    test_db.commit()
    test_db.refresh(dept)

    vp = create_user(test_db, "vp_user", UserRole.VICE_PRESIDENT)
    employee = create_user(test_db, "managed_employee", UserRole.EMPLOYEE, dept.id)
    test_db.add(
        VicePresidentDepartment(
            vice_president_id=vp.id,
            department_id=dept.id,
            is_default=True,
        )
    )
    test_db.add(
        Attendance(
            user_id=employee.id,
            date=datetime(2026, 6, 1),
            checkin_time=datetime(2026, 6, 1, 9, 0),
        )
    )
    test_db.commit()

    response = client.get(
        f"/api/attendance/user/{employee.id}",
        headers=auth_header(vp),
    )

    assert response.status_code == 200
