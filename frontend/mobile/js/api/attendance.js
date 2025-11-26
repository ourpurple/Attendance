/**
 * 考勤相关API
 */
import { apiRequest } from './client.js';

/**
 * 上班打卡
 */
export async function checkin(locationData) {
    return await apiRequest('/attendance/checkin', {
        method: 'POST',
        body: JSON.stringify(locationData)
    });
}

/**
 * 下班打卡
 */
export async function checkout(locationData) {
    return await apiRequest('/attendance/checkout', {
        method: 'POST',
        body: JSON.stringify(locationData)
    });
}

/**
 * 获取我的考勤记录
 */
export async function getMyAttendance(startDate, endDate, limit = 100) {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (limit) params.append('limit', limit);
    
    return await apiRequest(`/attendance/my?${params.toString()}`);
}

/**
 * 获取考勤概览
 */
export async function getAttendanceOverview(targetDate) {
    return await apiRequest(`/attendance/overview?target_date=${targetDate}`);
}

/**
 * 逆地理编码（经纬度转地址）
 */
export async function reverseGeocode(latitude, longitude) {
    return await apiRequest(`/attendance/geocode/reverse?latitude=${latitude}&longitude=${longitude}`);
}

/**
 * 检查工作日
 */
export async function checkWorkday(date) {
    return await apiRequest(`/holidays/check/${date}`);
}

