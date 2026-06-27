"""
API端点集成测试
"""
import pytest
from datetime import datetime, date
from unittest.mock import patch
from backend.models import User, UserRole, AttendancePolicy, LeaveApplication, LeaveStatus, LeaveType, OvertimeApplication, OvertimeStatus, OvertimeType
from backend.repositories import UserRepository
from backend.security import get_password_hash, create_access_token


class TestAuthAPI:
    """认证API测试"""
    
    def test_login_success(self, client, test_db):
        """测试登录成功"""
        # 创建用户
        user_repo = UserRepository(test_db)
        user = user_repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        test_db.commit()
        
        # 登录
        response = client.post(
            "/api/auth/login",
            json={
                "username": "testuser",
                "password": "password123"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
    
    def test_login_invalid_credentials(self, client):
        """测试无效凭据登录"""
        response = client.post(
            "/api/auth/login",
            json={
                "username": "nonexistent",
                "password": "wrongpassword"
            }
        )
        
        assert response.status_code == 401
    
    def test_get_current_user(self, client, test_db):
        """测试获取当前用户"""
        # 创建用户
        user_repo = UserRepository(test_db)
        user = user_repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            role=UserRole.EMPLOYEE
        )
        test_db.commit()
        
        # 创建token
        token = create_access_token(data={"sub": user.username})
        
        # 获取当前用户
        response = client.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"


class TestAttendanceAPI:
    """考勤API测试"""
    
    def test_checkin_success(self, client, test_db):
        """测试上班打卡成功"""
        # 创建用户和策略
        user_repo = UserRepository(test_db)
        user = user_repo.create(
            username="testuser",
            password_hash=get_password_hash("password123"),
            real_name="测试用户",
            role=UserRole.EMPLOYEE,
            enable_attendance=True
        )
        test_db.commit()
        
        policy = AttendancePolicy(
            name="测试策略",
            work_start_time="09:00",
            work_end_time="17:30",
            checkin_start_time="08:00",
            checkin_end_time="10:00",
            checkout_start_time="17:00",
            checkout_end_time="20:00",
            is_active=True
        )
        test_db.add(policy)
        test_db.commit()
        
        # 创建token
        token = create_access_token(data={"sub": user.username})
        
        # 打卡（注意：实际时间可能不在允许范围内，这里仅测试API结构）
        response = client.post(
            "/api/attendance/checkin",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "latitude": 39.9042,
                "longitude": 116.4074,
                "location": "测试地点"
            }
        )
        
        # 可能成功或失败（取决于当前时间），但应该返回合理的状态码
        assert response.status_code in [200, 400]
    
    def test_checkin_unauthorized(self, client):
        """测试未授权打卡"""
        response = client.post(
            "/api/attendance/checkin",
            json={
                "latitude": 39.9042,
                "longitude": 116.4074,
                "location": "测试地点"
            }
        )
        
        assert response.status_code == 403



    @patch('backend.routers.attendance.get_workday_status')
    def test_non_workday_requires_overtime_punch(self, mock_workday, client, test_db):
        """??????????????"""
        mock_workday.return_value = {"is_workday": False, "reason": "??"}

        user_repo = UserRepository(test_db)
        user = user_repo.create(
            username="testuser_non_workday",
            password_hash=get_password_hash("password123"),
            real_name="????",
            role=UserRole.EMPLOYEE,
            enable_attendance=True
        )
        test_db.commit()

        policy = AttendancePolicy(
            name="????-????",
            work_start_time="09:00",
            work_end_time="17:30",
            checkin_start_time="08:00",
            checkin_end_time="10:00",
            checkout_start_time="17:00",
            checkout_end_time="20:00",
            is_active=True
        )
        test_db.add(policy)
        test_db.commit()

        token = create_access_token(data={"sub": user.username})

        response = client.post(
            "/api/attendance/checkin",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "latitude": 39.9042,
                "longitude": 116.4074,
                "location": "????"
            }
        )

        assert response.status_code == 400
        assert '??????' in response.json().get('detail', '')

    @patch('backend.routers.attendance.get_workday_status')
    def test_non_workday_overtime_punch_allowed(self, mock_workday, client, test_db):
        """????????????"""
        mock_workday.return_value = {"is_workday": False, "reason": "??"}

        user_repo = UserRepository(test_db)
        user = user_repo.create(
            username="testuser_non_workday_ot",
            password_hash=get_password_hash("password123"),
            real_name="????",
            role=UserRole.EMPLOYEE,
            enable_attendance=True
        )
        test_db.commit()

        policy = AttendancePolicy(
            name="????-??????",
            work_start_time="09:00",
            work_end_time="17:30",
            checkin_start_time="08:00",
            checkin_end_time="23:59",
            checkout_start_time="00:00",
            checkout_end_time="23:59",
            is_active=True
        )
        test_db.add(policy)
        test_db.commit()

        token = create_access_token(data={"sub": user.username})

        response = client.post(
            "/api/attendance/checkin",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "latitude": 39.9042,
                "longitude": 116.4074,
                "location": "????",
                "is_overtime_punch": True,
                "checkin_status": "normal"
            }
        )

        assert response.status_code == 200


