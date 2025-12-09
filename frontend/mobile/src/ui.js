/**
 * UI组件模块
 * 包含Toast、Modal、InputDialog等UI组件
 */

/**
 * 显示Toast提示
 * @param {string} message - 提示消息
 * @param {string} type - 类型: success, error, warning, info
 * @param {object} options - 选项
 * @returns {Promise<boolean>} - 用户选择结果
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
                <button class="btn btn-secondary" data-action="cancel">${options.cancelText || '取消'}</button>
                <button class="btn ${options.danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${options.confirmText || '确定'}</button>
            </div>
        ` : `
            <div class="toast-actions">
                <button class="btn btn-primary" data-action="ok">${options.buttonText || '确定'}</button>
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
        
        // 绑定按钮事件
        const buttons = toast.querySelectorAll('button');
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const action = button.getAttribute('data-action');
                const result = action === 'confirm' || action === 'ok';
                closeToast(overlay, result, resolve);
            });
        });
        
        // 自动关闭（如果设置了autoClose）
        if (options.autoClose !== false && !options.confirm) {
            const timeout = options.timeout || 2000;
            setTimeout(() => {
                if (overlay.parentNode) {
                    closeToast(overlay, true, resolve);
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
        if (resolve) {
            resolve(result);
        }
    }, 200);
}

/**
 * 显示输入对话框
 * @param {string} title - 标题
 * @param {string} placeholder - 占位符
 * @param {boolean} required - 是否必填
 * @returns {Promise<string|null>} - 用户输入的值或null
 */
export function showInputDialog(title, placeholder, required = false) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'toast-overlay';
        
        const dialog = document.createElement('div');
        dialog.className = 'custom-toast input-dialog';
        
        const inputId = `input-dialog-${Date.now()}`;
        
        dialog.innerHTML = `
            <div class="toast-content">
                <div class="input-dialog-title">${title}</div>
                <textarea 
                    id="${inputId}" 
                    class="approval-input" 
                    placeholder="${placeholder}" 
                    rows="4"
                ></textarea>
                <div class="toast-actions input-dialog-actions">
                    <button class="btn btn-secondary" data-action="cancel">取消</button>
                    <button class="btn btn-primary" data-action="confirm">确定</button>
                </div>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        const input = document.getElementById(inputId);
        
        // 绑定按钮事件
        const buttons = dialog.querySelectorAll('button');
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const action = button.getAttribute('data-action');
                if (action === 'cancel') {
                    closeInputDialog(overlay, null, resolve);
                } else {
                    const value = input.value;
                    if (required && (!value || !value.trim())) {
                        // 显示错误提示
                        input.style.borderColor = 'var(--danger-color)';
                        input.style.boxShadow = '0 0 0 3px rgba(255, 59, 48, 0.1)';
                        setTimeout(() => {
                            input.style.borderColor = 'var(--border-color)';
                            input.style.boxShadow = 'none';
                        }, 2000);
                        return;
                    }
                    closeInputDialog(overlay, value, resolve);
                }
            });
        });
        
        // 聚焦输入框
        setTimeout(() => {
            if (input) {
                input.focus();
            }
        }, 100);
        
        // 监听ESC键关闭弹窗
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeInputDialog(overlay, null, resolve);
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                const value = input.value;
                if (!required || value.trim()) {
                    closeInputDialog(overlay, value, resolve);
                }
            }
        };
        
        document.addEventListener('keydown', handleKeyDown);
        overlay._keyHandler = handleKeyDown;
    });
}

/**
 * 关闭输入对话框
 */
function closeInputDialog(overlay, value, resolve) {
    if (!overlay || !overlay.parentNode) return;
    
    overlay.style.animation = 'fadeOut 0.2s ease-out';
    const dialog = overlay.querySelector('.input-dialog');
    if (dialog) {
        dialog.style.animation = 'toastSlideOut 0.2s ease-out';
    }
    
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        if (overlay._keyHandler) {
            document.removeEventListener('keydown', overlay._keyHandler);
        }
        if (resolve) {
            resolve(value);
        }
    }, 200);
}

/**
 * 显示加载中
 */
export function showLoading(message = '加载中...') {
    const existing = document.querySelector('.loading-overlay');
    if (existing) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <div class="loading-message">${message}</div>
        </div>
    `;
    document.body.appendChild(overlay);
}

/**
 * 隐藏加载中
 */
export function hideLoading() {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) {
        overlay.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 200);
    }
}

/**
 * 初始化UI动画样式
 */
export function initUIStyles() {
    if (document.getElementById('ui-animations')) return;
    
    const style = document.createElement('style');
    style.id = 'ui-animations';
    style.textContent = `
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
        @keyframes toastSlideOut {
            from {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
            to {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.9);
            }
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        
        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }
        
        .loading-spinner {
            background: white;
            padding: 30px;
            border-radius: 12px;
            text-align: center;
        }
        
        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid var(--primary-color, #007AFF);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 15px;
        }
        
        .loading-message {
            color: #333;
            font-size: 14px;
        }
    `;
    document.head.appendChild(style);
}

// 自动初始化样式
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUIStyles);
    } else {
        initUIStyles();
    }
}

export default {
    showToast,
    showInputDialog,
    showLoading,
    hideLoading,
    initUIStyles
};
