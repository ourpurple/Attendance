/**
 * 审批管理页面模块
 */
import { getPendingLeaves, approveLeave as apiApproveLeave } from '../api/leave.js';
import { getPendingOvertimes, approveOvertime as apiApproveOvertime } from '../api/overtime.js';
import { getLeaveStatusName, getOvertimeStatusName } from '../utils/status.js';
import { showToast } from '../utils/toast.js';
import { showInputDialog } from '../utils/dialog.js';

const normalizeDateStr = (dateStr) => {
    if (!dateStr) return '';
    if (dateStr.includes('T')) {
        let normalized = dateStr.split('.')[0];
        if (normalized.includes('+') || normalized.includes('Z')) {
            normalized = normalized.split('+')[0].split('Z')[0];
        }
        return normalized;
    }
    return `${dateStr}T00:00:00`;
};

const formatTimeLines = (startStr, endStr) => {
    if (!startStr) return { startLine: '', endLine: '' };
    
    try {
        const startDate = new Date(normalizeDateStr(startStr));
        const endDate = endStr ? new Date(normalizeDateStr(endStr)) : null;
        
        const formatLine = (date) => {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${month}月${day}日 ${hours}:${minutes}`;
        };
        
        const startLine = formatLine(startDate);
        let endLine = '';
        
        if (endDate && !isNaN(endDate.getTime())) {
            if (
                startDate.getFullYear() === endDate.getFullYear() &&
                startDate.getMonth() === endDate.getMonth() &&
                startDate.getDate() === endDate.getDate()
            ) {
                const hours = String(endDate.getHours()).padStart(2, '0');
                const minutes = String(endDate.getMinutes()).padStart(2, '0');
                endLine = `${hours}:${minutes}`;
            } else {
                endLine = formatLine(endDate);
            }
        }
        
        return { startLine, endLine };
    } catch (error) {
        console.error('格式化时间范围失败:', error, startStr, endStr);
        return { startLine: startStr || '', endLine: endStr || '' };
    }
};

/**
 * 加载待审批列表
 */
export async function loadPendingApprovals() {
    await switchApprovalTab('leave');
}

/**
 * 切换审批标签
 */
export async function switchApprovalTab(type) {
    // 更新标签状态
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event?.target?.classList.add('active');
    
    const leaveList = document.getElementById('approval-leave-list');
    const overtimeList = document.getElementById('approval-overtime-list');
    
    if (type === 'leave') {
        if (leaveList) leaveList.style.display = '';
        if (overtimeList) overtimeList.style.display = 'none';
        await loadPendingLeaves();
    } else {
        if (leaveList) leaveList.style.display = 'none';
        if (overtimeList) overtimeList.style.display = '';
        await loadPendingOvertimes();
    }
}

/**
 * 加载待审批的请假列表
 */
export async function loadPendingLeaves() {
    try {
        const leaves = await getPendingLeaves();
        const container = document.getElementById('approval-leave-list');

        if (leaves.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>暂无待审批的请假申请</p></div>';
            return;
        }

        container.innerHTML = leaves.map(leave => {
            const timeLines = formatTimeLines(leave.start_date, leave.end_date);
            const statusName = getLeaveStatusName(leave.status);
            const applicantName = leave.user?.real_name || leave.user?.username || `用户${leave.user_id}`;
            const leaveType = leave.leave_type_name || '请假';
            
            return `
                <div class="list-item">
                    <div class="item-header">
                        <div class="item-title">申请人：${applicantName}</div>
                        <span class="status-badge status-pending">${statusName}</span>
                    </div>
                    <div class="item-content">
                        <div class="item-info item-time-lines">
                            ${timeLines.startLine ? `<div class="item-date-line">${timeLines.startLine}</div>` : ''}
                            ${timeLines.endLine ? `<div class="item-date-line">${timeLines.endLine}</div>` : ''}
                        </div>
                        <div class="item-info">
                            <span class="item-label">请假天数:</span> ${leave.days || 0}天
                        </div>
                        <div class="item-info">
                            <span class="item-label">类型:</span> ${leaveType}
                        </div>
                        <div class="item-info">
                            <span class="item-label">原因:</span> ${leave.reason || '无'}
                        </div>
                    </div>
                    <div class="item-actions">
                        <button class="btn btn-sm btn-info" onclick="viewLeaveDetail(${leave.id})">详情</button>
                        <button class="btn btn-sm btn-success" onclick="approveLeave(${leave.id}, true)">批准</button>
                        <button class="btn btn-sm btn-danger" onclick="approveLeave(${leave.id}, false)">拒绝</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载待审批请假失败:', error);
        const container = document.getElementById('approval-leave-list');
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p>加载失败，请稍后重试</p></div>';
    }
}

/**
 * 加载待审批的加班列表
 */
export async function loadPendingOvertimes() {
    try {
        const overtimes = await getPendingOvertimes();
        const container = document.getElementById('approval-overtime-list');

        if (overtimes.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>暂无待审批的加班申请</p></div>';
            return;
        }

        container.innerHTML = overtimes.map(overtime => {
            const statusName = getOvertimeStatusName(overtime.status);
            const timeLines = formatTimeLines(overtime.start_time, overtime.end_time);
            const typeText = overtime.overtime_type === 'passive' ? '被动加班' : '主动加班';
            const applicantName = overtime.user?.real_name || overtime.user?.username || `用户${overtime.user_id}`;
            
            return `
                <div class="list-item">
                    <div class="item-header">
                        <div class="item-title">申请人：${applicantName}</div>
                        <span class="status-badge status-pending">${statusName}</span>
                    </div>
                    <div class="item-content">
                        <div class="item-info item-time-lines">
                            ${timeLines.startLine ? `<div class="item-date-line">${timeLines.startLine}</div>` : ''}
                            ${timeLines.endLine ? `<div class="item-date-line">${timeLines.endLine}</div>` : ''}
                        </div>
                        <div class="item-info">
                            <span class="item-label">类型:</span> ${typeText}
                        </div>
                        <div class="item-info">
                            <span class="item-label">天数:</span> ${overtime.days || 0}天
                        </div>
                        <div class="item-info">
                            <span class="item-label">原因:</span> ${overtime.reason || '无'}
                        </div>
                    </div>
                    <div class="item-actions">
                        <button class="btn btn-sm btn-info" onclick="viewOvertimeDetail(${overtime.id})">详情</button>
                        <button class="btn btn-sm btn-success" onclick="approveOvertime(${overtime.id}, true)">批准</button>
                        <button class="btn btn-sm btn-danger" onclick="approveOvertime(${overtime.id}, false)">拒绝</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载待审批加班失败:', error);
        const container = document.getElementById('approval-overtime-list');
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p>加载失败，请稍后重试</p></div>';
    }
}

/**
 * 审批请假
 */
const approveLeaveHandler = async (leaveId, approved) => {
    const action = approved ? '通过' : '拒绝';
    const comment = await showInputDialog(
        `${action}请假申请`,
        `请输入审批意见（可选）`,
        false
    );
    
    if (comment === null) return; // 用户取消
    
    try {
        await apiApproveLeave(leaveId, approved, comment || null);
        await showToast(`审批${action}成功`, 'success');
        await loadPendingLeaves();
    } catch (error) {
        await showToast(`审批失败: ${error.message}`, 'error');
    }
};

/**
 * 审批加班
 */
const approveOvertimeHandler = async (overtimeId, approved) => {
    const action = approved ? '通过' : '拒绝';
    const comment = await showInputDialog(
        `${action}加班申请`,
        `请输入审批意见（可选）`,
        false
    );
    
    if (comment === null) return; // 用户取消
    
    try {
        await apiApproveOvertime(overtimeId, approved, comment || null);
        await showToast(`审批${action}成功`, 'success');
        await loadPendingOvertimes();
    } catch (error) {
        await showToast(`审批失败: ${error.message}`, 'error');
    }
};

// 导出到全局
window.loadPendingApprovals = loadPendingApprovals;
window.switchApprovalTab = switchApprovalTab;
window.approveLeave = approveLeaveHandler;
window.approveOvertime = approveOvertimeHandler;

export { approveLeaveHandler as approveLeave, approveOvertimeHandler as approveOvertime };

