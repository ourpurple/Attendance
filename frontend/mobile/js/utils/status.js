/**
 * 状态工具模块
 * 提供角色名、状态名等转换函数
 */

/**
 * 获取角色名称
 */
export function getRoleName(role) {
    const roleMap = {
        'admin': '系统管理员',
        'general_manager': '总经理',
        'vice_president': '副总',
        'department_head': '部门主任',
        'employee': '员工'
    };
    return roleMap[role] || role;
}

/**
 * 获取请假状态名称
 */
export function getLeaveStatusName(status) {
    const statusMap = {
        'pending': '待审批',
        'dept_approved': '部门已批准',
        'vp_approved': '副总已批准',
        'approved': '已批准',
        'rejected': '已拒绝',
        'cancelled': '已取消'
    };
    return statusMap[status] || status;
}

/**
 * 获取加班状态名称
 */
export function getOvertimeStatusName(status) {
    const statusMap = {
        'pending': '待审批',
        'approved': '已批准',
        'rejected': '已拒绝',
        'cancelled': '已取消'
    };
    return statusMap[status] || status;
}

/**
 * 获取状态样式类
 */
export function getStatusClass(status) {
    const classMap = {
        'pending': 'status-pending',
        'approved': 'status-approved',
        'rejected': 'status-rejected',
        'cancelled': 'status-cancelled',
        'dept_approved': 'status-pending',
        'vp_approved': 'status-pending'
    };
    return classMap[status] || 'status-default';
}

/**
 * 格式化打卡状态
 */
export function formatCheckinStatus(status) {
    if (!status || status === 'normal') {
        return { text: '正常打卡', class: 'checkin-status-normal' };
    } else if (status === 'city_business') {
        return { text: '市区办事', class: 'checkin-status-business' };
    } else if (status === 'business_trip') {
        return { text: '出差', class: 'checkin-status-business' };
    }
    return { text: '', class: '' };
}

