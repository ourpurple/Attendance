/**
 * 格式化工具模块
 * 提供各种数据格式化函数
 */

/**
 * 格式化请假日期时间
 */
export function formatLeaveDateTime(start, end) {
    if (!start) return { date: '', time: '' };
    
    const normalizeDateStr = (dateStr) => {
        if (!dateStr) return '';
        if (dateStr.includes('T')) {
            let normalized = dateStr.split('.')[0];
            if (normalized.includes('+') || normalized.includes('Z')) {
                normalized = normalized.split('+')[0].split('Z')[0];
            }
            return normalized;
        }
        return dateStr + 'T00:00:00';
    };
    
    const normalizedStartStr = normalizeDateStr(start);
    const normalizedEndStr = normalizeDateStr(end || start);
    
    const parseDateTime = (dateStr) => {
        if (!dateStr) return null;
        
        let datePart = '';
        let timePart = '';
        
        if (dateStr.includes('T')) {
            const parts = dateStr.split('T');
            datePart = parts[0];
            timePart = parts[1] || '00:00:00';
        } else if (dateStr.includes(' ')) {
            const parts = dateStr.split(' ');
            datePart = parts[0];
            timePart = parts[1] || '00:00:00';
        } else {
            datePart = dateStr;
            timePart = '00:00:00';
        }
        
        if (timePart.includes('+') || timePart.includes('Z')) {
            timePart = timePart.split('+')[0].split('Z')[0];
        }
        if (timePart.includes('.')) {
            timePart = timePart.split('.')[0];
        }
        
        const dateParts = datePart.split('-');
        const timeParts = timePart.split(':');
        
        if (dateParts.length !== 3) return null;
        if (timeParts.length < 2) return null;
        
        return {
            year: parseInt(dateParts[0]),
            month: parseInt(dateParts[1]),
            day: parseInt(dateParts[2]),
            hours: parseInt(timeParts[0] || '0'),
            minutes: parseInt(timeParts[1] || '0')
        };
    };
    
    const startParts = parseDateTime(normalizedStartStr);
    const endParts = parseDateTime(normalizedEndStr);
    
    if (!startParts || !endParts) {
        return { date: '', time: '' };
    }
    
    const startMonth = String(startParts.month).padStart(2, '0');
    const startDay = String(startParts.day).padStart(2, '0');
    const startHours = String(startParts.hours).padStart(2, '0');
    const startMinutes = String(startParts.minutes).padStart(2, '0');
    
    const endMonth = String(endParts.month).padStart(2, '0');
    const endDay = String(endParts.day).padStart(2, '0');
    const endHours = String(endParts.hours).padStart(2, '0');
    const endMinutes = String(endParts.minutes).padStart(2, '0');
    
    const isSameDay = startParts.year === endParts.year && 
                      startParts.month === endParts.month && 
                      startParts.day === endParts.day;
    
    let dateText = '';
    let timeText = '';
    
    if (isSameDay) {
        dateText = `${startMonth}月${startDay}日`;
        timeText = `${startHours}:${startMinutes}-${endHours}:${endMinutes}`;
    } else {
        dateText = `${startMonth}月${startDay}日 ${startHours}:${startMinutes}`;
        timeText = `${endMonth}月${endDay}日 ${endHours}:${endMinutes}`;
    }
    
    return { date: dateText, time: timeText };
}

/**
 * 格式化请假日期（向后兼容）
 */
export function formatLeaveDate(start, end) {
    const dateTimeInfo = formatLeaveDateTime(start, end);
    return dateTimeInfo.date ? `${dateTimeInfo.date} ${dateTimeInfo.time}` : '';
}

/**
 * 格式化请假范围（向后兼容）
 */
export function formatLeaveRange(start, end, leaveDays) {
    if (!start) return '请假';
    const dateInfo = formatLeaveDate(start, end);
    const days = leaveDays !== undefined && leaveDays !== null ? leaveDays : 1;
    return dateInfo ? `${dateInfo} 共${days}天` : `共${days}天`;
}

