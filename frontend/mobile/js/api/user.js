/**
 * 用户相关API
 */
import { apiRequest } from './client.js';

/**
 * 获取用户列表
 */
export async function getUsers(skip = 0, limit = 100) {
    return await apiRequest(`/users/?skip=${skip}&limit=${limit}`);
}

/**
 * 检查出勤情况查看权限
 */
export async function checkAttendanceViewerPermission() {
    return await apiRequest('/attendance-viewers/check-permission');
}

