/**
 * 考勤模块
 * 处理打卡、考勤记录加载、位置获取等功能
 */

import api from './api.js';
import store from './store.js';
import { showToast, showLoading, hideLoading } from './ui.js';
import { formatTime, formatDate, getCSTDate } from './utils.js';

/**
 * 获取当前位置
 * @param {number} retryCount - 重试次数
 * @returns {Promise<object>} - 位置信息
 */
export async function getCurrentLocation(retryCount = 0) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('浏览器不支持地理定位，请使用支持定位的浏览器'));
            return;
        }

        const options = {
            enableHighAccuracy: retryCount === 0,
            timeout: retryCount === 0 ? 20000 : 10000,
            maximumAge: 0
        };

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude, accuracy } = position.coords;

                    if (accuracy > 100) {
                        console.warn(`定位精度较低: ${accuracy}米`);
                    }

                    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
                        throw new Error('获取的位置坐标无效');
                    }

                    let address = null;
                    try {
                        address = await reverseGeocode(latitude, longitude);
                    } catch (geocodeError) {
                        console.warn('地理编码失败，使用坐标:', geocodeError);
                    }

                    const location = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

                    resolve({
                        location,
                        address: address || location,
                        latitude,
                        longitude
                    });
                } catch (error) {
                    reject(new Error('处理位置信息失败: ' + error.message));
                }
            },
            async (error) => {
                let errorMessage = '无法获取位置信息';
                let shouldRetry = false;

                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = '定位权限被拒绝\n\n请在浏览器设置中允许位置权限';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        if (retryCount === 0) {
                            shouldRetry = true;
                            errorMessage = 'GPS信号弱，正在尝试使用网络定位...';
                        } else {
                            errorMessage = '位置信息不可用\n\n请检查GPS是否开启';
                        }
                        break;
                    case error.TIMEOUT:
                        if (retryCount === 0) {
                            shouldRetry = true;
                            errorMessage = '获取位置超时，正在重试...';
                        } else {
                            errorMessage = '获取位置超时\n\n请检查网络连接';
                        }
                        break;
                    default:
                        errorMessage = `获取位置失败: ${error.message || '未知错误'}`;
                        break;
                }

                if (shouldRetry && retryCount < 1) {
                    console.log('定位失败，尝试降低精度重试...');
                    setTimeout(() => {
                        getCurrentLocation(retryCount + 1)
                            .then(resolve)
                            .catch(reject);
                    }, 1000);
                } else {
                    reject(new Error(errorMessage));
                }
            },
            options
        );
    });
}

/**
 * 逆地理编码 - 将经纬度转换为地址
 * @param {number} latitude - 纬度
 * @param {number} longitude - 经度
 * @returns {Promise<string>} - 地址文本
 */
export async function reverseGeocode(latitude, longitude) {
    try {
        const response = await api.get(`/attendance/geocode/reverse`, {
            latitude,
            longitude
        });

        if (response && response.address) {
            return response.address;
        }

        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    } catch (error) {
        console.error('地理编码失败:', error);
        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
}

/**
 * 检查是否为工作日
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @returns {Promise<object>} - 工作日信息
 */
export async function checkWorkday(date = null) {
    try {
        const targetDate = date || getCSTDate();
        const response = await fetch(`${api.baseURL}/holidays/check/${targetDate}`);

        if (!response.ok) {
            console.warn('API调用失败，使用本地判断');
            return localWorkdayCheck(targetDate);
        }

        return await response.json();
    } catch (error) {
        console.error('检查工作日失败:', error);
        return localWorkdayCheck(date || getCSTDate());
    }
}

/**
 * 本地工作日判断（后备方案）
 * @param {string} dateStr - 日期字符串
 * @returns {object} - 工作日信息
 */
function localWorkdayCheck(dateStr) {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        return {
            date: dateStr,
            is_workday: true,
            reason: '正常工作日',
            holiday_name: null
        };
    } else {
        return {
            date: dateStr,
            is_workday: false,
            reason: dayNames[dayOfWeek],
            holiday_name: null
        };
    }
}

