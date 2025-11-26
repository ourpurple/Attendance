/**
 * 对话框工具模块
 * 提供输入对话框功能
 */

/**
 * 显示输入对话框
 * @param {string} title - 对话框标题
 * @param {string} placeholder - 输入框占位符
 * @param {boolean} required - 是否必填
 * @returns {Promise<string|null>} 用户输入的值，取消返回null
 */
export function showInputDialog(title, placeholder, required = false) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'toast-overlay';
        
        const dialog = document.createElement('div');
        dialog.className = 'custom-toast input-dialog';
        
        const inputId = 'approval-comment-input';
        
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
                    <button class="btn btn-secondary" onclick="window._closeInputDialog(null)">取消</button>
                    <button class="btn btn-primary" onclick="window._closeInputDialog(document.getElementById('${inputId}').value)">确定</button>
                </div>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // 存储resolve函数到全局
        window._inputDialogResolve = resolve;
        window._inputDialogRequired = required;
        
        // 定义关闭函数
        window._closeInputDialog = (value) => {
            closeInputDialog(overlay, value, resolve, required);
        };
        
        // 聚焦输入框
        setTimeout(() => {
            const input = document.getElementById(inputId);
            if (input) {
                input.focus();
            }
        }, 100);
        
        // 监听ESC键关闭弹窗
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                window._closeInputDialog(null);
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                const value = document.getElementById(inputId).value;
                if (!required || value.trim()) {
                    window._closeInputDialog(value);
                }
            }
        };
        
        document.addEventListener('keydown', handleKeyDown);
        window._inputDialogKeyHandler = handleKeyDown;
    });
}

/**
 * 关闭输入对话框
 */
function closeInputDialog(overlay, value, resolve, required) {
    if (!overlay || !overlay.parentNode) return;
    
    // 如果 value 为 null，说明用户点击了取消，直接关闭弹窗
    if (value === null) {
        overlay.style.animation = 'fadeOut 0.2s ease-out';
        const dialog = overlay.querySelector('.input-dialog');
        if (dialog) {
            dialog.style.animation = 'toastSlideOut 0.2s ease-out';
        }
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            if (window._inputDialogResolve) {
                window._inputDialogResolve(null);
                window._inputDialogResolve = null;
            }
            if (window._inputDialogKeyHandler) {
                document.removeEventListener('keydown', window._inputDialogKeyHandler);
                window._inputDialogKeyHandler = null;
            }
            window._closeInputDialog = null;
        }, 200);
        return;
    }
    
    // 验证必填项（仅在点击确定时验证）
    if (required && (!value || !value.trim())) {
        // 显示错误提示
        const input = overlay.querySelector('textarea');
        if (input) {
            input.style.borderColor = 'var(--danger-color)';
            input.style.boxShadow = '0 0 0 3px rgba(255, 59, 48, 0.1)';
            setTimeout(() => {
                input.style.borderColor = 'var(--border-color)';
                input.style.boxShadow = 'none';
            }, 2000);
        }
        return;
    }
    
    // 关闭弹窗并返回输入值
    overlay.style.animation = 'fadeOut 0.2s ease-out';
    const dialog = overlay.querySelector('.input-dialog');
    if (dialog) {
        dialog.style.animation = 'toastSlideOut 0.2s ease-out';
    }
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        if (window._inputDialogResolve) {
            window._inputDialogResolve(value);
            window._inputDialogResolve = null;
        }
        if (window._inputDialogKeyHandler) {
            document.removeEventListener('keydown', window._inputDialogKeyHandler);
            window._inputDialogKeyHandler = null;
        }
        window._closeInputDialog = null;
    }, 200);
}

