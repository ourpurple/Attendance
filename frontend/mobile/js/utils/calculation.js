/**
 * 计算工具模块
 * 提供请假天数、加班天数等计算函数
 */

/**
 * 计算请假天数（根据规则）
 */
export function calculateLeaveDaysByRules(startDate, startTime, endDate, endTime) {
    // 解析日期和时间
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    
    // 如果结束时间早于开始时间，返回0
    if (end < start) {
        return 0;
    }
    
    // 计算总分钟数
    const totalMinutes = (end - start) / (1000 * 60);
    
    // 判断是否同一天
    const isSameDay = startDate === endDate;
    
    if (isSameDay) {
        // 同一天：根据时间段计算
        return calculateSingleDayLeave(startTime, endTime);
    } else {
        // 跨天：计算完整天数 + 首尾天数
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const daysDiff = Math.floor((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
        
        // 计算首尾天数
        const startDayHours = calculateDayHours(startTime, '23:59');
        const endDayHours = calculateDayHours('00:00', endTime);
        
        const totalDays = daysDiff - 1 + (startDayHours / 8) + (endDayHours / 8);
        return Math.round(totalDays * 2) / 2; // 保留0.5的精度
    }
}

/**
 * 计算单天请假天数
 */
export function calculateSingleDayLeave(startTime, endTime) {
    const hours = calculateDayHours(startTime, endTime);
    
    if (hours <= 4) {
        return 0.5; // 半天
    } else if (hours <= 8) {
        return 1; // 一天
    } else {
        return Math.ceil(hours / 8); // 超过8小时按天计算
    }
}

/**
 * 计算一天的工作小时数
 */
function calculateDayHours(startTime, endTime) {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    let totalMinutes = endMinutes - startMinutes;
    
    // 处理跨天情况
    if (totalMinutes < 0) {
        totalMinutes += 24 * 60;
    }
    
    // 扣除午休时间（12:00-14:00）
    const lunchStart = 12 * 60;
    const lunchEnd = 14 * 60;
    
    if (startMinutes < lunchEnd && endMinutes > lunchStart) {
        const lunchOverlap = Math.min(endMinutes, lunchEnd) - Math.max(startMinutes, lunchStart);
        totalMinutes -= Math.max(0, lunchOverlap);
    }
    
    return totalMinutes / 60;
}

/**
 * 计算加班天数（根据规则）
 */
export function calculateOvertimeDaysByRules(startDate, startTime, endDate, endTime) {
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    
    if (end < start) {
        return 0;
    }
    
    const isSameDay = startDate === endDate;
    
    if (isSameDay) {
        return calculateSingleDayOvertime(startTime, endTime);
    } else {
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const daysDiff = Math.floor((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
        
        const startDayHours = calculateOvertimeHours(startTime, '23:59');
        const endDayHours = calculateOvertimeHours('00:00', endTime);
        
        const totalDays = daysDiff - 1 + (startDayHours / 8) + (endDayHours / 8);
        return Math.round(totalDays * 2) / 2;
    }
}

/**
 * 计算单天加班天数
 */
export function calculateSingleDayOvertime(startTime, endTime) {
    const hours = calculateOvertimeHours(startTime, endTime);
    return Math.round((hours / 8) * 2) / 2; // 保留0.5的精度
}

/**
 * 计算加班小时数
 */
function calculateOvertimeHours(startTime, endTime) {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    let totalMinutes = endMinutes - startMinutes;
    
    if (totalMinutes < 0) {
        totalMinutes += 24 * 60;
    }
    
    return totalMinutes / 60;
}

/**
 * 计算时间重叠
 */
export function calculateTimeOverlap(start1, end1, start2, end2) {
    const s1 = timeToMinutes(start1);
    const e1 = timeToMinutes(end1);
    const s2 = timeToMinutes(start2);
    const e2 = timeToMinutes(end2);
    
    const overlapStart = Math.max(s1, s2);
    const overlapEnd = Math.min(e1, e2);
    
    if (overlapStart < overlapEnd) {
        return overlapEnd - overlapStart;
    }
    return 0;
}

/**
 * 时间转分钟数
 */
function timeToMinutes(time) {
    const [hour, min] = time.split(':').map(Number);
    return hour * 60 + min;
}

