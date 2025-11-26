/**
 * 加班相关API
 */
import { apiRequest } from './client.js';

/**
 * 获取我的加班申请列表
 */
export async function getMyOvertimeApplications(status = null) {
    const params = status ? `?status=${status}` : '';
    return await apiRequest(`/overtime/my${params}`);
}

/**
 * 创建加班申请
 */
export async function createOvertimeApplication(data) {
    return await apiRequest('/overtime/', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

/**
 * 取消加班申请
 */
export async function cancelOvertimeApplication(overtimeId) {
    return await apiRequest(`/overtime/${overtimeId}/cancel`, {
        method: 'POST'
    });
}

/**
 * 删除加班申请
 */
export async function deleteOvertimeApplication(overtimeId) {
    return await apiRequest(`/overtime/${overtimeId}`, {
        method: 'DELETE'
    });
}

/**
 * 获取加班详情
 */
export async function getOvertimeDetail(overtimeId) {
    return await apiRequest(`/overtime/${overtimeId}`);
}

/**
 * 获取待审批的加班列表
 */
export async function getPendingOvertimes() {
    return await apiRequest('/overtime/pending');
}

/**
 * 审批加班
 */
export async function approveOvertime(overtimeId, approved, comment = null) {
    return await apiRequest(`/overtime/${overtimeId}/approve`, {
        method: 'POST',
        body: JSON.stringify({
            approved,
            comment
        })
    });
}

/**
 * 获取加班审批人列表
 */
export async function getOvertimeApprovers() {
    return await apiRequest('/overtime/approvers');
}

