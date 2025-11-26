/**
 * 时间格式化工具模块
 */

/**
 * 格式化日期（YYYY-MM-DD）
 */
export function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 格式化时间（HH:MM）
 */
export function formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * 格式化日期时间（YYYY-MM-DD HH:MM）
 */
export function formatDateTime(dateStr) {
    if (!dateStr) return '';
    return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

/**
 * 格式化时间范围
 */
export function formatTimeRange(startStr, endStr) {
    if (!startStr || !endStr) return '';
    const start = formatTime(startStr);
    const end = formatTime(endStr);
    return `${start} - ${end}`;
}

/**
 * 更新时钟显示
 */
export function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const dateStr = now.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });

    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('current-date');
    
    if (timeEl) timeEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;
}

/**
 * 启动时钟更新
 */
export function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

