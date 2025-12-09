/**
 * 请假模块
 * 处理请假申请、请假类型、请假列表等功能
 */

import api from './api.js';
import store from './store.js';
import { showToast, showLoading, hideLoading } from './ui.js';

// 请假类型缓存
let leaveTypesCache = [];

/**
 * 获取请假类型列表
 * @param {boolean} force - 是否强制刷新缓存
 * @returns {Promise<array>} - 请假类型列表
 */
export async function getLeaveTypes(force = false) {
    if (leaveTypesCache.length && !force) {
        return leaveTypesCache;
    }

    try {
        leaveTypesCache = await api.get('/leave-types/');
        return leaveTypesCache;
    } catch (error) {
        console.error('加载请假类型失败:', error);
        leaveTypesCache = [];
        return [];
    }
}

/**
 * 获取年假信息
 * @returns {Promise<object>} - 年假信息
 */
export async function getAnnualLeaveInfo() {
    try {
        return await api.get('/users/me/annual-leave');
    } catch (error) {
        console.error('获取年假信息失败:', error);
        return null;
    }
}

/**
 * 获取审批人列表
 * @returns {Promise<array>} - 审批人列表
 */
export async function getApprovers() {
    try {
        return await api.get('/users/approvers');
    } catch (error) {
        console.error('获取审批人列表失败:', error);
        return [];
    }
}

/**
 * 加载我的请假申请列表
 * @returns {Promise<array>} - 请假申请列表
 */
export async function loadMyLeaveApplications() {
    try {
        const leaves = await api.get('/leave/my');
        store.setState('myLeaves', leaves || []);
        return leaves || [];
    } catch (error) {
        console.error('加载请假申请失败:', error);
        return [];
    }
}

/**
 * 加载待审批请假列表
 * @returns {Promise<array>} - 待审批列表
 */
export async function loadPendingLeaves() {
    try {
        const leaves = await api.get('/leave/pending');
        store.setState('pendingLeaves', leaves || []);
        return leaves || [];
    } catch (error) {
        console.error('加载待审批请假失败:', error);
        return [];
    }
}

/**
 * 获取请假详情
 * @param {number} leaveId - 请假ID
 * @returns {Promise<object>} - 请假详情
 */
export async function getLeaveDetail(leaveId) {
    try {
        return await api.get(`/leave/${leaveId}`);
    } catch (error) {
        console.error('获取请假详情失败:', error);
        throw error;
    }
}

/**
 * 提交请假申请
 * @param {object} data - 请假数据
 * @returns {Promise<object>} - 提交结果
 */
export async function submitLeaveApplication(data) {
    try {
        showLoading('提交中...');
        const result = await api.post('/leave/', data);
        hideLoading();
        showToast('请假申请提交成功！', 'success');

        // 刷新我的请假列表
        await loadMyLeaveApplications();

        return result;
    } catch (error) {
        hideLoading();
        showToast('提交失败: ' + error.message, 'error');
        throw error;
    }
}

/**
 * 撤回请假申请
 * @param {number} leaveId - 请假ID
 * @returns {Promise<void>}
 */
export async function cancelLeaveApplication(leaveId) {
    try {
        await api.post(`/leave/${leaveId}/cancel`);
        showToast('请假申请已撤回！', 'success');

        // 刷新列表
        await loadMyLeaveApplications();
    } catch (error) {
        showToast('撤回失败: ' + error.message, 'error');
        throw error;
    }
}

/**
 * 删除请假申请（仅限已取消的）
 * @param {number} leaveId - 请假ID
 * @returns {Promise<void>}
 */
export async function deleteLeaveApplication(leaveId) {
    try {
        await api.delete(`/leave/${leaveId}/delete`);
        showToast('请假申请已删除！', 'success');

        // 刷新列表
        await loadMyLeaveApplications();
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
        throw error;
    }
}

/**
 * 审批请假
 * @param {number} leaveId - 请假ID
 * @param {boolean} approved - 是否批准
 * @param {string} comment - 审批意见
 * @returns {Promise<void>}
 */
export async function approveLeave(leaveId, approved, comment = '') {
    try {
        await api.post(`/leave/${leaveId}/approve`, {
            approved,
            comment
        });
        showToast(approved ? '已批准' : '已拒绝', 'success');

        // 刷新待审批列表
        await loadPendingLeaves();
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
        throw error;
    }
}

