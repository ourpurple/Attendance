/**
 * 首页模块
 * 处理首页相关的逻辑
 */
import { getCurrentUser } from '../config.js';
import { getMyAttendance, checkWorkday } from '../api/attendance.js';
import { getMyLeaveApplications } from '../api/leave.js';
import { getMyOvertimeApplications } from '../api/overtime.js';
import { getCSTDate, localWorkdayCheck } from '../utils/date.js';
import { formatCheckinStatus } from '../utils/status.js';
import { formatTime } from '../utils/time.js';
import { showToast } from '../utils/toast.js';
import { getCurrentLocation } from '../utils/location.js';
import { checkin as apiCheckin, checkout as apiCheckout } from '../api/attendance.js';

/**
 * 加载首页数据
 */
export async function loadHomeData() {
    const currentUser = getCurrentUser();
    const attendanceEnabled = currentUser?.enable_attendance !== false;
    
    updateAttendanceAvailabilityState(attendanceEnabled);
    
    if (attendanceEnabled) {
        await loadTodayAttendance();
    }

    await loadRecentAttendance();
    await loadPendingCount();
    await loadMyPendingCounts();
    
    if (attendanceEnabled) {
        await checkAndSetAttendanceButtons();
    }
}

/**
 * 加载今日打卡状态
 */
