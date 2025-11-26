/**
 * 统计相关API
 */
import { apiRequest } from './client.js';

/**
 * 获取我的统计信息
 */
export async function getMyStatistics(startDate, endDate) {
    return await apiRequest(`/statistics/my?start_date=${startDate}&end_date=${endDate}`);
}

/**
 * 获取待审批数量
 */
export async function getPendingCount() {
    return await apiRequest('/statistics/pending-count');
}