/**
 * 计算请假天数
 * @param {string} startDate - 开始日期
 * @param {string} startTime - 开始时间节点
 * @param {string} endDate - 结束日期
 * @param {string} endTime - 结束时间节点
 * @returns {number} - 请假天数
 */
export function calculateLeaveDays(startDate, startTime, endDate, endTime) {
    // 确保日期格式正确（YYYY-MM-DD）
    const normalizedStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    const normalizedEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;

    // 如果是同一天
    if (normalizedStartDate === normalizedEndDate) {
        return calculateSingleDayLeave(startTime, endTime);
    }

    // 跨天情况
    let totalDays = 0;

    const startDateObj = new Date(normalizedStartDate + 'T00:00:00');
    const endDateObj = new Date(normalizedEndDate + 'T00:00:00');
    const currentDate = new Date(startDateObj);

    const formatDateStr = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const startDateStr = formatDateStr(startDateObj);
    const endDateStr = formatDateStr(endDateObj);

    let loopCount = 0;
    const maxLoops = 100;

    while (currentDate <= endDateObj && loopCount < maxLoops) {
        const currentDateStr = formatDateStr(currentDate);

        if (currentDateStr === startDateStr) {
            // 起始日
            if (startTime === '09:00') {
                totalDays += 1.0;
            } else if (startTime === '14:00') {
                totalDays += 0.5;
            }
        } else if (currentDateStr === endDateStr) {
            // 结尾日
            if (endTime === '12:00') {
                totalDays += 0.5;
            } else if (endTime === '17:30') {
                totalDays += 1.0;
            }
        } else {
            // 中间天数
            totalDays += 1.0;
        }

        currentDate.setDate(currentDate.getDate() + 1);
        loopCount++;
    }

    return Math.round(totalDays * 10) / 10;
}

/**
 * 计算单日请假天数
 * @param {string} startTime - 开始时间
 * @param {string} endTime - 结束时间
 * @returns {number} - 请假天数
 */
function calculateSingleDayLeave(startTime, endTime) {
    // 9:00-12:00 = 0.5天
    // 14:00-17:30 = 0.5天
    // 9:00-17:30 = 1天

    if (startTime === '09:00' && endTime === '12:00') {
        return 0.5;
    } else if (startTime === '14:00' && endTime === '17:30') {
        return 0.5;
    } else if (startTime === '09:00' && endTime === '17:30') {
        return 1.0;
    }

    return 0;
}

/**
 * 获取请假状态名称
 * @param {string} status - 状态码
 * @returns {string} - 状态名称
 */
export function getLeaveStatusName(status) {
    const names = {
        'pending': '待审批',
        'dept_approved': '部门已批',
        'vp_approved': '副总已批',
        'approved': '已批准',
        'rejected': '已拒绝',
        'cancelled': '已取消'
    };
    return names[status] || status;
}

/**
 * 获取状态样式类
 * @param {string} status - 状态码
 * @returns {string} - 样式类名
 */
export function getStatusClass(status) {
    if (status === 'approved') return 'success';
    if (status === 'rejected' || status === 'cancelled') return 'danger';
    if (status.includes('approved')) return 'warning';
    return 'pending';
}

/**
 * 判断申请是否可以撤回
 * @param {string} status - 状态码
 * @returns {boolean} - 是否可撤回
 */
export function canCancelLeave(status) {
    return ['pending', 'dept_approved', 'vp_approved'].includes(status);
}

/**
 * 统计未完成的请假申请数量
 * @param {array} leaves - 请假列表
 * @returns {number} - 未完成数量
 */
export function countPendingLeaves(leaves) {
    if (!Array.isArray(leaves)) return 0;
    return leaves.filter(leave =>
        ['pending', 'dept_approved', 'vp_approved'].includes(leave.status)
    ).length;
}

export default {
    getLeaveTypes,
    getAnnualLeaveInfo,
    getApprovers,
    loadMyLeaveApplications,
    loadPendingLeaves,
    getLeaveDetail,
    submitLeaveApplication,
    cancelLeaveApplication,
    deleteLeaveApplication,
    approveLeave,
    calculateLeaveDays,
    getLeaveStatusName,
    getStatusClass,
    canCancelLeave,
    countPendingLeaves
};
