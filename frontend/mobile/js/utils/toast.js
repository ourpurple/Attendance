/**
 * Toast提示工具模块
 * 提供消息提示功能
 */

/**
 * 显示Toast提示
 * @param {string} message - 提示消息
 * @param {string} type - 类型: success, error, warning, info
 * @param {object} options - 选项
 * @returns {Promise<boolean>} 用户点击确定返回true
 */
export function showToast(message, type = 'info', options = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'toast-overlay';
        
        const toast = document.createElement('div');
        toast.className = 'custom-toast';
        
        const iconMap = {
            success: { icon: '✓', class: 'success' },
            error: { icon: '✕', class: 'error' },
            warning: { icon: '⚠', class: 'warning' },
            info: { icon: 'ℹ', class: 'info' }
        };
        
        const iconInfo = iconMap[type] || iconMap.info;
        
        const actions = options.confirm ? `
            <div class="toast-actions">
                <button class="btn btn-secondary" onclick="window._closeToast(false)">${options.cancelText || '取消'}</button>
                <button class="btn ${options.danger ? 'btn-danger' : 'btn-primary'}" onclick="window._closeToast(true)">${options.confirmText || '确定'}</button>
            </div>
        ` : `
            <div class="toast-actions">
                <button class="btn btn-primary" onclick="window._closeToast(true)">${options.buttonText || '确定'}</button>
            </div>
        `;
        
        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-icon ${iconInfo.class}">${iconInfo.icon}</div>
                <div class="toast-message">${message}</div>
                ${actions}
            </div>
        `;
        
        overlay.appendChild(toast);
        document.body.appendChild(overlay);
        
        // 存储resolve函数到全局，供closeToast使用
        window._toastResolve = resolve;
        
        // 定义关闭函数
        window._closeToast = (result) => {
            closeToast(overlay, result, resolve);
        };
        
        // 自动关闭（如果设置了autoClose）
        if (options.autoClose !== false && !options.confirm) {
            const timeout = options.timeout || 2000;
            setTimeout(() => {
                if (overlay.parentNode) {
                    window._closeToast(true);
                }
            }, timeout);
        }
    });
}

/**
 * 关闭Toast
 */
function closeToast(overlay, result, resolve) {
    if (!overlay || !overlay.parentNode) return;
    
    overlay.style.animation = 'fadeOut 0.2s ease-out';
    const toast = overlay.querySelector('.custom-toast');
    if (toast) {
        toast.style.animation = 'toastSlideOut 0.2s ease-out';
    }
    
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        if (window._toastResolve) {
            window._toastResolve(result);
            window._toastResolve = null;
        }
        window._closeToast = null;
    }, 200);
}

