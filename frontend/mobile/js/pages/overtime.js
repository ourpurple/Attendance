/**
 * 加班管理页面模块
 */
import { 
    getMyOvertimeApplications, 
    createOvertimeApplication, 
    cancelOvertimeApplication,
    deleteOvertimeApplication,
    getOvertimeDetail,
    getOvertimeApprovers
} from '../api/overtime.js';
import { formatOvertimeDate, formatOvertimeRange } from '../utils/format.js';
import { getOvertimeStatusName, getStatusClass } from '../utils/status.js';
import { showToast } from '../utils/toast.js';
import { calculateOvertimeDaysByRules } from '../utils/calculation.js';
import { validateDateRange, validateTimeRange, validateRequired } from '../utils/validation.js';

/**
 * 加载我的加班申请列表
 */
export async function loadMyOvertimeApplications() {
    try {
        const overtimes = await getMyOvertimeApplications();
        const container = document.getElementById('overtime-list');

        if (overtimes.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏰</div><p>暂无加班申请</p></div>';
            return;
        }

        container.innerHTML = overtimes.map(overtime => {
            const statusName = getOvertimeStatusName(overtime.status);
            const statusClass = getStatusClass(overtime.status);
            const dateRange = formatOvertimeRange(overtime.start_time, overtime.end_time, overtime.days);
            const typeText = overtime.overtime_type === 'passive' ? '被动加班' : '主动加班';
            
            return `
                <div class="list-item">
                    <div class="item-header">
                        <div class="item-title">${typeText}</div>
                        <span class="status-badge ${statusClass}">${statusName}</span>
                    </div>
                    <div class="item-content">
                        <div class="item-info">${dateRange}</div>
                        <div class="item-reason">${overtime.reason || '无'}</div>
                    </div>
                    <div class="item-actions">
                        <button class="btn btn-sm" onclick="viewOvertimeDetail(${overtime.id})">查看详情</button>
                        ${overtime.status === 'pending' ? `
                            <button class="btn btn-sm btn-danger" onclick="cancelOvertimeApplication(${overtime.id})">取消</button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载加班申请失败:', error);
        const container = document.getElementById('overtime-list');
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p>加载失败，请稍后重试</p></div>';
    }
}

/**
 * 显示新建加班表单
 */
export async function showNewOvertimeForm() {
    // 加载审批人列表
    let approvers = [];
    try {
        approvers = await getOvertimeApprovers();
    } catch (error) {
        console.warn('获取审批人列表失败:', error);
    }
    
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;
    
    const approversOptions = approvers.map(approver => 
        `<option value="${approver.id}">${approver.real_name} (${approver.role})</option>`
    ).join('');
    
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeFormModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>申请加班</h2>
                    <button class="modal-close" onclick="closeFormModal()">×</button>
                </div>
                <form id="overtime-form" onsubmit="submitOvertimeForm(event)">
                    <div class="form-group">
                        <label>加班类型</label>
                        <select id="overtime-type" class="form-select" required onchange="handleOvertimeTypeChange()">
                            <option value="active">主动加班</option>
                            <option value="passive">被动加班</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>开始日期</label>
                        <input type="date" id="overtime-start-date" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>开始时间</label>
                        <input type="time" id="overtime-start-time" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>结束日期</label>
                        <input type="date" id="overtime-end-date" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>结束时间</label>
                        <input type="time" id="overtime-end-time" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>加班天数</label>
                        <input type="number" id="overtime-days" class="form-input" step="0.5" min="0.5" required readonly>
                    </div>
                    <div class="form-group">
                        <label>加班原因</label>
                        <textarea id="overtime-reason" class="form-textarea" rows="4" required></textarea>
                    </div>
                    ${approvers.length > 0 ? `
                        <div class="form-group">
                            <label>指定审批人（可选）</label>
                            <select id="overtime-approver" class="form-select">
                                <option value="">自动分配</option>
                                ${approversOptions}
                            </select>
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
    document.getElementById('overtime-start-date').value = today;
    document.getElementById('overtime-end-date').value = today;
    document.getElementById('overtime-start-time').value = '18:00';
    document.getElementById('overtime-end-time').value = '20:00';
    
    // 绑定事件
    window.handleOvertimeTypeChange = handleOvertimeTypeChange;
    window.calculateOvertimeDays = calculateOvertimeDays;
    window.submitOvertimeForm = submitOvertimeForm;
    
    // 监听日期时间变化
    ['overtime-start-date', 'overtime-start-time', 'overtime-end-date', 'overtime-end-time'].forEach(id => {
        document.getElementById(id).addEventListener('change', calculateOvertimeDays);
    });
}

/**
 * 加班类型变化处理
 */
function handleOvertimeTypeChange() {
    // 实现逻辑
}

/**
 * 计算加班天数
 */
function calculateOvertimeDays() {
    const startDate = document.getElementById('overtime-start-date').value;
    const startTime = document.getElementById('overtime-start-time').value;
    const endDate = document.getElementById('overtime-end-date').value;
    const endTime = document.getElementById('overtime-end-time').value;
    
    if (startDate && startTime && endDate && endTime) {
        const days = calculateOvertimeDaysByRules(startDate, startTime, endDate, endTime);
        document.getElementById('overtime-days').value = days;
    }
}

/**
 * 提交加班表单
 */
export async function submitOvertimeForm(event) {
    event.preventDefault();
    
    const startDate = document.getElementById('overtime-start-date').value;
    const startTime = document.getElementById('overtime-start-time').value;
    const endDate = document.getElementById('overtime-end-date').value;
    const endTime = document.getElementById('overtime-end-time').value;
    const overtimeType = document.getElementById('overtime-type').value;
    const days = parseFloat(document.getElementById('overtime-days').value);
    const reason = document.getElementById('overtime-reason').value;
    const approverId = document.getElementById('overtime-approver')?.value;
    
    // 验证
    const dateValidation = validateDateRange(startDate, endDate);
    if (!dateValidation.valid) {
        await showToast(dateValidation.message, 'warning');
        return;
    }
    
    const timeValidation = validateTimeRange(startTime, endTime);
    if (!timeValidation.valid) {
        await showToast(timeValidation.message, 'warning');
        return;
    }
    
    const reasonValidation = validateRequired(reason, '加班原因');
    if (!reasonValidation.valid) {
        await showToast(reasonValidation.message, 'warning');
        return;
    }
    
    try {
        const startDateTime = new Date(`${startDate}T${startTime}`);
        const endDateTime = new Date(`${endDate}T${endTime}`);
        const hours = (endDateTime - startDateTime) / (1000 * 60 * 60);
        
        await createOvertimeApplication({
            start_time: startDateTime.toISOString(),
            end_time: endDateTime.toISOString(),
            hours: hours,
            days: days,
            reason: reason,
            overtime_type: overtimeType,
            assigned_approver_id: approverId ? parseInt(approverId) : null
        });
        
        await showToast('加班申请提交成功！', 'success');
        closeFormModal();
        await loadMyOvertimeApplications();
    } catch (error) {
        await showToast('提交失败: ' + error.message, 'error');
    }
}

/**
 * 取消加班申请
 */
export async function cancelOvertimeApplication(overtimeId) {
    const confirmed = await showToast('确定要取消这个加班申请吗？', 'warning', {
        confirm: true,
        confirmText: '确定',
        cancelText: '取消'
    });
    
    if (!confirmed) return;
    
    try {
        await cancelOvertimeApplication(overtimeId);
        await showToast('取消成功', 'success');
        await loadMyOvertimeApplications();
    } catch (error) {
        await showToast('取消失败: ' + error.message, 'error');
    }
}

/**
 * 查看加班详情
 */
export async function viewOvertimeDetail(overtimeId) {
    try {
        const overtime = await getOvertimeDetail(overtimeId);
        // 显示详情模态框（实现逻辑）
        console.log('加班详情:', overtime);
    } catch (error) {
        await showToast('加载详情失败: ' + error.message, 'error');
    }
}

// 导出到全局
window.loadMyOvertimeApplications = loadMyOvertimeApplications;
window.showNewOvertimeForm = showNewOvertimeForm;
window.cancelOvertimeApplication = cancelOvertimeApplication;
window.viewOvertimeDetail = viewOvertimeDetail;