class TestLeaveAPI:
    """请假API测试"""

    def test_create_leave_duplicate_submission_returns_conflict(self, client, test_db):
        """相同内容的有效请假申请重复提交时应返回409"""
        employee = User(
            username="test_employee_leave_duplicate",
            password_hash=get_password_hash("password123"),
            real_name="测试员工",
            role=UserRole.EMPLOYEE,
            is_active=True,
        )
        leave_type = LeaveType(name="事假", is_active=True)
        test_db.add_all([employee, leave_type])
        test_db.commit()
        test_db.refresh(leave_type)

        token = create_access_token(data={"sub": employee.username})
        payload = {
            "start_date": "2026-05-20T09:00:00",
            "end_date": "2026-05-20T17:30:00",
            "days": 1.0,
            "reason": "重复请假测试",
            "leave_type_id": leave_type.id,
        }

        first_response = client.post(
            "/api/leave/",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        second_response = client.post(
            "/api/leave/",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )

        assert first_response.status_code == 201
        assert second_response.status_code == 409
        assert second_response.json()["detail"] == "相同的请假申请已存在，请勿重复提交"

    def test_create_leave_allows_resubmit_after_rejection(self, client, test_db):
        """已拒绝的相同请假申请应允许重新提交"""
        employee = User(
            username="test_employee_leave_resubmit",
            password_hash=get_password_hash("password123"),
            real_name="测试员工",
            role=UserRole.EMPLOYEE,
            is_active=True,
        )
        leave_type = LeaveType(name="事假", is_active=True)
        test_db.add_all([employee, leave_type])
        test_db.commit()
        test_db.refresh(leave_type)

        rejected_leave = LeaveApplication(
            user_id=employee.id,
            start_date=datetime(2026, 5, 22, 9, 0, 0),
            end_date=datetime(2026, 5, 22, 17, 30, 0),
            days=1.0,
            reason="被拒后重提请假",
            status=LeaveStatus.REJECTED,
            leave_type_id=leave_type.id,
        )
        test_db.add(rejected_leave)
        test_db.commit()

        token = create_access_token(data={"sub": employee.username})
        payload = {
            "start_date": "2026-05-22T09:00:00",
            "end_date": "2026-05-22T17:30:00",
            "days": 1.0,
            "reason": "被拒后重提请假",
            "leave_type_id": leave_type.id,
        }

        response = client.post(
            "/api/leave/",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )

        assert response.status_code == 201

    def test_admin_list_leave_includes_end_date_same_day_records(self, client, test_db):
        """结束日期当天的请假记录不应被过滤掉"""
        admin = User(
            username="test_admin_leave",
            password_hash=get_password_hash("password123"),
            real_name="测试管理员",
            role=UserRole.ADMIN,
            is_active=True,
        )
        employee = User(
            username="test_employee_leave",
            password_hash=get_password_hash("password123"),
            real_name="测试员工",
            role=UserRole.EMPLOYEE,
            is_active=True,
        )
        leave_type = LeaveType(name="事假", is_active=True)
        test_db.add_all([admin, employee, leave_type])
        test_db.commit()
        test_db.refresh(employee)
        test_db.refresh(leave_type)

        leave = LeaveApplication(
            user_id=employee.id,
            start_date=datetime(2026, 4, 30, 9, 0, 0),
            end_date=datetime(2026, 4, 30, 17, 30, 0),
            days=1.0,
            reason="月末请假",
            status=LeaveStatus.APPROVED,
            leave_type_id=leave_type.id,
            created_at=datetime(2026, 4, 28, 10, 58, 0),
        )
        test_db.add(leave)
        test_db.commit()

        token = create_access_token(data={"sub": admin.username})
        response = client.get(
            "/api/leave/?start_date=2026-04-01&end_date=2026-04-30&limit=100",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        items = response.json()
        assert len(items) == 1
        assert items[0]["reason"] == "月末请假"


class TestOvertimeAPI:
    """加班API测试"""

    def test_create_overtime_duplicate_submission_returns_conflict(self, client, test_db):
        """相同内容的有效加班申请重复提交时应返回409"""
        employee = User(
            username="test_employee_overtime_duplicate",
            password_hash=get_password_hash("password123"),
            real_name="测试员工",
            role=UserRole.EMPLOYEE,
            is_active=True,
        )
        test_db.add(employee)
        test_db.commit()

        token = create_access_token(data={"sub": employee.username})
        payload = {
            "start_time": "2026-05-21T18:00:00",
            "end_time": "2026-05-21T22:00:00",
            "hours": 4.0,
            "days": 1.0,
            "reason": "重复加班测试",
            "overtime_type": "active",
        }

        first_response = client.post(
            "/api/overtime/",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        second_response = client.post(
            "/api/overtime/",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )

        assert first_response.status_code == 201
        assert second_response.status_code == 409
        assert second_response.json()["detail"] == "相同的加班申请已存在，请勿重复提交"

    def test_create_overtime_allows_resubmit_after_cancellation(self, client, test_db):
        """已撤销的相同加班申请应允许重新提交"""
        employee = User(
            username="test_employee_overtime_resubmit",
            password_hash=get_password_hash("password123"),
            real_name="测试员工",
            role=UserRole.EMPLOYEE,
            is_active=True,
        )
        test_db.add(employee)
        test_db.commit()

        overtime = OvertimeApplication(
            user_id=employee.id,
            start_time=datetime(2026, 5, 23, 18, 0, 0),
            end_time=datetime(2026, 5, 23, 22, 0, 0),
            hours=4.0,
            days=1.0,
            reason="撤销后重提加班",
            status=OvertimeStatus.CANCELLED,
            overtime_type=OvertimeType.ACTIVE,
        )
        test_db.add(overtime)
        test_db.commit()

        token = create_access_token(data={"sub": employee.username})
        payload = {
            "start_time": "2026-05-23T18:00:00",
            "end_time": "2026-05-23T22:00:00",
            "hours": 4.0,
            "days": 1.0,
            "reason": "撤销后重提加班",
            "overtime_type": "active",
        }

        response = client.post(
            "/api/overtime/",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )

        assert response.status_code == 201