/**
 * 检查是否会迟到
 * @returns {Promise<object>} - 迟到检查结果
 */
export async function checkLate() {
    try {
        return await api.get('/attendance/check-late');
    } catch (error) {
        console.error('检查迟到状态失败:', error);
        return { will_be_late: false };
    }
}

/**
 * 检查是否会早退
 * @returns {Promise<object>} - 早退检查结果
 */
export async function checkEarlyLeave() {
    try {
        return await api.get('/attendance/check-early-leave');
    } catch (error) {
        console.error('检查早退状态失败:', error);
        return { will_be_early_leave: false };
    }
}

/**
 * 检查请假状态
 * @returns {Promise<object>} - 请假状态
 */
export async function checkLeaveStatus() {
    try {
        return await api.get('/attendance/leave-status');
    } catch (error) {
        console.error('检查请假状态失败:', error);
        return {
            full_day_leave: false,
            morning_leave: false,
            afternoon_leave: false
        };
    }
}

/**
 * 获取打卡策略
 * @returns {Promise<object>} - 打卡策略
 */
export async function getAttendancePolicy() {
    try {
        const policies = await api.get('/attendance/policies');
        if (policies && policies.length > 0) {
            return policies.find(p => p.is_active) || policies[0];
        }
        return null;
    } catch (error) {
        console.error('获取打卡策略失败:', error);
        return null;
    }
}

/**
 * 上班打卡
 * @param {string} checkinStatus - 打卡状态 (normal/city_business/business_trip)
 * @returns {Promise<object>} - 打卡结果
 */
export async function checkin(checkinStatus = 'normal') {
    const user = store.getState('currentUser');

    if (user?.enable_attendance === false) {
        showToast('您不用打卡!', 'info');
        return null;
    }

    // 检查工作日
    const workdayCheck = await checkWorkday();
    if (!workdayCheck.is_workday) {
        const message = workdayCheck.holiday_name
            ? `今天是${workdayCheck.holiday_name}，无需打卡！`
            : '今天是休息日，无需打卡！';
        showToast(message, 'info');
        return null;
    }

    // 检查请假状态
    const leaveStatus = await checkLeaveStatus();
    if (leaveStatus.full_day_leave) {
        showToast('今天全天请假，无需打卡', 'info');
        return null;
    }

    showLoading('获取位置中...');

    try {
        const locationData = await getCurrentLocation();
        locationData.checkin_status = checkinStatus;

        const result = await api.post('/attendance/checkin', locationData);

        hideLoading();
        showToast('上班打卡成功！', 'success');

        // 更新状态
        await loadTodayAttendance();

        return result;
    } catch (error) {
        hideLoading();
        showToast('打卡失败: ' + error.message, 'error');
        throw error;
    }
}

/**
 * 下班打卡
 * @returns {Promise<object>} - 打卡结果
 */
export async function checkout() {
    const user = store.getState('currentUser');

    if (user?.enable_attendance === false) {
        showToast('您不用打卡!', 'info');
        return null;
    }

    // 检查请假状态
    const leaveStatus = await checkLeaveStatus();
    if (leaveStatus.afternoon_leave) {
        showToast('下午请假，无需签退', 'info');
        return null;
    }

    // 检查工作日
    const workdayCheck = await checkWorkday();
    if (!workdayCheck.is_workday) {
        const message = workdayCheck.holiday_name
            ? `今天是${workdayCheck.holiday_name}，无需打卡！`
            : '今天是休息日，无需打卡！';
        showToast(message, 'info');
        return null;
    }

    showLoading('获取位置中...');

    try {
        const locationData = await getCurrentLocation();

        const result = await api.post('/attendance/checkout', locationData);

        hideLoading();
        showToast('下班打卡成功！', 'success');

        // 更新状态
        await loadTodayAttendance();

        return result;
    } catch (error) {
        hideLoading();
        showToast('打卡失败: ' + error.message, 'error');
        throw error;
    }
}

