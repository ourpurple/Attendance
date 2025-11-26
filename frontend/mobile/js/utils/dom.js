/**
 * DOM工具模块
 * 提供DOM操作相关工具函数
 */

/**
 * 修复用户名输入框键盘问题（iOS）
 */
export function fixUsernameInputKeyboard() {
    const usernameInput = document.getElementById('username');
    if (!usernameInput) return;
    
    // 监听focus事件，确保输入框类型正确
    usernameInput.addEventListener('focus', function() {
        this.setAttribute('type', 'text');
        this.setAttribute('inputmode', 'text');
        this.setAttribute('autocomplete', 'off');
    }, { passive: true });
}

/**
 * 设置默认概览日期
 */
export function setDefaultOverviewDate() {
    const overviewDateInput = document.getElementById('overview-date');
    if (!overviewDateInput) return;
    
    if (!overviewDateInput.value) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        overviewDateInput.value = `${year}-${month}-${day}`;
    }
}

/**
 * 关闭表单模态框
 */
export function closeFormModal() {
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
        modalContainer.style.display = 'none';
        modalContainer.innerHTML = '';
    }
}

// 导出到全局
window.closeFormModal = closeFormModal;
window.fixUsernameInputKeyboard = fixUsernameInputKeyboard;
window.setDefaultOverviewDate = setDefaultOverviewDate;

