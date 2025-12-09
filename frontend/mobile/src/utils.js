/**
 * 工具函数模块
 * 包含常用的工具函数
 */

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} - 防抖后的函数
 */
export function debounce(func, delay = 300) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} - 节流后的函数
 */
export function throttle(func, delay = 1000) {
    let lastTime = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastTime >= delay) {
            lastTime = now;
            func.apply(this, args);
        }
    };
}

/**
 * 格式化日期时间
 * @param {Date|string} date - 日期对象或ISO字符串
 * @param {string} format - 格式字符串
 * @returns {string} - 格式化后的字符串
 */
export function formatDateTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
    if (!date) return '';
    
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

/**
 * 格式化日期
 * @param {Date|string} date - 日期对象或ISO字符串
 * @returns {string} - 格式化后的日期字符串
 */
export function formatDate(date) {
    return formatDateTime(date, 'YYYY-MM-DD');
}

/**
 * 格式化时间
 * @param {Date|string} time - 时间对象或ISO字符串
 * @returns {string} - 格式化后的时间字符串
 */
export function formatTime(time) {
    return formatDateTime(time, 'HH:mm:ss');
}

/**
 * 获取相对时间描述
 * @param {Date|string} datetime - 日期时间
 * @returns {string} - 相对时间描述
 */
export function getRelativeTime(datetime) {
    const date = typeof datetime === 'string' ? new Date(datetime) : datetime;
    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSeconds < 60) {
        return '刚刚';
    } else if (diffMinutes < 60) {
        return `${diffMinutes}分钟前`;
    } else if (diffHours < 24) {
        return `${diffHours}小时前`;
    } else if (diffDays < 7) {
        return `${diffDays}天前`;
    } else {
        return formatDate(date);
    }
}

/**
 * 深拷贝对象
 * @param {any} obj - 要拷贝的对象
 * @returns {any} - 拷贝后的对象
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    
    if (obj instanceof Array) {
        return obj.map(item => deepClone(item));
    }
    
    if (obj instanceof Object) {
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
}

/**
 * 生成唯一ID
 * @returns {string} - 唯一ID
 */
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 延迟执行
 * @param {number} ms - 延迟时间（毫秒）
 * @returns {Promise} - Promise对象
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 安全的JSON解析
 * @param {string} str - JSON字符串
 * @param {any} defaultValue - 默认值
 * @returns {any} - 解析后的对象或默认值
 */
export function safeJSONParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch (error) {
        console.error('JSON parse error:', error);
        return defaultValue;
    }
}

/**
 * 获取URL参数
 * @param {string} name - 参数名
 * @returns {string|null} - 参数值
 */
export function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

/**
 * 设置URL参数
 * @param {string} name - 参数名
 * @param {string} value - 参数值
 */
export function setUrlParam(name, value) {
    const url = new URL(window.location.href);
    url.searchParams.set(name, value);
    window.history.pushState({}, '', url);
}

/**
 * 验证手机号
 * @param {string} phone - 手机号
 * @returns {boolean} - 是否有效
 */
export function isValidPhone(phone) {
    return /^1[3-9]\d{9}$/.test(phone);
}

/**
 * 验证邮箱
 * @param {string} email - 邮箱
 * @returns {boolean} - 是否有效
 */
export function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 截断文本
 * @param {string} text - 文本
 * @param {number} maxLength - 最大长度
 * @param {string} suffix - 后缀
 * @returns {string} - 截断后的文本
 */
export function truncate(text, maxLength = 50, suffix = '...') {
    if (!text || text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength) + suffix;
}

/**
 * 转义HTML
 * @param {string} html - HTML字符串
 * @returns {string} - 转义后的字符串
 */
export function escapeHtml(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
}

/**
 * 计算两个日期之间的天数
 * @param {Date|string} startDate - 开始日期
 * @param {Date|string} endDate - 结束日期
 * @returns {number} - 天数
 */
export function daysBetween(startDate, endDate) {
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
    
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

export default {
    debounce,
    throttle,
    formatDateTime,
    formatDate,
    formatTime,
    getRelativeTime,
    deepClone,
    generateId,
    sleep,
    safeJSONParse,
    getUrlParam,
    setUrlParam,
    isValidPhone,
    isValidEmail,
    truncate,
    escapeHtml,
    daysBetween
};
