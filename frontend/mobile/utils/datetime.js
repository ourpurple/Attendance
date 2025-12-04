/**
 * 前端时区处理工具
 * 统一处理时间显示和转换
 */

/**
 * 时区配置
 */
const TIMEZONE_CONFIG = {
  // 默认时区偏移（中国标准时间 UTC+8）
  DEFAULT_OFFSET: 8 * 60, // 分钟
  
  // 日期格式
  DATE_FORMAT: 'YYYY-MM-DD',
  TIME_FORMAT: 'HH:mm:ss',
  DATETIME_FORMAT: 'YYYY-MM-DD HH:mm:ss',
  
  // 显示格式
  DISPLAY_DATE_FORMAT: 'YYYY年MM月DD日',
  DISPLAY_TIME_FORMAT: 'HH:mm',
  DISPLAY_DATETIME_FORMAT: 'YYYY年MM月DD日 HH:mm'
};

/**
 * 格式化日期时间
 * @param {Date|string} datetime - 日期时间对象或ISO字符串
 * @param {string} format - 格式字符串
 * @returns {string} 格式化后的字符串
 */
function formatDateTime(datetime, format = TIMEZONE_CONFIG.DATETIME_FORMAT) {
  if (!datetime) return '';
  
  const date = typeof datetime === 'string' ? new Date(datetime) : datetime;
  
  if (isNaN(date.getTime())) {
    console.error('无效的日期时间:', datetime);
    return '';
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
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
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(date) {
  return formatDateTime(date, TIMEZONE_CONFIG.DATE_FORMAT);
}

/**
 * 格式化时间
 * @param {Date|string} time - 时间对象或ISO字符串
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(time) {
  return formatDateTime(time, TIMEZONE_CONFIG.TIME_FORMAT);
}

/**
 * 格式化为显示用的日期时间
 * @param {Date|string} datetime - 日期时间对象或ISO字符串
 * @returns {string} 格式化后的字符串
 */
function formatDisplayDateTime(datetime) {
  return formatDateTime(datetime, TIMEZONE_CONFIG.DISPLAY_DATETIME_FORMAT);
}

/**
 * 格式化为显示用的日期
 * @param {Date|string} date - 日期对象或ISO字符串
 * @returns {string} 格式化后的日期字符串
 */
function formatDisplayDate(date) {
  return formatDateTime(date, TIMEZONE_CONFIG.DISPLAY_DATE_FORMAT);
}

/**
 * 格式化为显示用的时间
 * @param {Date|string} time - 时间对象或ISO字符串
 * @returns {string} 格式化后的时间字符串
 */
function formatDisplayTime(time) {
  return formatDateTime(time, TIMEZONE_CONFIG.DISPLAY_TIME_FORMAT);
}

/**
 * 解析ISO日期时间字符串为本地Date对象
 * @param {string} isoString - ISO格式的日期时间字符串
 * @returns {Date} Date对象
 */
function parseISOString(isoString) {
  if (!isoString) return null;
  
  const date = new Date(isoString);
  
  if (isNaN(date.getTime())) {
    console.error('无效的ISO字符串:', isoString);
    return null;
  }
  
  return date;
}

/**
 * 将本地Date对象转换为ISO字符串（用于发送给服务器）
 * @param {Date} date - Date对象
 * @returns {string} ISO格式字符串
 */
function toISOString(date) {
  if (!date) return '';
  
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  
  if (isNaN(date.getTime())) {
    console.error('无效的日期对象:', date);
    return '';
  }
  
  return date.toISOString();
}

/**
 * 获取当前日期时间
 * @returns {Date} 当前Date对象
 */
function now() {
  return new Date();
}

/**
 * 获取今天的日期（00:00:00）
 * @returns {Date} 今天的Date对象
 */
function today() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * 计算两个日期之间的天数差
 * @param {Date|string} startDate - 开始日期
 * @param {Date|string} endDate - 结束日期
 * @returns {number} 天数差
 */
function daysBetween(startDate, endDate) {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * 添加天数
 * @param {Date|string} date - 日期
 * @param {number} days - 要添加的天数
 * @returns {Date} 新的Date对象
 */
function addDays(date, days) {
  const result = typeof date === 'string' ? new Date(date) : new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * 添加小时
 * @param {Date|string} date - 日期时间
 * @param {number} hours - 要添加的小时数
 * @returns {Date} 新的Date对象
 */
function addHours(date, hours) {
  const result = typeof date === 'string' ? new Date(date) : new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

/**
 * 判断是否是今天
 * @param {Date|string} date - 日期
 * @returns {boolean} 是否是今天
 */
function isToday(date) {
  const checkDate = typeof date === 'string' ? new Date(date) : date;
  const todayDate = new Date();
  
  return checkDate.getFullYear() === todayDate.getFullYear() &&
         checkDate.getMonth() === todayDate.getMonth() &&
         checkDate.getDate() === todayDate.getDate();
}

/**
 * 判断是否是工作日（周一到周五）
 * @param {Date|string} date - 日期
 * @returns {boolean} 是否是工作日
 */
function isWeekday(date) {
  const checkDate = typeof date === 'string' ? new Date(date) : date;
  const day = checkDate.getDay();
  return day >= 1 && day <= 5;
}

/**
 * 判断是否是周末（周六或周日）
 * @param {Date|string} date - 日期
 * @returns {boolean} 是否是周末
 */
function isWeekend(date) {
  return !isWeekday(date);
}

/**
 * 获取相对时间描述（如"刚刚"、"5分钟前"等）
 * @param {Date|string} datetime - 日期时间
 * @returns {string} 相对时间描述
 */
function getRelativeTime(datetime) {
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
    return formatDisplayDate(date);
  }
}

/**
 * 导出所有函数
 */
export default {
  // 配置
  TIMEZONE_CONFIG,
  
  // 格式化函数
  formatDateTime,
  formatDate,
  formatTime,
  formatDisplayDateTime,
  formatDisplayDate,
  formatDisplayTime,
  
  // 解析和转换
  parseISOString,
  toISOString,
  
  // 获取当前时间
  now,
  today,
  
  // 日期计算
  daysBetween,
  addDays,
  addHours,
  
  // 判断函数
  isToday,
  isWeekday,
  isWeekend,
  
  // 相对时间
  getRelativeTime
};
