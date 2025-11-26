/**
 * 请假相关API
 */
import { apiRequest } from './client.js';

/**
 * 获取我的请假申请列表
 */
export async function getMyLeaveApplications(status = null) {
    const params = status ? `?status=${status}` : '';
    return await apiRequest(`/leave/my${params}`);
}

/**
 * 创建请假申请
 */
export async function createLeaveApplication(data) {
    return await apiRequest('/leave/', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

/**
 * 取消请假申请
 */
export async function cancelLeaveApplication(leaveId) {
    return await apiRequest(`/leave/${leaveId}/cancel`, {
        method: 'POST'
    });
}

/**
 * 删除请假申请
 */
export async function deleteLeaveApplication(leaveId) {
    return await apiRequest(`/leave/${leaveId}`, {
        method: 'DELETE'
    });
}

/**
 * 获取请假详情
 */
export async function getLeaveDetail(leaveId) {
    return await apiRequest(`/leave/${leaveId}`);
}

/**
 * 获取待审批的请假列表
 */
export async function getPendingLeaves() {
    return await apiRequest('/leave/pending');
}

/**
 * 审批请假
 */
export async function approveLeave(leaveId, approved, comment = null) {
    return await apiRequest(`/leave/${leaveId}/approve`, {
        method: 'POST',
        body: JSON.stringify({
            approved,
            comment
        })
    });
}

/**
 * 获取请假类型列表
 */
export async function getLeaveTypes(force = false) {
    return await apiRequest('/leave-types/');
}

/**
 * 获取年假信息
 */
export async function getAnnualLeaveInfo() {
    return await apiRequest('/users/me/annual-leave');
}