/**
 * 格式化完整日期
 */
export function formatFullDate(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}月${day}日`;
}

/**
 * 格式化加班日期时间
 */
export function formatOvertimeDateTime(start, end) {
    if (!start) return { date: '', time: '' };
    
    const normalizeDateStr = (dateStr) => {
        if (!dateStr) return '';
        if (dateStr.includes('T')) {
            let normalized = dateStr.split('.')[0];
            if (normalized.includes('+') || normalized.includes('Z')) {
                normalized = normalized.split('+')[0].split('Z')[0];
            }
            return normalized;
        }
        return dateStr + 'T00:00:00';
    };
    
    const normalizedStartStr = normalizeDateStr(start);
    const normalizedEndStr = normalizeDateStr(end || start);
    
    const parseDateTime = (dateStr) => {
        if (!dateStr) return null;
        
        let datePart = '';
        let timePart = '';
        
        if (dateStr.includes('T')) {
            const parts = dateStr.split('T');
            datePart = parts[0];
            timePart = parts[1] || '00:00:00';
        } else if (dateStr.includes(' ')) {
            const parts = dateStr.split(' ');
            datePart = parts[0];
            timePart = parts[1] || '00:00:00';
        } else {
            datePart = dateStr;
            timePart = '00:00:00';
        }
        
        if (timePart.includes('+') || timePart.includes('Z')) {
            timePart = timePart.split('+')[0].split('Z')[0];
        }
        if (timePart.includes('.')) {
            timePart = timePart.split('.')[0];
        }
        
        const dateParts = datePart.split('-');
        const timeParts = timePart.split(':');
        
        if (dateParts.length !== 3) return null;
        if (timeParts.length < 2) return null;
        
        return {
            year: parseInt(dateParts[0]),
            month: parseInt(dateParts[1]),
            day: parseInt(dateParts[2]),
            hours: parseInt(timeParts[0] || '0'),
            minutes: parseInt(timeParts[1] || '0')
        };
    };
    
    const startParts = parseDateTime(normalizedStartStr);
    const endParts = parseDateTime(normalizedEndStr);
    
    if (!startParts || !endParts) {
        return { date: '', time: '' };
    }
    
    const startMonth = String(startParts.month).padStart(2, '0');
    const startDay = String(startParts.day).padStart(2, '0');
    const startHours = String(startParts.hours).padStart(2, '0');
    const startMinutes = String(startParts.minutes).padStart(2, '0');
    
    const endMonth = String(endParts.month).padStart(2, '0');
    const endDay = String(endParts.day).padStart(2, '0');
    const endHours = String(endParts.hours).padStart(2, '0');
    const endMinutes = String(endParts.minutes).padStart(2, '0');
    
    const isSameDay = startParts.year === endParts.year && 
                      startParts.month === endParts.month && 
                      startParts.day === endParts.day;
    
    let dateText = '';
    let timeText = '';
    
    if (isSameDay) {
        dateText = `${startMonth}月${startDay}日`;
        timeText = `${startHours}:${startMinutes}-${endHours}:${endMinutes}`;
    } else {
        dateText = `${startMonth}月${startDay}日 ${startHours}:${startMinutes}`;
        timeText = `${endMonth}月${endDay}日 ${endHours}:${endMinutes}`;
    }
    
    return { date: dateText, time: timeText };
}

/**
 * 格式化加班日期（向后兼容）
 */
export function formatOvertimeDate(start, end) {
    const dateTimeInfo = formatOvertimeDateTime(start, end);
    return dateTimeInfo.date ? `${dateTimeInfo.date} ${dateTimeInfo.time}` : '';
}

/**
 * 格式化加班范围（向后兼容）
 */
export function formatOvertimeRange(start, end, days) {
    if (!start) return '加班';
    const dateInfo = formatOvertimeDate(start, end);
    const daysText = days !== undefined && days !== null ? days : 0.5;
    return dateInfo ? `${dateInfo} 共${daysText}天` : `共${daysText}天`;
}

