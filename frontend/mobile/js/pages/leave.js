/**
 * 请假管理页面模块
 */
import { 
    getMyLeaveApplications, 
    createLeaveApplication, 
    cancelLeaveApplication,
    deleteLeaveApplication,
    getLeaveDetail,
    getLeaveTypes,
    getAnnualLeaveInfo
} from '../api/leave.js';
import { formatLeaveDate, formatLeaveRange } from '../utils/format.js';
import { getLeaveStatusName, getStatusClass } from '../utils/status.js';
import { showToast } from '../utils/toast.js';
import { showInputDialog } from '../utils/dialog.js';
import { calculateLeaveDaysByRules } from '../utils/calculation.js';
import { validateDateRange, validateRequired } from '../utils/validation.js';
import { getCurrentUser } from '../config.js';

/**
 * 加载我的请假申请列表
 */
export async function loadMyLeaveApplications() {
    try {
        const leaves = await getMyLeaveApplications();
        const container = document.getElementById('leave-list');

        if (leaves.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏖️</div><p>暂无请假申请</p></div>';
            return;
        }

        container.innerHTML = leaves.map(leave => {
            const statusName = getLeaveStatusName(leave.status);
            const statusClass = getStatusClass(leave.status);
            const dateRange = formatLeaveRange(leave.start_date, leave.end_date, leave.days);
            
            return `
                <div class="list-item">
                    <div class="item-header">
                        <div class="item-title">${leave.leave_type_name || '请假'}</div>
                        <span class="status-badge ${statusClass}">${statusName}</span>
                    </div>
                    <div class="item-content">
                        <div class="item-info">${dateRange}</div>
                        <div class="item-reason">${leave.reason || '无'}</div>
                    </div>
                    <div class="item-actions">
                        <button class="btn btn-sm" onclick="viewLeaveDetail(${leave.id})">查看详情</button>
                        ${leave.status === 'pending' ? `
                            <button class="btn btn-sm btn-danger" onclick="cancelLeaveApplication(${leave.id})">取消</button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载请假申请失败:', error);
        const container = document.getElementById('leave-list');
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p>加载失败，请稍后重试</p></div>';
    }
}

/**
 * 显示新建请假表单
 */
export async function showNewLeaveForm() {
    // 加载请假类型
    const leaveTypes = await getLeaveTypes();
    
    // 加载年假信息
    let annualLeaveInfo = null;
    try {
        annualLeaveInfo = await getAnnualLeaveInfo();
    } catch (error) {
        console.warn('获取年假信息失败:', error);
    }
    
    // 创建表单HTML（简化版，实际应该从原app.js中提取完整逻辑）
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;
    
    const leaveTypesOptions = leaveTypes.map(lt => 
        `<option value="${lt.id}">${lt.name}</option>`
    ).join('');
    
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeFormModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>申请请假</h2>
                    <button class="modal-close" onclick="closeFormModal()">×</button>
                </div>
                <form id="leave-form" onsubmit="submitLeaveForm(event)">
                    <div class="form-group">
                        <label>请假类型</label>
                        <select id="leave-type" class="form-select" required onchange="onLeaveTypeChange()">
                            <option value="">请选择</option>
                            ${leaveTypesOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>开始日期</label>
                        <input type="date" id="leave-start-date" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>开始时间</label>
                        <input type="time" id="leave-start-time" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>结束日期</label>
                        <input type="date" id="leave-end-date" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>结束时间</label>
                        <input type="time" id="leave-end-time" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>请假天数</label>
                        <input type="number" id="leave-days" class="form-input" step="0.5" min="0.5" required readonly>
                    </div>
                    <div class="form-group">
                        <label>请假原因</label>
                        <textarea id="leave-reason" class="form-textarea" rows="4" required></textarea>
                    </div>
                    ${annualLeaveInfo ? `
                        <div class="form-info">
                            <p>年假余额: ${annualLeaveInfo.remaining_days}天</p>
                        </div>
                    ` : ''}
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeFormModal()">取消</button>
                        <button type="submit" class="btn btn-primary">提交</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    modalContainer.style.display = 'flex';
    
    // 设置默认值
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('leave-start-date').value = today;
    document.getElementById('leave-end-date').value = today;
    document.getElementById('leave-start-time').value = '09:00';
    document.getElementById('leave-end-time').value = '17:30';
    
    // 绑定事件
    window.onLeaveTypeChange = onLeaveTypeChange;
    window.calculateLeaveDays = calculateLeaveDays;
    window.submitLeaveForm = submitLeaveForm;
    
    // 监听日期时间变化
    ['leave-start-date', 'leave-start-time', 'leave-end-date', 'leave-end-time'].forEach(id => {
        document.getElementById(id).addEventListener('change', calculateLeaveDays);
    });
}

/**
 * 请假类型变化处理
 */
function onLeaveTypeChange() {
    // 实现逻辑
}

/**
 * 计算请假天数
 */
function calculateLeaveDays() {
    const startDate = document.getElementById('leave-start-date').value;
    const startTime = document.getElementById('leave-start-time').value;
    const endDate = document.getElementById('leave-end-date').value;
    const endTime = document.getElementById('leave-end-time').value;
    
    if (startDate && startTime && endDate && endTime) {
        const days = calculateLeaveDaysByRules(startDate, startTime, endDate, endTime);
        document.getElementById('leave-days').value = days;
    }
}

/**
 * 提交请假表单
 */
export async function submitLeaveForm(event) {
    event.preventDefault();
    
    const startDate = document.getElementById('leave-start-date').value;
    const startTime = document.getElementById('leave-start-time').value;
    const endDate = document.getElementById('leave-end-date').value;
    const endTime = document.getElementById('leave-end-time').value;
    const leaveTypeId = parseInt(document.getElementById('leave-type').value);
    const days = parseFloat(document.getElementById('leave-days').value);
    const reason = document.getElementById('leave-reason').value;
    
    // 验证
    const dateValidation = validateDateRange(startDate, endDate);
    if (!dateValidation.valid) {
        await showToast(dateValidation.message, 'warning');
        return;
    }
    
    const reasonValidation = validateRequired(reason, '请假原因');
    if (!reasonValidation.valid) {
        await showToast(reasonValidation.message, 'warning');
        return;
    }
    
    try {
        const startDateTime = new Date(`${startDate}T${startTime}`);
        const endDateTime = new Date(`${endDate}T${endTime}`);
        
        await createLeaveApplication({
            start_date: startDateTime.toISOString(),
            end_date: endDateTime.toISOString(),
            days: days,
            reason: reason,
            leave_type_id: leaveTypeId
        });
        
        await showToast('请假申请提交成功！', 'success');
        closeFormModal();
        await loadMyLeaveApplications();
    } catch (error) {
        await showToast('提交失败: ' + error.message, 'error');
    }
}

/**
 * 取消请假申请
 */
export async function cancelLeaveApplication(leaveId) {
    const confirmed = await showToast('确定要取消这个请假申请吗？', 'warning', {
        confirm: true,
        confirmText: '确定',
        cancelText: '取消'
    });
    
    if (!confirmed) return;
    
    try {
        await cancelLeaveApplication(leaveId);
        await showToast('取消成功', 'success');
        await loadMyLeaveApplications();
    } catch (error) {
        await showToast('取消失败: ' + error.message, 'error');
    }
}

/**
 * 查看请假详情
 */
export async function viewLeaveDetail(leaveId) {
    try {
        const leave = await getLeaveDetail(leaveId);
        // 显示详情模态框（实现逻辑）
        console.log('请假详情:', leave);
    } catch (error) {
        await showToast('加载详情失败: ' + error.message, 'error');
    }
}

// 导出到全局
window.loadMyLeaveApplications = loadMyLeaveApplications;
window.showNewLeaveForm = showNewLeaveForm;
window.cancelLeaveApplication = cancelLeaveApplication;
window.viewLeaveDetail = viewLeaveDetail;

