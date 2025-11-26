/**
 * 考勤记录页面模块
 */
import { getMyAttendance, getAttendanceOverview } from '../api/attendance.js';
import { formatTime, formatCheckinStatus } from '../utils/status.js';
import { getCSTDate } from '../utils/date.js';

/**
 * 加载考勤记录（按月）
 */
export async function loadAttendanceByMonth() {
    const monthInput = document.getElementById('attendance-month');
    if (!monthInput) return;
    
    if (!monthInput.value) {
        const now = new Date();
        monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const [year, month] = monthInput.value.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    try {
        const attendances = await getMyAttendance(startDate, endDate);
        const container = document.getElementById('attendance-list');

        if (attendances.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><p>本月暂无考勤记录</p></div>';
            return;
        }

        container.innerHTML = attendances.map(att => {
            const date = new Date(att.date);
            const statusInfo = formatCheckinStatus(att.checkin_status);
            const statusBadge = att.checkin_time && statusInfo.text 
                ? `<span class="checkin-status-badge ${statusInfo.class}">${statusInfo.text}</span>` 
                : '';
            
            return `
                <div class="attendance-item">
                    <div class="attendance-date">
                        <div class="attendance-day">${date.getDate()}</div>
                        <div class="attendance-month">${date.getMonth() + 1}月</div>
                    </div>
                    <div class="attendance-info">
                        <div class="attendance-time">
                            <span>上班:</span>
                            <strong>${att.checkin_time ? formatTime(att.checkin_time) : '-'}</strong>
                            ${statusBadge}
                            ${att.is_late ? '<span class="status-badge status-warning">迟到</span>' : ''}
                        </div>
                        ${att.checkin_location ? `<div class="attendance-location"><span>📍 ${att.checkin_location}</span></div>` : ''}
                        <div class="attendance-time">
                            <span>下班:</span>
                            <strong>${att.checkout_time ? formatTime(att.checkout_time) : '-'}</strong>
                            ${att.is_early_leave ? '<span class="status-badge status-warning">早退</span>' : ''}
                        </div>
                        ${att.checkout_location ? `<div class="attendance-location"><span>📍 ${att.checkout_location}</span></div>` : ''}
                        ${att.work_hours ? `<div class="attendance-hours">工作时长: ${att.work_hours}小时</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载考勤记录失败:', error);
        const container = document.getElementById('attendance-list');
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p>加载失败，请稍后重试</p></div>';
    }
}

/**
 * 加载出勤情况概览
 */
export async function loadAttendanceOverview() {
    try {
        const dateInput = document.getElementById('overview-date');
        const targetDate = dateInput ? (dateInput.value || getCSTDate()) : getCSTDate();
        
        const overview = await getAttendanceOverview(targetDate);
        
        // 更新工作日标识
        const workdayBadge = document.getElementById('overview-workday-badge');
        const workdayText = document.getElementById('overview-workday-text');
        const overviewInfo = document.getElementById('overview-info');
        
        if (overviewInfo) {
            overviewInfo.style.display = 'block';
        }
        
        if (workdayBadge) {
            workdayBadge.textContent = overview.is_workday ? '工作日' : '休息日';
            workdayBadge.className = `workday-badge ${overview.is_workday ? 'workday' : 'holiday'}`;
        }
        
        if (workdayText) {
            workdayText.textContent = overview.holiday_name ? `（${overview.holiday_name}）` : '';
        }
        
        // 渲染分类列表
        const categoriesContainer = document.getElementById('overview-categories');
        if (!categoriesContainer) return;
        
        if (!overview.categories || overview.categories.length === 0) {
            categoriesContainer.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p>暂无出勤数据</p></div>';
            return;
        }
        
        categoriesContainer.innerHTML = overview.categories.map(category => {
            const items = category.items || [];
            return `
                <div class="overview-category">
                    <div class="category-header">
                        <h3>${category.name} (${items.length}人)</h3>
                    </div>
                    <div class="category-items">
                        ${items.map(item => {
                            const extraInfo = getOverviewExtraInfo(category.key, item);
                            return `
                                <div class="category-item">
                                    <div class="item-name">${item.real_name || item.username}</div>
                                    <div class="item-extra">${extraInfo.extra}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载出勤情况失败:', error);
        const categoriesContainer = document.getElementById('overview-categories');
        if (categoriesContainer) {
            categoriesContainer.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p>加载失败，请稍后重试</p></div>';
        }
    }
}

/**
 * 获取概览额外信息
 */
function getOverviewExtraInfo(categoryKey, item) {
    if (categoryKey === 'leave') {
        return {
            extra: item.leave_type_name || '请假',
            detail: `${item.start_date} 至 ${item.end_date} 共${item.days}天`
        };
    } else if (categoryKey === 'overtime') {
        return {
            extra: item.overtime_type === 'passive' ? '被动加班' : '主动加班',
            detail: `${item.start_time} 至 ${item.end_time} 共${item.days}天`
        };
    } else if (categoryKey === 'business_trip') {
        return {
            extra: '出差',
            detail: item.checkin_location || ''
        };
    } else if (categoryKey === 'city_business') {
        return {
            extra: '市区办事',
            detail: item.checkin_location || ''
        };
    }
    return { extra: '', detail: '' };
}

// 导出到全局
window.loadAttendanceByMonth = loadAttendanceByMonth;
window.loadAttendanceOverview = loadAttendanceOverview;

