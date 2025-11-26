/**
 * 日期工具模块
 * 提供日期处理相关功能
 */

/**
 * 获取东八区（UTC+8）的当前日期字符串（YYYY-MM-DD格式）
 */
export function getCSTDate(date = null) {
    if (!date) {
        const now = new Date();
        // 获取东八区时间（UTC+8）
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const cst = new Date(utc + (8 * 3600000)); // 东八区 = UTC+8
        const year = cst.getFullYear();
        const month = String(cst.getMonth() + 1).padStart(2, '0');
        const day = String(cst.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return date;
}

/**
 * 本地工作日判断（后备方案）
 */
export function localWorkdayCheck(dateStr) {
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