/**
 * 加载今日考勤状态
 * @returns {Promise<object|null>} - 今日考勤记录
 */
export async function loadTodayAttendance() {
    try {
        const today = getCSTDate();

        // 计算7天前的日期
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const cst = new Date(utc + (8 * 3600000));
        const sevenDaysAgo = new Date(cst.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startDate = formatDateStr(sevenDaysAgo);

        const attendances = await api.get('/attendance/my', {
            start_date: startDate,
            end_date: today,
            limit: 10
        });

        // 过滤今天的记录
        let todayAttendance = null;
        if (attendances && attendances.length > 0) {
            for (const att of attendances) {
                if (att.date) {
                    let attDateStr = '';
                    if (typeof att.date === 'string') {
                        attDateStr = att.date.split('T')[0];
                    } else {
                        const d = new Date(att.date);
                        if (!isNaN(d.getTime())) {
                            attDateStr = formatDateStr(d);
                        }
                    }
                    if (attDateStr === today) {
                        todayAttendance = att;
                        break;
                    }
                }
            }
        }

        // 更新store中的状态
        store.setState('todayAttendance', todayAttendance);

        return todayAttendance;
    } catch (error) {
        console.error('加载今日打卡状态失败:', error);
        return null;
    }
}

/**
 * 加载最近考勤记录
 * @param {number} days - 天数
 * @returns {Promise<array>} - 考勤记录列表
 */
export async function loadRecentAttendance(days = 7) {
    try {
        const now = new Date();
        const endDate = formatDateStr(now);

        const startDateObj = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const startDate = formatDateStr(startDateObj);

        const attendances = await api.get('/attendance/my', {
            start_date: startDate,
            end_date: endDate,
            limit: 5
        });

        store.setState('recentAttendances', attendances || []);

        return attendances || [];
    } catch (error) {
        console.error('加载最近考勤失败:', error);
        return [];
    }
}

/**
 * 按月加载考勤记录
 * @param {string} yearMonth - 年月 (YYYY-MM)
 * @returns {Promise<array>} - 考勤记录列表
 */
export async function loadAttendanceByMonth(yearMonth) {
    try {
        const [year, month] = yearMonth.split('-');
        const startDate = `${year}-${month}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        const attendances = await api.get('/attendance/my', {
            start_date: startDate,
            end_date: endDate
        });

        return attendances || [];
    } catch (error) {
        console.error('加载月度考勤失败:', error);
        return [];
    }
}

/**
 * 加载出勤概览
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @returns {Promise<object>} - 出勤概览
 */
export async function loadAttendanceOverview(date) {
    try {
        const targetDate = date || getCSTDate();
        return await api.get('/attendance/overview', {
            target_date: targetDate
        });
    } catch (error) {
        console.error('加载出勤概览失败:', error);
        throw error;
    }
}

/**
 * 格式化日期为字符串
 * @param {Date} date - 日期对象
 * @returns {string} - YYYY-MM-DD格式的日期字符串
 */
function formatDateStr(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 格式化打卡状态
 * @param {string} status - 打卡状态
 * @returns {object} - 状态信息
 */
export function formatCheckinStatus(status) {
    if (!status || status === 'normal') {
        return { text: '正常打卡', class: 'checkin-status-normal' };
    } else if (status === 'city_business') {
        return { text: '市区办事', class: 'checkin-status-business' };
    } else if (status === 'business_trip') {
        return { text: '出差', class: 'checkin-status-business' };
    }
    return { text: '', class: '' };
}

export default {
    getCurrentLocation,
    reverseGeocode,
    checkWorkday,
    checkLate,
    checkEarlyLeave,
    checkLeaveStatus,
    getAttendancePolicy,
    checkin,
    checkout,
    loadTodayAttendance,
    loadRecentAttendance,
    loadAttendanceByMonth,
    loadAttendanceOverview,
    formatCheckinStatus
};