export async function loadTodayAttendance() {
    try {
        const today = getCSTDate();
        
        // 计算7天前的日期
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const cst = new Date(utc + (8 * 3600000));
        const sevenDaysAgo = new Date(cst.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startYear = sevenDaysAgo.getFullYear();
        const startMonth = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
        const startDay = String(sevenDaysAgo.getDate()).padStart(2, '0');
        const startDate = `${startYear}-${startMonth}-${startDay}`;
        
        const attendances = await getMyAttendance(startDate, today, 10);
        
        // 在前端过滤今天的记录
        let todayAttendance = null;
        if (attendances && attendances.length > 0) {
            const todayDateStr = today;
            for (const att of attendances) {
                if (att.date) {
                    let attDateStr = '';
                    if (typeof att.date === 'string') {
                        attDateStr = att.date.split('T')[0];
                    } else {
                        const d = new Date(att.date);
                        if (!isNaN(d.getTime())) {
                            attDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        }
                    }
                    if (attDateStr === todayDateStr) {
                        todayAttendance = att;
                        break;
                    }
                }
            }
        }
        
        updateTodayAttendanceDisplay(todayAttendance);
    } catch (error) {
        console.error('加载今日打卡失败:', error);
        resetTodayAttendanceDisplay();
    }
}

/**
 * 更新今日打卡显示
 */
function updateTodayAttendanceDisplay(todayAttendance) {
    if (todayAttendance) {
        const att = todayAttendance;
        const hasCheckin = att.checkin_time && att.checkin_time !== null && att.checkin_time !== '';
        const hasCheckout = att.checkout_time && att.checkout_time !== null && att.checkout_time !== '';
        
        const checkinStatusEl = document.getElementById('checkin-status');
        const checkoutStatusEl = document.getElementById('checkout-status');
        
        if (checkinStatusEl) {
            checkinStatusEl.textContent = hasCheckin ? formatTime(att.checkin_time) : '未打卡';
        }
        if (checkoutStatusEl) {
            checkoutStatusEl.textContent = hasCheckout ? formatTime(att.checkout_time) : '未打卡';
        }

        const checkinBtn = document.getElementById('checkin-btn');
        const checkoutBtn = document.getElementById('checkout-btn');
        
        if (checkinBtn) checkinBtn.disabled = hasCheckin;
        if (checkoutBtn) checkoutBtn.disabled = !hasCheckin || hasCheckout;
        
        updateClockLocation(hasCheckin, hasCheckout);
    } else {
        resetTodayAttendanceDisplay();
    }
}

/**
 * 重置今日打卡显示
 */
function resetTodayAttendanceDisplay() {
    const checkinStatusEl = document.getElementById('checkin-status');
    const checkoutStatusEl = document.getElementById('checkout-status');
    const checkinBtn = document.getElementById('checkin-btn');
    const checkoutBtn = document.getElementById('checkout-btn');
    
    if (checkinStatusEl) checkinStatusEl.textContent = '未打卡';
    if (checkoutStatusEl) checkoutStatusEl.textContent = '未打卡';
    if (checkinBtn) checkinBtn.disabled = false;
    if (checkoutBtn) checkoutBtn.disabled = true;
}

/**
 * 更新时钟位置显示
 */
async function updateClockLocation(hasCheckin, hasCheckout) {
    const clockLocation = document.getElementById('clock-location');
    if (!clockLocation) return;
    
    if (hasCheckin && hasCheckout) {
        clockLocation.textContent = '今天打卡完成，工作辛苦了！';
        clockLocation.style.color = '#34c759';
        clockLocation.style.fontWeight = 'bold';
        clockLocation.style.display = 'block';
    } else if (hasCheckin && !hasCheckout) {
        clockLocation.textContent = '签退时间：17:20-20:00';
        clockLocation.style.color = '#999';
        clockLocation.style.fontWeight = 'bold';
        clockLocation.style.display = 'block';
    }
}

/**
 * 加载最近考勤
 */
export async function loadRecentAttendance() {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const endDate = `${year}-${month}-${day}`;
        
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const startYear = sevenDaysAgo.getFullYear();
        const startMonth = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
        const startDay = String(sevenDaysAgo.getDate()).padStart(2, '0');
        const startDate = `${startYear}-${startMonth}-${startDay}`;
        
        const attendances = await getMyAttendance(startDate, endDate, 5);
        const container = document.getElementById('recent-attendance');
        
        if (attendances.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><p>暂无考勤记录</p></div>';
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
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载最近考勤失败:', error);
    }
}

/**
 * 加载我的未完成申请数量
 */
export async function loadMyPendingCounts() {
    try {
        const { getMyLeaveApplications } = await import('../api/leave.js');
        const { getMyOvertimeApplications } = await import('../api/overtime.js');
        
        const [leaves, overtimes] = await Promise.all([
            getMyLeaveApplications('pending'),
            getMyOvertimeApplications('pending')
        ]);
        
        const leaveCount = leaves.length || 0;
        const overtimeCount = overtimes.length || 0;
        
        const leaveBadge = document.getElementById('leave-pending-count');
        const overtimeBadge = document.getElementById('overtime-pending-count');
        
        if (leaveBadge) {
            leaveBadge.textContent = leaveCount;
            leaveBadge.style.display = leaveCount > 0 ? 'inline-block' : 'none';
        }
        
        if (overtimeBadge) {
            overtimeBadge.textContent = overtimeCount;
            overtimeBadge.style.display = overtimeCount > 0 ? 'inline-block' : 'none';
        }
    } catch (error) {
        console.error('加载未完成申请数量失败:', error);
    }
}

/**
 * 检查并设置打卡按钮状态
 */
export async function checkAndSetAttendanceButtons() {
    const checkinBtn = document.getElementById('checkin-btn');
    const checkoutBtn = document.getElementById('checkout-btn');
    const clockLocation = document.getElementById('clock-location');
    const clockStatus = document.getElementById('clock-status');
    
    // 获取今日打卡状态
    let todayAttendance = null;
    try {
        const today = getCSTDate();
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const cst = new Date(utc + (8 * 3600000));
        const sevenDaysAgo = new Date(cst.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startYear = sevenDaysAgo.getFullYear();
        const startMonth = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
        const startDay = String(sevenDaysAgo.getDate()).padStart(2, '0');
        const startDate = `${startYear}-${startMonth}-${startDay}`;
        
        const attendances = await getMyAttendance(startDate, today, 10);
        if (attendances && attendances.length > 0) {
            const todayDateStr = today;
            for (const att of attendances) {
                if (att.date) {
                    let attDateStr = '';
                    if (typeof att.date === 'string') {
                        attDateStr = att.date.split('T')[0];
                    } else {
                        const d = new Date(att.date);
                        if (!isNaN(d.getTime())) {
                            attDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        }
                    }
                    if (attDateStr === todayDateStr) {
                        todayAttendance = att;
                        break;
                    }
                }
            }
        }
    } catch (error) {
        console.error('获取今日打卡状态失败:', error);
    }
    
    // 检查今天是否为工作日
    let workdayCheck;
    try {
        workdayCheck = await checkWorkday();
    } catch (error) {
        workdayCheck = localWorkdayCheck(getCSTDate());
    }
    
    if (!workdayCheck || workdayCheck.is_workday === undefined) {
        workdayCheck = localWorkdayCheck(getCSTDate());
    }
    
    if (!workdayCheck.is_workday) {
        // 非工作日
        if (clockStatus) clockStatus.style.display = 'none';
        if (checkinBtn) {
            checkinBtn.disabled = true;
            checkinBtn.style.opacity = '0.5';
            checkinBtn.style.cursor = 'not-allowed';
        }
        if (checkoutBtn) {
            checkoutBtn.disabled = true;
            checkoutBtn.style.opacity = '0.5';
            checkoutBtn.style.cursor = 'not-allowed';
        }
        
        if (clockLocation) {
            let reasonText = '';
            const reason = workdayCheck.reason || '休息日';
            const holidayName = workdayCheck.holiday_name ? `（${workdayCheck.holiday_name}）` : '';
            
            if (reason === '周末') {
                reasonText = `今日${reason}，无需打卡`;
            } else if (reason === '公司节假日') {
                reasonText = `今日公司节假日${holidayName}，无需打卡`;
            } else if (reason === '法定节假日') {
                reasonText = `今日法定节假日${holidayName}，无需打卡`;
            } else {
                reasonText = `今日${reason}，无需打卡${holidayName}`;
            }
            
            clockLocation.textContent = reasonText;
            clockLocation.style.color = '#ff9500';
            clockLocation.style.fontWeight = 'bold';
            clockLocation.style.display = 'block';
        }
    } else {
        // 工作日
        if (clockStatus) clockStatus.style.display = '';
        
        const hasCheckin = todayAttendance && todayAttendance.checkin_time && 
                          todayAttendance.checkin_time !== null && 
                          todayAttendance.checkin_time !== '';
        const hasCheckout = todayAttendance && todayAttendance.checkout_time && 
                           todayAttendance.checkout_time !== null && 
                           todayAttendance.checkout_time !== '';
        
        // 检查打卡时间范围
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const isInPunchTime = isInCheckinTime(currentTime) || isInCheckoutTime(currentTime);
        
        // 设置按钮状态
        if (checkinBtn) {
            checkinBtn.disabled = hasCheckin || !isInPunchTime;
            checkinBtn.style.opacity = (hasCheckin || !isInPunchTime) ? '0.6' : '1';
            checkinBtn.style.cursor = (hasCheckin || !isInPunchTime) ? 'not-allowed' : 'pointer';
        }
        
        if (checkoutBtn) {
            checkoutBtn.disabled = !hasCheckin || hasCheckout || !isInCheckoutTime(currentTime);
            checkoutBtn.style.opacity = (!hasCheckin || hasCheckout || !isInCheckoutTime(currentTime)) ? '0.6' : '1';
            checkoutBtn.style.cursor = (!hasCheckin || hasCheckout || !isInCheckoutTime(currentTime)) ? 'not-allowed' : 'pointer';
        }
        
        if (clockLocation && !hasCheckin && !isInPunchTime) {
            clockLocation.textContent = '工作日，尚未开始打卡。';
            clockLocation.style.color = '#999';
            clockLocation.style.fontWeight = 'bold';
            clockLocation.style.display = 'block';
        }
    }
}

/**
 * 判断是否在上班打卡时间内
 */
function isInCheckinTime(currentTime) {
    // 默认时间范围：08:00 - 10:00
    return currentTime >= '08:00' && currentTime <= '10:00';
}

/**
 * 判断是否在下班打卡时间内
 */
function isInCheckoutTime(currentTime) {
    // 默认时间范围：17:00 - 20:00
    return currentTime >= '17:00' && currentTime <= '20:00';
}

/**
 * 更新考勤可用状态
 */
export function updateAttendanceAvailabilityState(isEnabled) {
    const clockCard = document.querySelector('.clock-card');
    if (clockCard) {
        clockCard.style.display = isEnabled ? '' : 'none';
    }
}

/**
 * 上班打卡
 */
export async function checkin() {
    const btn = document.getElementById('checkin-btn');
    if (!btn) return;
    
    // 获取打卡状态
    const statusSelect = document.getElementById('checkin-status-select');
    const checkinStatus = statusSelect ? statusSelect.value : 'normal';
    
    btn.disabled = true;
    btn.innerHTML = '<span>📍</span><span>获取位置中...</span>';

    try {
        await showToast('正在获取位置信息，请稍候...', 'info', { timeout: 3000 });
        
        const locationData = await getCurrentLocation();
        locationData.checkin_status = checkinStatus;
        
        await apiCheckin(locationData);
        await showToast('上班打卡成功！', 'success', { timeout: 2000 });
        
        await loadMyPendingCounts();
        await loadHomeData();
        
        setTimeout(() => {
            window.location.reload();
        }, 500);
    } catch (error) {
        await showToast('打卡失败: ' + error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<span>📍</span><span>上班打卡</span>';
    }
}

/**
 * 下班打卡
 */
export async function checkout() {
    const btn = document.getElementById('checkout-btn');
    if (!btn) return;
    
    btn.disabled = true;
    btn.innerHTML = '<span>📍</span><span>获取位置中...</span>';

    try {
        await showToast('正在获取位置信息，请稍候...', 'info', { timeout: 3000 });
        
        const locationData = await getCurrentLocation();
        
        await apiCheckout(locationData);
        await showToast('下班打卡成功！', 'success', { timeout: 2000 });
        
        await loadMyPendingCounts();
        await loadHomeData();
        
        setTimeout(() => {
            window.location.reload();
        }, 500);
    } catch (error) {
        await showToast('打卡失败: ' + error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<span>📍</span><span>下班打卡</span>';
    }
}

// 导出到全局供HTML使用
window.checkin = checkin;
window.checkout = checkout;

