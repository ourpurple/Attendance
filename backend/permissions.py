from sqlalchemy.orm import Session

from .models import (
    Department,
    LeaveApplication,
    OvertimeApplication,
    User,
    UserRole,
    VicePresidentDepartment,
)


def is_department_head_for_user(db: Session, viewer: User, target: User) -> bool:
    if not target.department_id:
        return False
    if viewer.role == UserRole.DEPARTMENT_HEAD and viewer.department_id == target.department_id:
        return True
    department = db.query(Department).filter(Department.id == target.department_id).first()
    return bool(department and department.head_id == viewer.id)


def is_vp_for_user_department(db: Session, viewer: User, target: User) -> bool:
    if viewer.role != UserRole.VICE_PRESIDENT or not target.department_id:
        return False
    return db.query(VicePresidentDepartment.id).filter(
        VicePresidentDepartment.vice_president_id == viewer.id,
        VicePresidentDepartment.department_id == target.department_id,
    ).first() is not None


def can_view_user_records(db: Session, viewer: User, target: User) -> bool:
    if viewer.id == target.id:
        return True
    if viewer.role in [UserRole.ADMIN, UserRole.GENERAL_MANAGER]:
        return True
    if is_department_head_for_user(db, viewer, target):
        return True
    if is_vp_for_user_department(db, viewer, target):
        return True
    return False


def can_view_leave_application(db: Session, viewer: User, leave: LeaveApplication) -> bool:
    applicant = db.query(User).filter(User.id == leave.user_id).first()
    if not applicant:
        return False
    if can_view_user_records(db, viewer, applicant):
        return True
    return viewer.id in {
        leave.assigned_vp_id,
        leave.assigned_gm_id,
        leave.dept_approver_id,
        leave.vp_approver_id,
        leave.gm_approver_id,
    }


def can_view_overtime_application(db: Session, viewer: User, overtime: OvertimeApplication) -> bool:
    applicant = db.query(User).filter(User.id == overtime.user_id).first()
    if not applicant:
        return False
    if can_view_user_records(db, viewer, applicant):
        return True
    return viewer.id in {
        overtime.assigned_approver_id,
        overtime.approver_id,
    }
