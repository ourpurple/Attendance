// API基础URL - 自动检测当前访问的域名
// 如果当前页面是 http://192.168.77.101:8000/mobile/index.html
// 则 API URL 为 http://192.168.77.101:8000/api
function getApiBaseUrl() {
    // 获取当前页面的协议和主机
    const protocol = window.location.protocol; // http: 或 https:
    const host = window.location.host; // hostname:port
    return `${protocol}//${host}/api`;
}

const API_BASE_URL = getApiBaseUrl();

// 全局状态
let currentUser = null;
let token = null;
let currentLocation = null;
let leaveTypesCache = [];

// ==================== 自定义弹窗工具函数 ====================
// 自定义输入对话框
function showInputDialog(title, placeholder, required = false) {
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
                    <button class="btn btn-secondary" onclick="closeInputDialog(null)">取消</button>
                    <button class="btn btn-primary" onclick="closeInputDialog(document.getElementById('${inputId}').value)">确定</button>
                </div>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // 存储resolve函数到全局
        window._inputDialogResolve = resolve;
        window._inputDialogRequired = required;
        
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
                closeInputDialog(null);
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                const value = document.getElementById(inputId).value;
                if (!required || value.trim()) {
                    closeInputDialog(value);
                }
            }
        };
        
        document.addEventListener('keydown', handleKeyDown);
        window._inputDialogKeyHandler = handleKeyDown;
    });
}

function closeInputDialog(value) {
    const overlay = document.querySelector('.toast-overlay');
    if (overlay) {
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
            }, 200);
            return;
        }
        
        // 验证必填项（仅在点击确定时验证）
        if (window._inputDialogRequired && (!value || !value.trim())) {
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
        }, 200);
    }
}

function showToast(message, type = 'info', options = {}) {
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
                <button class="btn btn-secondary" onclick="closeToast(false)">${options.cancelText || '取消'}</button>
                <button class="btn ${options.danger ? 'btn-danger' : 'btn-primary'}" onclick="closeToast(true)">${options.confirmText || '确定'}</button>
            </div>
        ` : `
            <div class="toast-actions">
                <button class="btn btn-primary" onclick="closeToast(true)">${options.buttonText || '确定'}</button>
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
        
        // 自动关闭（如果设置了autoClose）
        if (options.autoClose !== false && !options.confirm) {
            const timeout = options.timeout || 2000;
            setTimeout(() => {
                if (overlay.parentNode) {
                    closeToast(true);
                }
            }, timeout);
        }
    });
}

function closeToast(result) {
    const overlay = document.querySelector('.toast-overlay');
    if (overlay) {
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
        }, 200);
    }
}

// 添加CSS动画
if (!document.getElementById('toast-animations')) {
    const style = document.createElement('style');
    style.id = 'toast-animations';
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
    `;
    document.head.appendChild(style);
}

// 工具函数
function getToken() {
    if (!token) {
        token = localStorage.getItem('token');
    }
    return token;
}

function setToken(newToken) {
    token = newToken;
    localStorage.setItem('token', newToken);
}

function clearToken() {
    token = null;
    localStorage.removeItem('token');
}

// API请求封装
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    const authToken = getToken();
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 401) {
            clearToken();
            showPage('login');
            throw new Error('未授权，请重新登录');
        }

        if (response.status === 204) {
            return null;
        }

        if (!response.ok) {
            const error = await response.json();
            let errorMessage = '请求失败';
            
            // 处理不同格式的错误信息
            if (typeof error.detail === 'string') {
                errorMessage = error.detail;
            } else if (Array.isArray(error.detail)) {
                // 验证错误通常是数组格式
                errorMessage = error.detail.map(err => err.msg || JSON.stringify(err)).join(', ');
            } else if (error.detail) {
                errorMessage = JSON.stringify(error.detail);
            }
            
            throw new Error(errorMessage);
        }

        return await response.json();
    } catch (error) {
        console.error('API请求错误:', error);
        
        // 处理网络错误
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            const errorMsg = `网络连接失败，请检查：
1. 服务器是否正在运行
2. 手机和电脑是否在同一网络
3. 防火墙是否阻止了连接
4. 访问地址是否正确：${API_BASE_URL}`;
            throw new Error(errorMsg);
        }
        
        throw error;
    }
}

// 页面切换
function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    if (pageName === 'login') {
        document.getElementById('login-page').classList.add('active');
        // 显示登录页面时，重新修复用户名输入框
        setTimeout(fixUsernameInputKeyboard, 100);
    } else {
        document.getElementById('main-page').classList.add('active');
    }
}

// 内容区切换
async function showSection(sectionName) {
    // 权限检查：审批页面需要审批权限
    if (sectionName === 'approval') {
        const hasApprovalPermission = currentUser && ['admin', 'general_manager', 'vice_president', 'department_head'].includes(currentUser.role);
        if (!hasApprovalPermission) {
            await showToast('您没有审批权限', 'warning');
            return;
        }
    }
    
    // 权限检查：出勤情况页面需要查看权限
    if (sectionName === 'attendance-overview') {
        try {
            const permission = await apiRequest('/attendance-viewers/check-permission');
            if (!permission.has_permission) {
                await showToast('您没有权限查看出勤情况', 'warning');
                return;
            }
        } catch (error) {
            await showToast('权限检查失败', 'error');
            return;
        }
    }
    
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${sectionName}-content`).classList.add('active');

    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // 更新底部导航激活状态
    const navMap = {
        'home': 0,
        'attendance': 1,
        'approval': 2,
        'stats': 3
    };
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    if (navMap[sectionName] !== undefined) {
        navItems[navMap[sectionName]].classList.add('active');
    }

    // 加载对应数据
    loadSectionData(sectionName);
}

function loadSectionData(section) {
    switch (section) {
        case 'home':
            loadHomeData();
            break;
        case 'attendance':
            loadAttendanceByMonth();
            break;
        case 'attendance-overview':
            loadAttendanceOverview();
            break;
        case 'leave':
            loadMyLeaveApplications();
            break;
        case 'overtime':
            loadMyOvertimeApplications();
            break;
        case 'approval':
            loadPendingApprovals();
            break;
        case 'stats':
            loadMyStats();
            break;
    }
}

function setDefaultOverviewDate() {
    const overviewDateInput = document.getElementById('overview-date');
    if (overviewDateInput) {
        const today = getCSTDate(); // 使用东八区日期
        if (!overviewDateInput.value) {
            overviewDateInput.value = today;
        }
        overviewDateInput.setAttribute('max', today);
    }
}

// 修复iOS微信中用户名输入框显示密码键盘的问题
function fixUsernameInputKeyboard() {
    const usernameInput = document.getElementById('username');
    if (!usernameInput) return;
    
    // 强制设置输入模式为文本
    usernameInput.setAttribute('type', 'text');
    usernameInput.setAttribute('inputmode', 'text');
    usernameInput.setAttribute('autocomplete', 'off');
    usernameInput.setAttribute('autocapitalize', 'none');
    usernameInput.setAttribute('autocorrect', 'off');
    usernameInput.setAttribute('spellcheck', 'false');
    
    // 在focus时再次强制设置
    usernameInput.addEventListener('focus', function() {
        // 延迟设置，确保覆盖iOS的默认行为
        setTimeout(() => {
            this.setAttribute('type', 'text');
            this.setAttribute('inputmode', 'text');
            this.setAttribute('autocomplete', 'off');
        }, 10);
    }, { passive: true });
    
    // 在touchstart时也设置（iOS微信可能需要）
    usernameInput.addEventListener('touchstart', function() {
        this.setAttribute('type', 'text');
        this.setAttribute('inputmode', 'text');
        this.setAttribute('autocomplete', 'off');
    }, { passive: true });
}

// 登录
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');

    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        setToken(data.access_token);
        
        // 获取当前用户信息
        currentUser = await apiRequest('/users/me');
        updateUserInfo();

        showPage('main');
        showSection('home');
    } catch (error) {
        errorEl.textContent = error.message;
    }
});

// 页面加载完成后修复用户名输入框
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixUsernameInputKeyboard);
} else {
    fixUsernameInputKeyboard();
}

// 更新用户信息
function updateUserInfo() {
    if (currentUser) {
        document.getElementById('user-initial').textContent = currentUser.real_name.charAt(0);
        document.getElementById('header-user-name').textContent = currentUser.real_name;
        document.getElementById('header-user-role').textContent = getRoleName(currentUser.role);
        
        // 根据角色显示/隐藏审批功能
        updateApprovalVisibility();
    }
}

// 更新审批功能可见性
function updateApprovalVisibility() {
    const hasApprovalPermission = ['admin', 'general_manager', 'vice_president', 'department_head'].includes(currentUser.role);
    
    // 显示或隐藏所有带有 approval-only 类的元素
    const approvalElements = document.querySelectorAll('.approval-only');
    approvalElements.forEach(el => {
        el.style.display = hasApprovalPermission ? '' : 'none';
    });
    
    // 如果有审批权限，加载待审批数量
    if (hasApprovalPermission) {
        loadPendingCount();
    }
    
    // 加载我的未完成申请数量
    loadMyPendingCounts();
    
    // 检查出勤情况查看权限
    checkAttendanceOverviewPermission();
}

// 检查出勤情况查看权限
async function checkAttendanceOverviewPermission() {
    try {
        const permission = await apiRequest('/attendance-viewers/check-permission');
        const hasPermission = permission.has_permission;
        
        // 显示或隐藏所有带有 attendance-overview-only 类的元素
        const overviewElements = document.querySelectorAll('.attendance-overview-only');
        overviewElements.forEach(el => {
            el.style.display = hasPermission ? '' : 'none';
        });
    } catch (error) {
        // 权限检查失败，隐藏功能
        const overviewElements = document.querySelectorAll('.attendance-overview-only');
        overviewElements.forEach(el => {
            el.style.display = 'none';
        });
    }
}

// 加载出勤情况概览
async function loadAttendanceOverview() {
    try {
        const dateInput = document.getElementById('overview-date');
        const targetDate = dateInput.value || getCSTDate(); // 使用东八区日期
        
        const overview = await apiRequest(`/attendance/overview?target_date=${targetDate}`);
        const infoBar = document.getElementById('overview-info');
        const badge = document.getElementById('overview-workday-badge');
        const infoText = document.getElementById('overview-workday-text');
        const categoriesContainer = document.getElementById('overview-categories');
        
        // 更新工作日信息（显示更详细的原因）
        const isWorkday = overview.is_workday;
        badge.textContent = isWorkday ? '工作日' : '休息日';
        badge.classList.toggle('workday', isWorkday);
        badge.classList.toggle('holiday', !isWorkday);
        
        // 显示详细原因
        let reasonText = '';
        if (isWorkday) {
            reasonText = overview.workday_reason || '正常工作日';
            if (overview.workday_reason === '调休工作日' && overview.holiday_name) {
                reasonText = `调休工作日（${overview.holiday_name}）`;
            }
        } else {
            const reason = overview.workday_reason || '休息日';
            const holidayName = overview.holiday_name ? `（${overview.holiday_name}）` : '';
            if (reason === '周末') {
                reasonText = `今日${reason}，无需打卡`;
            } else if (reason === '法定节假日' || reason === '公司节假日') {
                reasonText = `今日${reason}${holidayName}，无需打卡`;
            } else {
                reasonText = `今日${reason}，无需打卡${holidayName}`;
            }
        }
        infoText.textContent = reasonText;
        infoBar.style.display = 'flex';
        
        // 分类人员
        const notCheckedIn = [];
        const checkedIn = [];
        const onLeave = [];
        const onOvertime = [];
        
        overview.items.forEach(item => {
            if (item.has_leave) {
                onLeave.push(item);
                return;
            }
            if (item.has_overtime) {
                onOvertime.push(item);
                return;
            }
            if (item.checkin_time) {
                checkedIn.push(item);
            } else {
                notCheckedIn.push(item);
            }
        });
        
        // 已打卡人员按签到时间降序排列（最后签到的在前面/左上角）
        checkedIn.sort((a, b) => {
            const timeA = a.checkin_time ? new Date(a.checkin_time).getTime() : 0;
            const timeB = b.checkin_time ? new Date(b.checkin_time).getTime() : 0;
            return timeB - timeA;
        });
        
        // 休息日仅关注加班，工作日显示所有分类（人数为0的分类不显示，已打卡除外）
        let categoryData = [];
        
        if (overview.is_workday) {
            // 工作日：请假中、未打卡、加班中人数为0时不显示，已打卡始终显示
            if (onLeave.length > 0) {
                categoryData.push({ key: 'onLeave', title: '请假中', count: onLeave.length, list: onLeave, tone: 'info', extra: '请假' });
            }
            if (notCheckedIn.length > 0) {
                categoryData.push({ key: 'notChecked', title: '未打卡', count: notCheckedIn.length, list: notCheckedIn, tone: 'danger', extra: '待打卡' });
            }
            if (onOvertime.length > 0) {
                categoryData.push({ key: 'onOvertime', title: '加班中', count: onOvertime.length, list: onOvertime, tone: 'warning', extra: '加班' });
            }
            // 已打卡始终显示
            categoryData.push({ key: 'checkedIn', title: '已打卡', count: checkedIn.length, list: checkedIn, tone: 'success', extra: '已打卡' });
        } else {
            // 休息日：只显示加班中，且人数为0时不显示
            if (onOvertime.length > 0) {
                categoryData.push({ key: 'onOvertime', title: '加班中', count: onOvertime.length, list: onOvertime, tone: 'warning', extra: '加班' });
            }
        }
        
        // 渲染分类卡片
        if (categoriesContainer) {
            categoriesContainer.innerHTML = categoryData.map(category => {
                const isCompact = category.key === 'notChecked' || category.key === 'checkedIn';
                const peopleHtml = category.list.length
                    ? category.list.map(item => {
                        const extraInfo = getOverviewExtraInfo(category.key, item);
                        return `
                        <div class="overview-person-row ${isCompact ? 'compact' : ''}">
                            <div class="overview-person-name-row">
                                <span class="overview-person-name">${item.real_name}</span>
                                ${extraInfo.days ? `<span class="overview-person-days-inline">${extraInfo.days}</span>` : ''}
                            </div>
                            ${extraInfo.date ? `<span class="overview-person-date">${extraInfo.date}</span>` : ''}
                            ${extraInfo.time ? `<span class="overview-person-time">${extraInfo.time}</span>` : ''}
                            ${extraInfo.extra && isCompact ? `<span class="overview-person-extra">${extraInfo.extra}</span>` : ''}
                        </div>
                    `;
                    }).join('')
                    : `<div class="overview-empty">暂无人员</div>`;
                
                const countClass = category.tone === 'danger'
                    ? 'danger'
                    : category.tone === 'warning'
                        ? 'warning'
                        : '';
                
                return `
                    <div class="overview-category-card">
                        <div class="overview-category-header">
                            <div class="overview-category-title">${category.title}</div>
                            <div class="overview-category-count ${countClass}">${category.count}</div>
                        </div>
                        <div class="overview-category-list">
                            ${peopleHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('加载出勤情况失败:', error);
        const categoriesContainer = document.getElementById('overview-categories');
        if (categoriesContainer) {
            categoriesContainer.innerHTML = '<div class="overview-empty">加载失败，请稍后重试</div>';
        }
        await showToast('加载出勤情况失败', 'error');
    }
}

function getOverviewExtraInfo(categoryKey, item) {
    switch (categoryKey) {
        case 'checkedIn':
            return { date: '', time: '', days: '', extra: '' };
        case 'notChecked':
            return { date: '', time: '', days: '', extra: '' };
        case 'onLeave':
            if (item.leave_start_date) {
                const dateTimeInfo = formatLeaveDateTime(item.leave_start_date, item.leave_end_date);
                const days = item.leave_days !== undefined && item.leave_days !== null ? item.leave_days : 1;
                return {
                    date: dateTimeInfo.date,
                    time: dateTimeInfo.time,
                    days: `${days}天`,
                    extra: `${dateTimeInfo.date} ${dateTimeInfo.time} 共${days}天` // 保留用于兼容
                };
            }
            const leaveDays = item.leave_days ? `${item.leave_days}天` : '';
            return { date: '', time: '', days: leaveDays, extra: leaveDays || '请假' };
        case 'onOvertime':
            if (item.overtime_start_time) {
                const dateTimeInfo = formatOvertimeDateTime(item.overtime_start_time, item.overtime_end_time);
                const days = item.overtime_days !== undefined && item.overtime_days !== null ? item.overtime_days : 1;
                return {
                    date: dateTimeInfo.date,
                    time: dateTimeInfo.time,
                    days: `${days}天`,
                    extra: `${dateTimeInfo.date} ${dateTimeInfo.time} 共${days}天` // 保留用于兼容
                };
            }
            const overtimeDays = item.overtime_days ? `${item.overtime_days}天` : '';
            return { date: '', time: '', days: overtimeDays, extra: overtimeDays || '加班' };
        default:
            return { date: '', time: '', days: '', extra: '' };
    }
}

function getOverviewExtraText(categoryKey, item) {
    // 保留此方法用于向后兼容
    const info = getOverviewExtraInfo(categoryKey, item);
    return info.extra;
}

function formatLeaveDateTime(start, end) {
    if (!start) return { date: '', time: '' };
    // 处理时区问题：确保日期字符串格式正确
    const normalizeDateStr = (dateStr) => {
        if (!dateStr) return '';
        // 如果包含 'T'，直接使用；否则添加 'T00:00:00'
        if (dateStr.includes('T')) {
            // 移除毫秒部分和时区信息，当作本地时间处理
            let normalized = dateStr.split('.')[0];
            // 如果包含时区信息（+08:00 或 Z），移除它
            if (normalized.includes('+') || normalized.includes('Z')) {
                normalized = normalized.split('+')[0].split('Z')[0];
            }
            return normalized;
        }
        // 如果不包含 'T'，可能是纯日期格式，添加默认时间
        return dateStr + 'T00:00:00';
    };
    
    const normalizedStartStr = normalizeDateStr(start);
    const normalizedEndStr = normalizeDateStr(end || start);
    
    // 手动解析日期时间，避免时区转换问题
    const parseDateTime = (dateStr) => {
        if (!dateStr) return null;
        
        // 格式：YYYY-MM-DDTHH:mm:ss 或 YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DD
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
            // 只有日期，没有时间
            datePart = dateStr;
            timePart = '00:00:00';
        }
        
        // 移除时区信息
        if (timePart.includes('+') || timePart.includes('Z')) {
            timePart = timePart.split('+')[0].split('Z')[0];
        }
        // 移除毫秒
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
    
    // 使用解析的日期时间部分
    const startMonth = String(startParts.month).padStart(2, '0');
    const startDay = String(startParts.day).padStart(2, '0');
    const startHours = String(startParts.hours).padStart(2, '0');
    const startMinutes = String(startParts.minutes).padStart(2, '0');
    
    const endMonth = String(endParts.month).padStart(2, '0');
    const endDay = String(endParts.day).padStart(2, '0');
    const endHours = String(endParts.hours).padStart(2, '0');
    const endMinutes = String(endParts.minutes).padStart(2, '0');
    
    // 判断是否同一天
    const isSameDay = startParts.year === endParts.year && 
                      startParts.month === endParts.month && 
                      startParts.day === endParts.day;
    
    let dateText = '';
    let timeText = '';
    
    if (isSameDay) {
        // 一天以内：第一排显示日期，第二排显示时间
        dateText = `${startMonth}月${startDay}日`;
        timeText = `${startHours}:${startMinutes}-${endHours}:${endMinutes}`;
    } else {
        // 一天以上：第一排显示起始时间，第二排显示结束时间
        dateText = `${startMonth}月${startDay}日 ${startHours}:${startMinutes}`;
        timeText = `${endMonth}月${endDay}日 ${endHours}:${endMinutes}`;
    }
    
    return { date: dateText, time: timeText };
}

function formatLeaveDate(start, end) {
    // 保留此方法用于向后兼容
    const dateTimeInfo = formatLeaveDateTime(start, end);
    return dateTimeInfo.date ? `${dateTimeInfo.date} ${dateTimeInfo.time}` : '';
}

function formatLeaveRange(start, end, leaveDays) {
    // 保留此方法用于向后兼容
    if (!start) return '请假';
    const dateInfo = formatLeaveDate(start, end);
    const days = leaveDays !== undefined && leaveDays !== null ? leaveDays : 1;
    return dateInfo ? `${dateInfo} 共${days}天` : `共${days}天`;
}

function formatFullDate(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}月${day}日`;
}

function formatOvertimeDateTime(start, end) {
    if (!start) return { date: '', time: '' };
    // 处理时区问题：确保日期字符串格式正确
    const normalizeDateStr = (dateStr) => {
        if (!dateStr) return '';
        // 如果包含 'T'，直接使用；否则添加 'T00:00:00'
        if (dateStr.includes('T')) {
            // 移除毫秒部分和时区信息，当作本地时间处理
            let normalized = dateStr.split('.')[0];
            // 如果包含时区信息（+08:00 或 Z），移除它
            if (normalized.includes('+') || normalized.includes('Z')) {
                normalized = normalized.split('+')[0].split('Z')[0];
            }
            return normalized;
        }
        // 如果不包含 'T'，可能是纯日期格式，添加默认时间
        return dateStr + 'T00:00:00';
    };
    
    const normalizedStartStr = normalizeDateStr(start);
    const normalizedEndStr = normalizeDateStr(end || start);
    
    // 手动解析日期时间，避免时区转换问题
    const parseDateTime = (dateStr) => {
        if (!dateStr) return null;
        
        // 格式：YYYY-MM-DDTHH:mm:ss 或 YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DD
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
            // 只有日期，没有时间
            datePart = dateStr;
            timePart = '00:00:00';
        }
        
        // 移除时区信息
        if (timePart.includes('+') || timePart.includes('Z')) {
            timePart = timePart.split('+')[0].split('Z')[0];
        }
        // 移除毫秒
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
    
    // 使用解析的日期时间部分
    const startMonth = String(startParts.month).padStart(2, '0');
    const startDay = String(startParts.day).padStart(2, '0');
    const startHours = String(startParts.hours).padStart(2, '0');
    const startMinutes = String(startParts.minutes).padStart(2, '0');
    
    const endMonth = String(endParts.month).padStart(2, '0');
    const endDay = String(endParts.day).padStart(2, '0');
    const endHours = String(endParts.hours).padStart(2, '0');
    const endMinutes = String(endParts.minutes).padStart(2, '0');
    
    // 判断是否同一天
    const isSameDay = startParts.year === endParts.year && 
                      startParts.month === endParts.month && 
                      startParts.day === endParts.day;
    
    let dateText = '';
    let timeText = '';
    
    if (isSameDay) {
        // 一天以内：第一排显示日期，第二排显示时间
        dateText = `${startMonth}月${startDay}日`;
        timeText = `${startHours}:${startMinutes}-${endHours}:${endMinutes}`;
    } else {
        // 一天以上：第一排显示起始时间，第二排显示结束时间
        dateText = `${startMonth}月${startDay}日 ${startHours}:${startMinutes}`;
        timeText = `${endMonth}月${endDay}日 ${endHours}:${endMinutes}`;
    }
    
    return { date: dateText, time: timeText };
}

function formatOvertimeDate(start, end) {
    // 保留此方法用于向后兼容
    const dateTimeInfo = formatOvertimeDateTime(start, end);
    return dateTimeInfo.date ? `${dateTimeInfo.date} ${dateTimeInfo.time}` : '';
}

function formatOvertimeRange(start, end, days) {
    // 保留此方法用于向后兼容
    if (!start) return days ? `${days}天` : '加班';
    const dateInfo = formatOvertimeDate(start, end);
    const totalDays = days !== undefined && days !== null ? days : 1;
    return dateInfo ? `${dateInfo} 共${totalDays}天` : `共${totalDays}天`;
}

// 用户菜单
function toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    menu.classList.toggle('active');
}

// 显示修改密码弹窗
function showChangePasswordModal() {
    document.getElementById('user-menu').classList.remove('active');
    
    const modalHtml = `
        <div class="modal-overlay" onclick="closeFormModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>修改密码</h3>
                    <button class="modal-close" onclick="closeFormModal()">×</button>
                </div>
                <form id="change-password-form" onsubmit="submitChangePassword(event)">
                    <div class="form-group">
                        <label class="form-label">原密码 *</label>
                        <input type="password" id="old-password" class="form-input" required placeholder="请输入原密码">
                    </div>
                    <div class="form-group">
                        <label class="form-label">新密码 *</label>
                        <input type="password" id="new-password" class="form-input" required placeholder="请输入新密码（至少6位）" minlength="6">
                    </div>
                    <div class="form-group">
                        <label class="form-label">确认新密码 *</label>
                        <input type="password" id="confirm-password" class="form-input" required placeholder="请再次输入新密码" minlength="6">
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeFormModal()">取消</button>
                        <button type="submit" class="btn btn-primary">确认修改</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('modal-container').innerHTML = modalHtml;
}

// 提交修改密码
async function submitChangePassword(event) {
    event.preventDefault();
    
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    // 验证新密码长度
    if (newPassword.length < 6) {
        await showToast('新密码长度至少为6位', 'warning');
        return;
    }
    
    // 验证两次输入的新密码是否一致
    if (newPassword !== confirmPassword) {
        await showToast('两次输入的新密码不一致', 'warning');
        return;
    }
    
    // 验证新密码不能与原密码相同
    if (oldPassword === newPassword) {
        await showToast('新密码不能与原密码相同', 'warning');
        return;
    }
    
    try {
        await apiRequest('/users/me/change-password', {
            method: 'POST',
            body: JSON.stringify({
                old_password: oldPassword,
                new_password: newPassword
            })
        });
        
        await showToast('密码修改成功！', 'success', { timeout: 2000 });
        closeFormModal();
    } catch (error) {
        await showToast('密码修改失败: ' + error.message, 'error');
    }
}

// 退出登录
function logout() {
    clearToken();
    currentUser = null;
    showPage('login');
    document.getElementById('login-form').reset();
    document.getElementById('login-error').textContent = '';
    document.getElementById('user-menu').classList.remove('active');
}

// 时钟更新
function updateClock() {
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

    document.getElementById('current-time').textContent = timeStr;
    document.getElementById('current-date').textContent = dateStr;
}

setInterval(updateClock, 1000);
updateClock();

// 地理编码：将经纬度转换为地址文本（使用高德地图API）
async function reverseGeocode(latitude, longitude) {
    try {
        // 调用后端接口，使用高德地图API进行逆地理编码
        const response = await apiRequest(
            `/attendance/geocode/reverse?latitude=${latitude}&longitude=${longitude}`
        );
        
        if (response && response.address) {
            return response.address;
        }
        
        // 如果获取失败，返回坐标
        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    } catch (error) {
        console.error('地理编码失败:', error);
        // 如果地理编码失败，返回坐标
        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
}

// 获取位置（优化版，支持手机定位，带重试机制）
async function getCurrentLocation(retryCount = 0) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('浏览器不支持地理定位，请使用支持定位的浏览器（如Chrome、Safari）'));
            return;
        }

        // 优化定位选项
        // 第一次尝试：高精度定位（GPS）
        // 如果失败，第二次尝试：降低精度要求（使用网络定位）
        const options = {
            enableHighAccuracy: retryCount === 0,  // 第一次启用高精度，重试时降低精度
            timeout: retryCount === 0 ? 20000 : 10000,  // 第一次20秒，重试10秒
            maximumAge: 0  // 不使用缓存，每次都获取最新位置
        };

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude, accuracy } = position.coords;
                    
                    // 检查定位精度（如果精度太差，给出警告但继续）
                    if (accuracy > 100) {
                        console.warn(`定位精度较低: ${accuracy}米，但继续打卡`);
                    }
                    
                    // 验证坐标有效性
                    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
                        throw new Error('获取的位置坐标无效');
                    }
                    
                    // 调用地理编码API获取地址文本（不阻塞，失败时使用坐标）
                    let address = null;
                    try {
                        address = await reverseGeocode(latitude, longitude);
                    } catch (geocodeError) {
                        console.warn('地理编码失败，使用坐标:', geocodeError);
                        // 地理编码失败不影响打卡，使用坐标
                    }
                    
                    const location = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                    
                    resolve({
                        location,  // 保留坐标字符串用于兼容（必需字段）
                        address: address || location,  // 地址文本，失败时使用坐标
                        latitude: latitude,  // 纬度（可选）
                        longitude: longitude  // 经度（可选）
                        // 注意：不发送accuracy字段，因为后端schema中没有定义
                    });
                } catch (error) {
                    reject(new Error('处理位置信息失败: ' + error.message));
                }
            },
            async (error) => {
                // 详细的错误信息
                let errorMessage = '无法获取位置信息';
                let shouldRetry = false;
                
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = '定位权限被拒绝\n\n解决方法：\n1. 点击浏览器地址栏左侧的锁图标\n2. 选择"位置"权限\n3. 设置为"允许"\n4. 刷新页面重试';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        if (retryCount === 0) {
                            // 第一次失败，尝试降低精度要求
                            shouldRetry = true;
                            errorMessage = 'GPS信号弱，正在尝试使用网络定位...';
                        } else {
                            errorMessage = '位置信息不可用\n\n解决方法：\n1. 检查GPS是否开启\n2. 移动到信号较好的位置\n3. 确保网络连接正常';
                        }
                        break;
                    case error.TIMEOUT:
                        if (retryCount === 0) {
                            // 第一次超时，尝试降低精度要求
                            shouldRetry = true;
                            errorMessage = '获取位置超时，正在重试...';
                        } else {
                            errorMessage = '获取位置超时\n\n解决方法：\n1. 检查网络连接\n2. 移动到信号较好的位置\n3. 确保GPS已开启\n4. 稍后重试';
                        }
                        break;
                    default:
                        errorMessage = `获取位置失败: ${error.message || '未知错误'}`;
                        break;
                }
                
                // 如果应该重试且未超过重试次数
                if (shouldRetry && retryCount < 1) {
                    console.log('定位失败，尝试降低精度重试...');
                    // 等待1秒后重试
                    setTimeout(() => {
                        getCurrentLocation(retryCount + 1)
                            .then(resolve)
                            .catch(reject);
                    }, 1000);
                } else {
                    reject(new Error(errorMessage));
                }
            },
            options
        );
    });
}

// 上班打卡
async function checkin() {
    const btn = document.getElementById('checkin-btn');
    
    if (currentUser?.enable_attendance === false) {
        await showToast('您不用打卡!', 'info');
        return;
    }
    
    // 如果按钮已禁用（已打卡），直接返回
    if (btn.disabled) {
        await showToast('今天已经打过上班卡', 'warning');
        return;
    }
    
    // 检查是否为工作日
    const workdayCheck = await checkWorkday();
    if (!workdayCheck.is_workday) {
        const message = workdayCheck.holiday_name 
            ? `今天是${workdayCheck.holiday_name}，无需打卡！` 
            : '今天是休息日，无需打卡！';
        await showToast(message, 'info');
        return;
    }
    
    // 检查请假状态
    try {
        const leaveStatus = await apiRequest('/attendance/leave-status');
        if (leaveStatus.full_day_leave) {
            await showToast('今天全天请假，无需打卡', 'info');
            return;
        }
        if (leaveStatus.morning_leave) {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            // 检查是否在14:10之前
            if (currentHour > 14 || (currentHour === 14 && currentMinute >= 10)) {
                await showToast('上午请假，签到时间已过（14:10后不可签到）', 'warning');
                return;
            }
            // 显示提示：上午请假，可以在14:10前签到
            const confirmed = await showToast(
                '您今天上午请假，可以在14:10前签到。\n\n确定要继续打卡吗？',
                'warning',
                {
                    confirm: true,
                    confirmText: '确定打卡',
                    cancelText: '取消',
                    timeout: 0
                }
            );
            if (!confirmed) {
                return;
            }
        }
    } catch (error) {
        console.warn('检查请假状态失败:', error);
        // 如果检查失败，继续执行打卡（不影响正常流程）
    }
    
    // 检查是否会迟到（只有在非上午请假的情况下才检查）
    try {
        const leaveStatus = await apiRequest('/attendance/leave-status').catch(() => ({ morning_leave: false }));
        if (!leaveStatus.morning_leave) {
            const lateCheck = await apiRequest('/attendance/check-late');
            if (lateCheck.will_be_late) {
                const currentTime = lateCheck.current_time || new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                const workStartTime = lateCheck.work_start_time || '09:00';
                const confirmed = await showToast(
                    `当前时间 ${currentTime}，已超过上班时间 ${workStartTime}，打卡后将记录为迟到。\n\n确定要继续打卡吗？`,
                    'warning',
                    {
                        confirm: true,
                        confirmText: '确定打卡',
                        cancelText: '取消',
                        timeout: 0  // 不自动关闭
                    }
                );
                if (!confirmed) {
                    return;  // 用户取消，不执行打卡
                }
            }
        }
    } catch (error) {
        console.warn('检查迟到状态失败:', error);
        // 如果检查失败，继续执行打卡（不影响正常流程）
    }
    
    // 获取打卡状态选择（单选按钮）
    const selectedRadio = document.querySelector('input[name="checkin-status"]:checked');
    const checkinStatus = selectedRadio ? selectedRadio.value : 'normal';
    
    btn.disabled = true;
    btn.innerHTML = '<span>📍</span><span>获取位置中...</span>';

    try {
        // 显示获取位置提示
        await showToast('正在获取位置信息，请稍候...', 'info', { timeout: 3000 });
        
        const locationData = await getCurrentLocation();
        // 添加打卡状态
        locationData.checkin_status = checkinStatus;
        
        const result = await apiRequest('/attendance/checkin', {
            method: 'POST',
            body: JSON.stringify(locationData)
        });

        await showToast('上班打卡成功！', 'success', { timeout: 2000 });
        loadMyPendingCounts();  // 更新未完成申请数量徽章
        // 刷新整个首页数据（会自动设置按钮状态）
        await loadHomeData();
        // 刷新页面以确保所有数据都是最新的
        setTimeout(() => {
            window.location.reload();
        }, 500);
    } catch (error) {
        await showToast('打卡失败: ' + error.message, 'error');
        // 只有失败时才恢复按钮状态
        btn.disabled = false;
        btn.innerHTML = '<span>📍</span><span>上班打卡</span>';
    }
}

// 下班打卡
async function checkout() {
    const btn = document.getElementById('checkout-btn');
    
    if (currentUser?.enable_attendance === false) {
        await showToast('您不用打卡!', 'info');
        return;
    }
    
    // 如果按钮已禁用（已打卡），直接返回
    if (btn.disabled) {
        await showToast('今天已经打过下班卡', 'warning');
        return;
    }
    
    // 检查请假状态
    try {
        const leaveStatus = await apiRequest('/attendance/leave-status');
        if (leaveStatus.afternoon_leave) {
            await showToast('下午请假，无需签退', 'info');
            return;
        }
    } catch (error) {
        console.warn('检查请假状态失败:', error);
        // 如果检查失败，继续执行打卡（不影响正常流程）
    }
    
    // 检查是否为工作日
    const workdayCheck = await checkWorkday();
    if (!workdayCheck.is_workday) {
        const message = workdayCheck.holiday_name 
            ? `今天是${workdayCheck.holiday_name}，无需打卡！` 
            : '今天是休息日，无需打卡！';
        await showToast(message, 'info');
        return;
    }
    
    // 检查是否会早退
    try {
        const earlyLeaveCheck = await apiRequest('/attendance/check-early-leave');
        if (earlyLeaveCheck.will_be_early_leave) {
            const currentTime = earlyLeaveCheck.current_time || new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            const workEndTime = earlyLeaveCheck.work_end_time || '18:00';
            const confirmed = await showToast(
                `当前时间 ${currentTime}，早于下班时间 ${workEndTime}，打卡后将记录为早退。\n\n确定要继续打卡吗？`,
                'warning',
                {
                    confirm: true,
                    confirmText: '确定打卡',
                    cancelText: '取消',
                    timeout: 0  // 不自动关闭
                }
            );
            if (!confirmed) {
                return;  // 用户取消，不执行打卡
            }
        }
    } catch (error) {
        console.warn('检查早退状态失败:', error);
        // 如果检查失败，继续执行打卡（不影响正常流程）
    }
    
    btn.disabled = true;
    btn.innerHTML = '<span>📍</span><span>获取位置中...</span>';

    try {
        // 显示获取位置提示
        await showToast('正在获取位置信息，请稍候...', 'info', { timeout: 3000 });
        
        const locationData = await getCurrentLocation();
        
        const result = await apiRequest('/attendance/checkout', {
            method: 'POST',
            body: JSON.stringify(locationData)
        });

        await showToast('下班打卡成功！', 'success', { timeout: 2000 });
        // 刷新整个首页数据（会自动设置按钮状态）
        await loadHomeData();
        // 刷新页面以确保所有数据都是最新的
        setTimeout(() => {
            window.location.reload();
        }, 500);
    } catch (error) {
        await showToast('打卡失败: ' + error.message, 'error');
        // 只有失败时才恢复按钮状态
        btn.disabled = false;
        btn.innerHTML = '<span>📍</span><span>下班打卡</span>';
    }
}

// 获取东八区（UTC+8）的当前日期字符串（YYYY-MM-DD格式）
function getCSTDate(date = null) {
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

// 判断是否为工作日（调用后端API）
async function checkWorkday(date = null) {
    try {
        // 如果没有指定日期，使用今天（东八区）
        if (!date) {
            date = getCSTDate();
        }
        
        // 调用后端API检查（无需登录）
        const response = await fetch(`${API_BASE_URL}/holidays/check/${date}`);
        if (!response.ok) {
            // 如果API失败，回退到本地判断
            console.warn('API调用失败，使用本地判断');
            return localWorkdayCheck(date);
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('检查工作日失败:', error);
        // 出错时回退到本地判断
        return localWorkdayCheck(date);
    }
}

// 本地工作日判断（后备方案）
function localWorkdayCheck(dateStr) {
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

// 检查并设置打卡按钮状态
async function checkAndSetAttendanceButtons() {
    const checkinBtn = document.getElementById('checkin-btn');
    const checkoutBtn = document.getElementById('checkout-btn');
    const clockLocation = document.getElementById('clock-location');
    const clockStatus = document.getElementById('clock-status'); // 打卡状态区域（红框区域）
    
    // 先获取今日打卡状态，以确定按钮是否应该禁用
    let todayAttendance = null;
    try {
        // 使用东八区获取今天的日期
        const today = getCSTDate();
        
        // 获取最近7天的数据，然后在前端过滤今天的记录
        // 使用东八区计算7天前的日期
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const cst = new Date(utc + (8 * 3600000)); // 东八区 = UTC+8
        const sevenDaysAgo = new Date(cst.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startYear = sevenDaysAgo.getFullYear();
        const startMonth = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
        const startDay = String(sevenDaysAgo.getDate()).padStart(2, '0');
        const startDate = `${startYear}-${startMonth}-${startDay}`;
        
        const attendances = await apiRequest(`/attendance/my?start_date=${startDate}&end_date=${today}&limit=10`);
        
        // 在前端过滤今天的记录，避免时区问题
        if (attendances && attendances.length > 0) {
            const todayDateStr = today;
            for (const att of attendances) {
                if (att.date) {
                    // 解析日期字段
                    let attDateStr = '';
                    if (typeof att.date === 'string') {
                        attDateStr = att.date.split('T')[0];
                    } else {
                        const d = new Date(att.date);
                        if (!isNaN(d.getTime())) {
                            attDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        }
                    }
                    if (attDateStr === todayDateStr) {
                        todayAttendance = att;
                        break;
                    }
                }
            }
        }
    } catch (error) {
        console.error('获取今日打卡状态失败:', error);
    }
    
    // 检查今天是否为工作日
    const workdayCheck = await checkWorkday();
    
    // 确保 workdayCheck 存在且 is_workday 是布尔值
    if (!workdayCheck || workdayCheck.is_workday === undefined) {
        console.error('工作日检查结果异常:', workdayCheck);
        // 如果API返回异常，使用本地判断
        const localCheck = localWorkdayCheck(getCSTDate());
        workdayCheck = localCheck;
    }
    
    if (!workdayCheck.is_workday) {
        // 非工作日，隐藏打卡状态区域
        if (clockStatus) {
            clockStatus.style.display = 'none';
        }
        
        // 禁用打卡按钮
        checkinBtn.disabled = true;
        checkoutBtn.disabled = true;
        checkinBtn.style.opacity = '0.5';
        checkoutBtn.style.opacity = '0.5';
        checkinBtn.style.cursor = 'not-allowed';
        checkoutBtn.style.cursor = 'not-allowed';
        
        // 显示提示信息：休息日（详细说明原因）
        if (clockLocation) {
            let reasonText = '';
            const reason = workdayCheck.reason || '休息日';
            const holidayName = workdayCheck.holiday_name ? `（${workdayCheck.holiday_name}）` : '';
            
            if (reason === '周末') {
                reasonText = `今日${reason}，无需打卡`;
            } else if (reason === '公司节假日') {
                reasonText = `今日公司节假日${holidayName}，无需打卡`;
            } else if (reason === '法定节假日') {
                reasonText = `今日法定节假日${holidayName}，无需打卡`;
            } else {
                reasonText = `今日${reason}，无需打卡${holidayName}`;
            }
            
            clockLocation.textContent = reasonText;
            clockLocation.style.color = '#ff9500';
            clockLocation.style.fontWeight = 'bold';
            clockLocation.style.display = 'block';
        }
    } else {
        // 工作日（包括调休工作日）
        // 如果是调休工作日，特别显示
        if (clockLocation && workdayCheck.reason === '调休工作日') {
            const holidayName = workdayCheck.holiday_name ? `（${workdayCheck.holiday_name}）` : '';
            clockLocation.textContent = `调休工作日${holidayName}，请正常打卡`;
            clockLocation.style.color = '#007aff';
            clockLocation.style.fontWeight = 'bold';
            clockLocation.style.display = 'block';
        }
        // 工作日
        // 根据打卡状态设置按钮（已打卡的按钮保持禁用）
        const hasCheckin = todayAttendance && todayAttendance.checkin_time && 
                          todayAttendance.checkin_time !== null && 
                          todayAttendance.checkin_time !== '';
        const hasCheckout = todayAttendance && todayAttendance.checkout_time && 
                           todayAttendance.checkout_time !== null && 
                           todayAttendance.checkout_time !== '';
        
        // 获取打卡策略（获取打卡时间范围）
        let policy = null;
        let checkinStartTime = '08:00';
        let checkinEndTime = '11:30';
        let checkoutStartTime = '17:20';
        let checkoutEndTime = '20:00';
        try {
            const policies = await apiRequest('/attendance/policies');
            if (policies && policies.length > 0) {
                policy = policies.find(p => p.is_active) || policies[0];
                if (policy) {
                    checkinStartTime = policy.checkin_start_time || checkinStartTime;
                    checkinEndTime = policy.checkin_end_time || checkinEndTime;
                    checkoutStartTime = policy.checkout_start_time || checkoutStartTime;
                    checkoutEndTime = policy.checkout_end_time || checkoutEndTime;
                }
            }
        } catch (error) {
            console.warn('获取打卡策略失败，使用默认时间:', error);
        }
        
        // 判断是否在打卡时间内
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = currentHour * 60 + currentMinute; // 转换为分钟数
        
        // 解析打卡时间范围
        const parseTime = (timeStr) => {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };
        
        const checkinStart = parseTime(checkinStartTime);
        const checkinEnd = parseTime(checkinEndTime);
        const checkoutStart = parseTime(checkoutStartTime);
        const checkoutEnd = parseTime(checkoutEndTime);
        
        // 判断是否在打卡时间内
        const isInCheckinTime = currentTime >= checkinStart && currentTime <= checkinEnd;
        const isInCheckoutTime = currentTime >= checkoutStart && currentTime <= checkoutEnd;
        const isInPunchTime = isInCheckinTime || isInCheckoutTime;
        
        // 如果已打卡或是在打卡时间内且未打卡，显示打卡状态区域
        if (hasCheckin || hasCheckout || (isInPunchTime && !hasCheckin)) {
            if (clockStatus) {
                clockStatus.style.display = 'flex';
            }
        } else {
            // 不在打卡时间内且未打卡，隐藏打卡状态区域
            if (clockStatus) {
                clockStatus.style.display = 'none';
            }
        }
        
        // 设置按钮状态和提示
        let checkinDisabledReason = '';
        let checkoutDisabledReason = '';
        
        if (todayAttendance) {
            // 已打卡的按钮保持禁用状态（灰色）
            checkinBtn.disabled = hasCheckin;
            checkoutBtn.disabled = !hasCheckin || hasCheckout;
            
            if (hasCheckin) {
                checkinDisabledReason = '今日已签到';
            }
            if (hasCheckout) {
                checkoutDisabledReason = '今日已签退';
            } else if (!hasCheckin) {
                checkoutDisabledReason = '请先签到';
            }
        } else {
            // 未打卡，根据打卡时间判断按钮状态
            checkinBtn.disabled = !isInCheckinTime;
            checkoutBtn.disabled = true; // 未上班时，下班按钮禁用
            
            if (!isInCheckinTime) {
                if (currentTime < checkinStart) {
                    checkinDisabledReason = `签到时间：${checkinStartTime}-${checkinEndTime}`;
                } else if (currentTime > checkinEnd) {
                    checkinDisabledReason = `已过签到时间（${checkinStartTime}-${checkinEndTime}）`;
                }
            }
            checkoutDisabledReason = '请先签到';
        }
        
        // 设置按钮样式和title提示
        checkinBtn.style.opacity = checkinBtn.disabled ? '0.6' : '1';
        checkoutBtn.style.opacity = checkoutBtn.disabled ? '0.6' : '1';
        checkinBtn.style.cursor = checkinBtn.disabled ? 'not-allowed' : 'pointer';
        checkoutBtn.style.cursor = checkoutBtn.disabled ? 'not-allowed' : 'pointer';
        
        // 设置按钮title提示
        if (checkinBtn.disabled && checkinDisabledReason) {
            checkinBtn.title = checkinDisabledReason;
        } else {
            checkinBtn.title = '';
        }
        if (checkoutBtn.disabled && checkoutDisabledReason) {
            checkoutBtn.title = checkoutDisabledReason;
        } else {
            checkoutBtn.title = '';
        }
        
        // 检查请假状态并显示相应提示
        let leaveStatusInfo = null;
        try {
            leaveStatusInfo = await apiRequest('/attendance/leave-status');
        } catch (error) {
            console.warn('获取请假状态失败:', error);
        }
        
        // 显示状态选择器（如果未打卡且在打卡时间内）
        const statusSelector = document.getElementById('checkin-status-selector');
        if (statusSelector) {
            if (!hasCheckin && isInPunchTime && !leaveStatusInfo?.full_day_leave) {
                statusSelector.style.display = 'block';
            } else {
                statusSelector.style.display = 'none';
            }
        }
        
        // 显示提示信息或位置信息
        // 如果是调休工作日且未打卡，已经显示了调休工作日提示，这里不再覆盖
        const isMakeupWorkday = workdayCheck.reason === '调休工作日';
        const alreadyShownMakeupWorkday = isMakeupWorkday && !hasCheckin && !hasCheckout;
        
        if (clockLocation && !alreadyShownMakeupWorkday) {
            if (hasCheckin && hasCheckout) {
                // 已下班打卡，显示完成提示
                clockLocation.textContent = '今天打卡完成，工作辛苦了！';
                clockLocation.style.color = '#34c759';
                clockLocation.style.fontWeight = 'bold';
                clockLocation.style.display = 'block';
            } else if (hasCheckin && !hasCheckout) {
                // 已上班打卡但未下班打卡，显示签退时间范围或请假信息
                if (leaveStatusInfo) {
                    if (leaveStatusInfo.full_day_leave) {
                        clockLocation.textContent = '今天全天请假';
                        clockLocation.style.color = '#ff9500';
                        clockLocation.style.fontWeight = 'bold';
                        clockLocation.style.display = 'block';
                    } else if (leaveStatusInfo.afternoon_leave) {
                        clockLocation.textContent = '下午请假，无需签退';
                        clockLocation.style.color = '#ff9500';
                        clockLocation.style.fontWeight = 'bold';
                        clockLocation.style.display = 'block';
                    } else {
                        clockLocation.textContent = `签退时间：${checkoutStartTime}-${checkoutEndTime}`;
                        clockLocation.style.color = '#999';
                        clockLocation.style.fontWeight = 'bold';
                        clockLocation.style.display = 'block';
                }
                } else {
                    clockLocation.textContent = `签退时间：${checkoutStartTime}-${checkoutEndTime}`;
                    clockLocation.style.color = '#999';
                    clockLocation.style.fontWeight = 'bold';
                    clockLocation.style.display = 'block';
                }
            } else if (leaveStatusInfo) {
                // 显示请假状态提示
                if (leaveStatusInfo.full_day_leave) {
                    clockLocation.textContent = '今天全天请假，无需打卡';
                    clockLocation.style.color = '#ff9500';
                    clockLocation.style.fontWeight = 'bold';
                    clockLocation.style.display = 'block';
                } else if (leaveStatusInfo.morning_leave) {
                    clockLocation.textContent = '上午请假，可在14:10前签到';
                    clockLocation.style.color = '#ff9500';
                    clockLocation.style.fontWeight = 'bold';
                    clockLocation.style.display = 'block';
                } else if (leaveStatusInfo.afternoon_leave) {
                    clockLocation.textContent = '下午请假，上午正常签到';
                    clockLocation.style.color = '#ff9500';
                    clockLocation.style.fontWeight = 'bold';
                    clockLocation.style.display = 'block';
                } else if (isInCheckinTime) {
                    // 在上班打卡时间内
                    const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
                    clockLocation.textContent = `${workdayText}，请及时签到（${checkinStartTime}-${checkinEndTime}）`;
                    clockLocation.style.color = '#007aff';
                    clockLocation.style.fontWeight = 'bold';
                    clockLocation.style.display = 'block';
                } else if (isInCheckoutTime) {
                    // 在下班打卡时间内
                    const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
                    clockLocation.textContent = `${workdayText}，请及时签退（${checkoutStartTime}-${checkoutEndTime}）`;
                    clockLocation.style.color = '#007aff';
                    clockLocation.style.fontWeight = 'bold';
                    clockLocation.style.display = 'block';
                } else if (currentTime < checkinStart) {
                    // 未到上班打卡时间
                    const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
                    clockLocation.textContent = `${workdayText}，签到时间：${checkinStartTime}-${checkinEndTime}`;
                    clockLocation.style.color = '#999';
                    clockLocation.style.fontWeight = 'bold';
                    clockLocation.style.display = 'block';
                } else if (currentTime > checkinEnd && currentTime < checkoutStart) {
                    // 在上班和下班打卡时间之间
                    const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
                    clockLocation.textContent = `${workdayText}，签退时间：${checkoutStartTime}-${checkoutEndTime}`;
                    clockLocation.style.color = '#999';
                    clockLocation.style.fontWeight = 'bold';
                    clockLocation.style.display = 'block';
                } else {
                    // 已过下班打卡时间
                    const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
                    clockLocation.textContent = `${workdayText}，已过打卡时间`;
                    clockLocation.style.color = '#999';
                    clockLocation.style.fontWeight = 'bold';
                    clockLocation.style.display = 'block';
                }
            } else if (isInCheckinTime) {
                // 在上班打卡时间内且未打卡
                const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
                clockLocation.textContent = `${workdayText}，请及时签到（${checkinStartTime}-${checkinEndTime}）`;
                clockLocation.style.color = '#007aff';
                clockLocation.style.fontWeight = 'bold';
                clockLocation.style.display = 'block';
            } else if (isInCheckoutTime) {
                // 在下班打卡时间内且未打卡
                const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
                clockLocation.textContent = `${workdayText}，请及时签退（${checkoutStartTime}-${checkoutEndTime}）`;
                clockLocation.style.color = '#007aff';
                clockLocation.style.fontWeight = 'bold';
                clockLocation.style.display = 'block';
            } else if (currentTime < checkinStart) {
                // 未到上班打卡时间
                const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
                clockLocation.textContent = `${workdayText}，签到时间：${checkinStartTime}-${checkinEndTime}`;
                clockLocation.style.color = '#999';
                clockLocation.style.fontWeight = 'bold';
                clockLocation.style.display = 'block';
            } else if (currentTime > checkinEnd && currentTime < checkoutStart) {
                // 在上班和下班打卡时间之间
                const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
                clockLocation.textContent = `${workdayText}，签退时间：${checkoutStartTime}-${checkoutEndTime}`;
                clockLocation.style.color = '#999';
                clockLocation.style.fontWeight = 'bold';
                clockLocation.style.display = 'block';
            } else {
                // 已过下班打卡时间
                const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
                clockLocation.textContent = `${workdayText}，已过打卡时间`;
                clockLocation.style.color = '#999';
                clockLocation.style.fontWeight = 'bold';
                clockLocation.style.display = 'block';
            }
        }
    }
}

function updateAttendanceAvailabilityState(isEnabled) {
    const clockStatus = document.getElementById('clock-status');
    const clockActions = document.getElementById('clock-actions');
    const statusSelector = document.getElementById('checkin-status-selector');
    const clockLocation = document.getElementById('clock-location');
    const checkinStatusEl = document.getElementById('checkin-status');
    const checkoutStatusEl = document.getElementById('checkout-status');
    const checkinBtn = document.getElementById('checkin-btn');
    const checkoutBtn = document.getElementById('checkout-btn');
    
    if (!isEnabled) {
        if (clockStatus) clockStatus.style.display = 'none';
        if (clockActions) clockActions.style.display = 'none';
        if (statusSelector) statusSelector.style.display = 'none';
        if (checkinStatusEl) checkinStatusEl.textContent = '未打卡';
        if (checkoutStatusEl) checkoutStatusEl.textContent = '未打卡';
        if (clockLocation) {
            clockLocation.textContent = '您不用打卡!';
            clockLocation.style.display = 'block';
            clockLocation.style.color = '#34c759';
            clockLocation.style.fontWeight = 'bold';
        }
        if (checkinBtn) {
            checkinBtn.disabled = true;
            checkinBtn.style.opacity = '0.6';
            checkinBtn.style.cursor = 'not-allowed';
            checkinBtn.title = '您无需打卡';
        }
        if (checkoutBtn) {
            checkoutBtn.disabled = true;
            checkoutBtn.style.opacity = '0.6';
            checkoutBtn.style.cursor = 'not-allowed';
            checkoutBtn.title = '您无需打卡';
        }
        return;
    }
    
    if (clockStatus) clockStatus.style.display = '';
    if (clockActions) clockActions.style.display = '';
    if (statusSelector) statusSelector.style.display = 'none';
    if (clockLocation) {
        clockLocation.textContent = '';
        clockLocation.style.display = '';
        clockLocation.style.color = '';
        clockLocation.style.fontWeight = '';
    }
    if (checkinBtn) {
        checkinBtn.disabled = false;
        checkinBtn.style.opacity = '';
        checkinBtn.style.cursor = '';
        checkinBtn.title = '';
    }
    if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.style.opacity = '0.6';
        checkoutBtn.style.cursor = 'not-allowed';
        checkoutBtn.title = '';
    }
}

// 加载首页数据
async function loadHomeData() {
    const attendanceEnabled = currentUser?.enable_attendance !== false;
    updateAttendanceAvailabilityState(attendanceEnabled);
    
    if (attendanceEnabled) {
        await loadTodayAttendance();
    }

    await loadRecentAttendance();
    await loadPendingCount();
    await loadMyPendingCounts();  // 加载我的未完成申请数量
    
    if (attendanceEnabled) {
        // 检查工作日并设置按钮状态（会考虑打卡状态）
        await checkAndSetAttendanceButtons();
    }
}

// 加载今日打卡状态
async function loadTodayAttendance() {
    try {
        // 使用东八区获取今天的日期
        const today = getCSTDate();
        
        // 获取最近7天的数据，然后在前端过滤今天的记录
        // 使用东八区计算7天前的日期
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const cst = new Date(utc + (8 * 3600000)); // 东八区 = UTC+8
        const sevenDaysAgo = new Date(cst.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startYear = sevenDaysAgo.getFullYear();
        const startMonth = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
        const startDay = String(sevenDaysAgo.getDate()).padStart(2, '0');
        const startDate = `${startYear}-${startMonth}-${startDay}`;
        
        const attendances = await apiRequest(`/attendance/my?start_date=${startDate}&end_date=${today}&limit=10`);
        
        // 在前端过滤今天的记录，避免时区问题
        let todayAttendance = null;
        if (attendances && attendances.length > 0) {
            // 获取今天的日期用于比较
            const todayDateStr = today;
            
            // 遍历所有记录，找到今天的记录
            for (const att of attendances) {
                if (att.date) {
                    // 解析日期字段（可能是ISO字符串或日期对象）
                    let attDateStr = '';
                    if (typeof att.date === 'string') {
                        // 如果是字符串，提取日期部分
                        attDateStr = att.date.split('T')[0];
                    } else if (att.date instanceof Date) {
                        // 如果是Date对象
                        const d = new Date(att.date);
                        attDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    } else {
                        // 尝试转换为字符串
                        const d = new Date(att.date);
                        if (!isNaN(d.getTime())) {
                            attDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        }
                    }
                    
                    if (attDateStr === todayDateStr) {
                        todayAttendance = att;
                        break;
                    }
                }
            }
        }
        
        if (todayAttendance) {
            const att = todayAttendance;
            
            // 更严格地检查时间字段是否存在且有效
            const hasCheckin = att.checkin_time && att.checkin_time !== null && att.checkin_time !== '';
            const hasCheckout = att.checkout_time && att.checkout_time !== null && att.checkout_time !== '';
            
            // 更新状态显示
            const checkinStatusEl = document.getElementById('checkin-status');
            const checkoutStatusEl = document.getElementById('checkout-status');
            
            if (checkinStatusEl) {
                checkinStatusEl.textContent = hasCheckin ? formatTime(att.checkin_time) : '未打卡';
            }
            if (checkoutStatusEl) {
                checkoutStatusEl.textContent = hasCheckout ? formatTime(att.checkout_time) : '未打卡';
            }

            const checkinBtn = document.getElementById('checkin-btn');
            const checkoutBtn = document.getElementById('checkout-btn');
            const clockLocation = document.getElementById('clock-location');
            
            // 设置按钮禁用状态（已打卡的按钮会变为灰色）
            if (checkinBtn) {
                checkinBtn.disabled = hasCheckin;
            }
            if (checkoutBtn) {
                checkoutBtn.disabled = !hasCheckin || hasCheckout;
            }
            
            // 根据打卡状态显示相应信息
            if (clockLocation) {
                if (hasCheckin && hasCheckout) {
                    // 已下班打卡，显示完成提示
                    clockLocation.textContent = '今天打卡完成，工作辛苦了！';
                    clockLocation.style.color = '#34c759';
                    clockLocation.style.fontWeight = 'bold';
                    clockLocation.style.display = 'block';
                } else if (hasCheckin && !hasCheckout) {
                    // 已上班打卡但未下班打卡，需要获取签退时间范围或请假信息
                    // 获取打卡策略时间范围
                    let checkoutStartTime = '17:20';
                    let checkoutEndTime = '20:00';
                    try {
                        const policies = await apiRequest('/attendance/policies');
                        if (policies && policies.length > 0) {
                            const policy = policies.find(p => p.is_active) || policies[0];
                            if (policy) {
                                checkoutStartTime = policy.checkout_start_time || checkoutStartTime;
                                checkoutEndTime = policy.checkout_end_time || checkoutEndTime;
                            }
                        }
                    } catch (error) {
                        console.warn('获取打卡策略失败，使用默认时间:', error);
                    }
                    
                    // 检查请假状态
                    let leaveStatusInfo = null;
                    try {
                        leaveStatusInfo = await apiRequest('/attendance/leave-status');
                    } catch (error) {
                        console.warn('获取请假状态失败:', error);
                    }
                    
                    if (leaveStatusInfo) {
                        if (leaveStatusInfo.full_day_leave) {
                            clockLocation.textContent = '今天全天请假';
                            clockLocation.style.color = '#ff9500';
                            clockLocation.style.fontWeight = 'bold';
                            clockLocation.style.display = 'block';
                        } else if (leaveStatusInfo.afternoon_leave) {
                            clockLocation.textContent = '下午请假，无需签退';
                            clockLocation.style.color = '#ff9500';
                            clockLocation.style.fontWeight = 'bold';
                            clockLocation.style.display = 'block';
                        } else {
                            clockLocation.textContent = `签退时间：${checkoutStartTime}-${checkoutEndTime}`;
                            clockLocation.style.color = '#999';
                            clockLocation.style.fontWeight = 'bold';
                            clockLocation.style.display = 'block';
                        }
                    } else {
                        clockLocation.textContent = `签退时间：${checkoutStartTime}-${checkoutEndTime}`;
                        clockLocation.style.color = '#999';
                        clockLocation.style.fontWeight = 'bold';
                        clockLocation.style.display = 'block';
                    }
                }
            }
        } else {
            // 没有打卡记录
            const checkinStatusEl = document.getElementById('checkin-status');
            const checkoutStatusEl = document.getElementById('checkout-status');
            const checkinBtn = document.getElementById('checkin-btn');
            const checkoutBtn = document.getElementById('checkout-btn');
            
            if (checkinStatusEl) {
                checkinStatusEl.textContent = '未打卡';
            }
            if (checkoutStatusEl) {
                checkoutStatusEl.textContent = '未打卡';
            }
            if (checkinBtn) {
                checkinBtn.disabled = false;
            }
            if (checkoutBtn) {
                checkoutBtn.disabled = true;
            }
        }
    } catch (error) {
        console.error('加载今日打卡失败:', error);
        // 出错时也显示未打卡状态
        const checkinStatusEl = document.getElementById('checkin-status');
        const checkoutStatusEl = document.getElementById('checkout-status');
        if (checkinStatusEl) {
            checkinStatusEl.textContent = '未打卡';
        }
        if (checkoutStatusEl) {
            checkoutStatusEl.textContent = '未打卡';
        }
    }
}

// 加载最近考勤
async function loadRecentAttendance() {
    try {
        // 使用更兼容的方式获取日期
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const endDate = `${year}-${month}-${day}`;
        
        // 计算7天前的日期
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const startYear = sevenDaysAgo.getFullYear();
        const startMonth = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
        const startDay = String(sevenDaysAgo.getDate()).padStart(2, '0');
        const startDate = `${startYear}-${startMonth}-${startDay}`;
        
        const attendances = await apiRequest(`/attendance/my?start_date=${startDate}&end_date=${endDate}&limit=5`);

        const container = document.getElementById('recent-attendance');
        if (attendances.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><p>暂无考勤记录</p></div>';
            return;
        }

        // 格式化打卡状态
        const formatCheckinStatus = (status) => {
            if (!status || status === 'normal') {
                return { text: '正常打卡', class: 'checkin-status-normal' };
            } else if (status === 'city_business') {
                return { text: '市区办事', class: 'checkin-status-business' };
            } else if (status === 'business_trip') {
                return { text: '出差', class: 'checkin-status-business' };
            }
            return { text: '', class: '' };
        };

        // 格式化签退状态
        const formatCheckoutStatus = (att) => {
            if (!att.checkout_time) {
                return { text: '未签退', class: 'checkout-status-absent' };
            } else if (att.is_early_leave) {
                return { text: '早退', class: 'checkout-status-early' };
            } else {
                return { text: '正常签退', class: 'checkout-status-normal' };
            }
        };

        container.innerHTML = attendances.map(att => {
            const date = new Date(att.date);
            const statusInfo = formatCheckinStatus(att.checkin_status);
            const statusBadge = att.checkin_time && statusInfo.text 
                ? `<span class="checkin-status-badge ${statusInfo.class}">${statusInfo.text}</span>` 
                : '';
            const checkoutStatusInfo = formatCheckoutStatus(att);
            const checkoutStatusBadge = `<span class="checkout-status-badge ${checkoutStatusInfo.class}">${checkoutStatusInfo.text}</span>`;
            return `
                <div class="attendance-item">
                    <div class="attendance-date">
                        <div class="attendance-day">${date.getDate()}</div>
                        <div class="attendance-month">${date.getMonth() + 1}月</div>
                    </div>
                    <div class="attendance-info">
                        <div class="attendance-time">
                            <span>上班:</span>
                            <strong>${att.checkin_time ? formatTime(att.checkin_time) : '-'}</strong>
                            ${statusBadge}
                            ${att.is_late ? '<span class="status-badge status-warning">迟到</span>' : ''}
                        </div>
                        ${att.checkin_location ? `<div class="attendance-location"><span>📍 ${att.checkin_location}</span></div>` : ''}
                        <div class="attendance-time">
                            <span>下班:</span>
                            <strong>${att.checkout_time ? formatTime(att.checkout_time) : '-'}</strong>
                            ${checkoutStatusBadge}
                        </div>
                        ${att.checkout_location ? `<div class="attendance-location"><span>📍 ${att.checkout_location}</span></div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载最近考勤失败:', error);
    }
}

// 加载待审批数量
async function loadPendingCount() {
    try {
        const leaves = await apiRequest('/leave/pending');
        const overtimes = await apiRequest('/overtime/pending');
        const totalCount = leaves.length + overtimes.length;
        
        // 更新首页的待审批数量徽章
        const badge = document.getElementById('pending-count');
        if (badge) {
            badge.textContent = totalCount;
            badge.style.display = totalCount > 0 ? 'inline-block' : 'none';
        }
        
        // 更新标签上的徽章
        updateTabBadges(leaves.length, overtimes.length);
    } catch (error) {
        console.error('加载待审批数量失败:', error);
    }
}

// 加载我的未完成申请数量（请假和加班）
async function loadMyPendingCounts() {
    try {
        // 获取我的请假申请和加班申请
        const [leaves, overtimes] = await Promise.all([
            apiRequest('/leave/my').catch(() => []),
            apiRequest('/overtime/my').catch(() => [])
        ]);
        
        // 统计未完成的请假申请（pending, dept_approved, vp_approved）
        const leavePendingCount = Array.isArray(leaves) 
            ? leaves.filter(leave => ['pending', 'dept_approved', 'vp_approved'].includes(leave.status)).length 
            : 0;
        
        // 统计未完成的加班申请（pending）
        const overtimePendingCount = Array.isArray(overtimes)
            ? overtimes.filter(ot => ot.status === 'pending').length
            : 0;
        
        // 更新请假申请徽章
        const leaveBadge = document.getElementById('leave-pending-count');
        if (leaveBadge) {
            leaveBadge.textContent = leavePendingCount;
            leaveBadge.style.display = leavePendingCount > 0 ? 'inline-block' : 'none';
        }
        
        // 更新加班申请徽章
        const overtimeBadge = document.getElementById('overtime-pending-count');
        if (overtimeBadge) {
            overtimeBadge.textContent = overtimePendingCount;
            overtimeBadge.style.display = overtimePendingCount > 0 ? 'inline-block' : 'none';
        }
    } catch (error) {
        console.error('加载未完成申请数量失败:', error);
        // 出错时隐藏徽章
        const leaveBadge = document.getElementById('leave-pending-count');
        const overtimeBadge = document.getElementById('overtime-pending-count');
        if (leaveBadge) leaveBadge.style.display = 'none';
        if (overtimeBadge) overtimeBadge.style.display = 'none';
    }
}

// 更新标签徽章
function updateTabBadges(leaveCount, overtimeCount) {
    const leaveBadge = document.getElementById('leave-tab-badge');
    const overtimeBadge = document.getElementById('overtime-tab-badge');
    
    if (leaveBadge) {
        leaveBadge.textContent = leaveCount;
        leaveBadge.style.display = leaveCount > 0 ? 'inline-block' : 'none';
    }
    
    if (overtimeBadge) {
        overtimeBadge.textContent = overtimeCount;
        overtimeBadge.style.display = overtimeCount > 0 ? 'inline-block' : 'none';
    }
}

// 加载考勤记录（按月）
async function loadAttendanceByMonth() {
    const monthInput = document.getElementById('attendance-month');
    if (!monthInput.value) {
        const now = new Date();
        monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const [year, month] = monthInput.value.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    try {
        const attendances = await apiRequest(`/attendance/my?start_date=${startDate}&end_date=${endDate}`);
        const container = document.getElementById('attendance-list');

        if (attendances.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><p>本月暂无考勤记录</p></div>';
            return;
        }

        // 格式化打卡状态
        const formatCheckinStatus = (status) => {
            if (!status || status === 'normal') {
                return { text: '正常打卡', class: 'checkin-status-normal' };
            } else if (status === 'city_business') {
                return { text: '市区办事', class: 'checkin-status-business' };
            } else if (status === 'business_trip') {
                return { text: '出差', class: 'checkin-status-business' };
            }
            return { text: '', class: '' };
        };

        // 格式化签退状态
        const formatCheckoutStatus = (att) => {
            if (!att.checkout_time) {
                return { text: '未签退', class: 'checkout-status-absent' };
            } else if (att.is_early_leave) {
                return { text: '早退', class: 'checkout-status-early' };
            } else {
                return { text: '正常签退', class: 'checkout-status-normal' };
            }
        };

        container.innerHTML = attendances.map(att => {
            const statusInfo = formatCheckinStatus(att.checkin_status);
            const statusBadge = att.checkin_time && statusInfo.text 
                ? `<span class="checkin-status-badge ${statusInfo.class}">${statusInfo.text}</span>` 
                : '';
            const checkoutStatusInfo = formatCheckoutStatus(att);
            const checkoutStatusBadge = `<span class="checkout-status-badge ${checkoutStatusInfo.class}">${checkoutStatusInfo.text}</span>`;
            return `
            <div class="list-item">
                <div class="list-item-header">
                    <span class="list-item-title">${formatDate(att.date)}</span>
                    ${att.work_hours ? `<span>${att.work_hours.toFixed(1)}小时</span>` : ''}
                </div>
                <div class="list-item-content">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px;">
                        <span>上班: ${att.checkin_time ? formatTime(att.checkin_time) : '-'}</span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${statusBadge}
                            ${att.is_late ? '<span class="status-badge status-warning">迟到</span>' : ''}
                        </div>
                    </div>
                    ${att.checkin_location ? `<div class="attendance-location" style="margin-bottom: 8px; color: #666; font-size: 0.9em;"><span>📍 ${att.checkin_location}</span></div>` : ''}
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>下班: ${att.checkout_time ? formatTime(att.checkout_time) : '-'}</span>
                        ${checkoutStatusBadge}
                    </div>
                    ${att.checkout_location ? `<div class="attendance-location" style="margin-top: 8px; color: #666; font-size: 0.9em;"><span>📍 ${att.checkout_location}</span></div>` : ''}
                </div>
            </div>
        `;
        }).join('');
    } catch (error) {
        console.error('加载考勤记录失败:', error);
    }
}

// 加载我的请假申请
async function loadMyLeaveApplications() {
    try {
        const leaves = await apiRequest('/leave/my');
        const container = document.getElementById('leave-list');

        if (leaves.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏖️</div><p>暂无请假记录</p></div>';
            return;
        }

        container.innerHTML = leaves.map(leave => {
            // 判断是否可以撤回（待审批状态）
            const canCancel = ['pending', 'dept_approved', 'vp_approved'].includes(leave.status);
            
            // 获取待审批人信息
            let pendingApprover = '';
            if (leave.status === 'pending') {
                // 根据申请人角色显示不同的待审批人
                const userRole = currentUser?.role;
                if (userRole === 'vice_president') {
                    // 副总申请：待副总审批
                    pendingApprover = leave.pending_vp_name || leave.assigned_vp_name ? 
                        `待审批: ${leave.pending_vp_name || leave.assigned_vp_name}` : '待审批: 副总';
                } else if (userRole === 'general_manager') {
                    // 总经理申请：待总经理审批
                    pendingApprover = leave.pending_gm_name || leave.assigned_gm_name ? 
                        `待审批: ${leave.pending_gm_name || leave.assigned_gm_name}` : '待审批: 总经理';
                } else {
                    // 员工和部门主任申请：待部门主任审批
                    pendingApprover = leave.pending_dept_head_name ? 
                        `待审批: ${leave.pending_dept_head_name}` : '待审批: 部门主任';
                }
            } else if (leave.status === 'dept_approved') {
                pendingApprover = leave.assigned_vp_name ? `待审批: ${leave.assigned_vp_name}` : '待审批: 副总';
            } else if (leave.status === 'vp_approved') {
                pendingApprover = leave.assigned_gm_name ? `待审批: ${leave.assigned_gm_name}` : '待审批: 总经理';
            }
            
            return `
                <div class="list-item">
                    <div class="list-item-header">
                        <span class="list-item-title">${formatTimeRange(leave.start_date, leave.end_date)}</span>
                        <span class="status-badge status-${getStatusClass(leave.status)}">${getLeaveStatusName(leave.status)}</span>
                    </div>
                    <div class="list-item-content">
                        <div><strong>天数:</strong> ${leave.days}天</div>
                    <div><strong>类型:</strong> ${leave.leave_type_name || '普通请假'}</div>
                        <div><strong>原因:</strong> ${leave.reason}</div>
                        <div><strong>申请时间:</strong> ${formatDateTime(leave.created_at)}</div>
                        ${pendingApprover ? `<div style="color: #1890ff; margin-top: 5px;"><strong>${pendingApprover}</strong></div>` : ''}
                        <div style="margin-top: 10px; display: flex; gap: 10px;">
                            ${canCancel ? `
                                <button class="btn btn-secondary" style="padding: 5px 15px; font-size: 0.9em; flex: 1;" onclick="cancelLeaveApplication(${leave.id})">撤回申请</button>
                            ` : ''}
                            ${(leave.status === 'approved' || leave.status === 'rejected') ? `
                                <button class="btn btn-primary" style="padding: 5px 15px; font-size: 0.9em; flex: 1;" onclick="viewLeaveDetail(${leave.id})">详情</button>
                            ` : ''}
                            ${leave.status === 'cancelled' ? `
                                <button class="btn btn-danger" style="padding: 5px 15px; font-size: 0.9em; flex: 1;" onclick="deleteLeaveApplication(${leave.id})">删除</button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载请假申请失败:', error);
    }
}

// 加载我的加班申请
async function loadMyOvertimeApplications() {
    try {
        const overtimes = await apiRequest('/overtime/my');
        const container = document.getElementById('overtime-list');

        if (overtimes.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏰</div><p>暂无加班记录</p></div>';
            return;
        }

        container.innerHTML = overtimes.map(ot => {
            // 判断是否可以撤回（待审批状态）
            const canCancel = ot.status === 'pending';
            
            // 获取待审批人信息
            let pendingApprover = '';
            if (ot.status === 'pending') {
                pendingApprover = ot.assigned_approver_name ? `待审批: ${ot.assigned_approver_name}` : '待审批: 审批人';
            }
            
            // 获取加班类型显示
            const overtimeTypeText = ot.overtime_type === 'passive' ? '被动加班' : '主动加班';
            const overtimeTypeClass = ot.overtime_type === 'passive' ? 'passive' : 'active';
            
            return `
                <div class="list-item">
                    <div class="list-item-header">
                        <span class="list-item-title">${formatTimeRange(ot.start_time, ot.end_time)}</span>
                        <div style="display: flex; gap: 5px; align-items: center;">
                            <span class="overtime-type-badge overtime-type-${overtimeTypeClass}">${overtimeTypeText}</span>
                            <span class="status-badge status-${getStatusClass(ot.status)}">${getOvertimeStatusName(ot.status)}</span>
                        </div>
                    </div>
                    <div class="list-item-content">
                        <div><strong>天数:</strong> ${ot.days}天</div>
                        <div><strong>原因:</strong> ${ot.reason}</div>
                        <div><strong>申请时间:</strong> ${formatDateTime(ot.created_at)}</div>
                        ${pendingApprover ? `<div style="color: #1890ff; margin-top: 5px;"><strong>${pendingApprover}</strong></div>` : ''}
                        <div style="margin-top: 10px; display: flex; gap: 10px;">
                            ${canCancel ? `
                                <button class="btn btn-secondary" style="padding: 5px 15px; font-size: 0.9em; flex: 1;" onclick="cancelOvertimeApplication(${ot.id})">撤回申请</button>
                            ` : ''}
                            ${(ot.status === 'approved' || ot.status === 'rejected') ? `
                                <button class="btn btn-primary" style="padding: 5px 15px; font-size: 0.9em; flex: 1;" onclick="viewOvertimeDetail(${ot.id})">详情</button>
                            ` : ''}
                            ${ot.status === 'cancelled' ? `
                                <button class="btn btn-danger" style="padding: 5px 15px; font-size: 0.9em; flex: 1;" onclick="deleteOvertimeApplication(${ot.id})">删除</button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载加班申请失败:', error);
    }
}

// 加载待审批
async function loadPendingApprovals() {
    switchApprovalTab('leave');
}

// 切换审批标签
async function switchApprovalTab(type) {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach((tab, i) => {
        tab.classList.toggle('active', (type === 'leave' && i === 0) || (type === 'overtime' && i === 1));
    });

    document.getElementById('approval-leave-list').style.display = type === 'leave' ? 'flex' : 'none';
    document.getElementById('approval-overtime-list').style.display = type === 'overtime' ? 'flex' : 'none';

    if (type === 'leave') {
        await loadPendingLeaves();
    } else {
        await loadPendingOvertimes();
    }
}

// 加载待审批请假
async function loadPendingLeaves() {
    try {
        const leaves = await apiRequest('/leave/pending');
        const container = document.getElementById('approval-leave-list');
        
        // 更新请假标签徽章
        const leaveBadge = document.getElementById('leave-tab-badge');
        if (leaveBadge) {
            leaveBadge.textContent = leaves.length;
            leaveBadge.style.display = leaves.length > 0 ? 'inline-block' : 'none';
        }

        if (leaves.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>暂无待审批请假</p></div>';
            return;
        }

        container.innerHTML = leaves.map(leave => `
            <div class="list-item">
                <div class="list-item-header">
                    <span class="list-item-title">${formatTimeRange(leave.start_date, leave.end_date)}</span>
                    <span class="status-badge status-${getStatusClass(leave.status)}">${getLeaveStatusName(leave.status)}</span>
                </div>
                <div class="list-item-content">
                    <div style="display: flex; margin-bottom: 8px;">
                        <div style="flex: 1;"><strong>申请人:</strong> ${leave.applicant_name || `用户${leave.user_id}`}</div>
                        <div style="flex: 1;"><strong>请假天数:</strong> ${leave.days}天</div>
                    </div>
                    <div style="margin-bottom:6px;"><strong>类型:</strong> ${leave.leave_type_name || '普通请假'}</div>
                    <div><strong>原因:</strong> ${leave.reason}</div>
                </div>
                <div class="list-item-footer" style="display: flex; gap: 10px;">
                    <button class="btn btn-primary btn-small" style="flex: 1;" onclick="viewLeaveDetail(${leave.id})">详情</button>
                    <button class="btn btn-success btn-small" style="flex: 1;" onclick="approveLeave(${leave.id}, true)">批准</button>
                    <button class="btn btn-danger btn-small" style="flex: 1;" onclick="approveLeave(${leave.id}, false)">拒绝</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载待审批请假失败:', error);
    }
}

// 加载待审批加班
async function loadPendingOvertimes() {
    try {
        const overtimes = await apiRequest('/overtime/pending');
        const container = document.getElementById('approval-overtime-list');
        
        // 更新加班标签徽章
        const overtimeBadge = document.getElementById('overtime-tab-badge');
        if (overtimeBadge) {
            overtimeBadge.textContent = overtimes.length;
            overtimeBadge.style.display = overtimes.length > 0 ? 'inline-block' : 'none';
        }

        if (overtimes.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>暂无待审批加班</p></div>';
            return;
        }

        container.innerHTML = overtimes.map(ot => {
            // 获取加班类型显示
            const overtimeTypeText = ot.overtime_type === 'passive' ? '被动加班' : '主动加班';
            const overtimeTypeClass = ot.overtime_type === 'passive' ? 'passive' : 'active';
            
            return `
                <div class="list-item">
                    <div class="list-item-header">
                        <span class="list-item-title">${formatTimeRange(ot.start_time, ot.end_time)}</span>
                        <span class="status-badge status-${getStatusClass(ot.status)}">${getOvertimeStatusName(ot.status)}</span>
                    </div>
                    <div class="list-item-content">
                        <div style="display: flex; margin-bottom: 8px;">
                            <div style="flex: 1;"><strong>申请人:</strong> ${ot.applicant_name || `用户${ot.user_id}`}</div>
                            <div style="flex: 1;"><strong>加班天数:</strong> ${ot.days}天</div>
                        </div>
                        <div style="margin-bottom:6px;"><strong>加班性质:</strong> ${overtimeTypeText}</div>
                        <div><strong>原因:</strong> ${ot.reason}</div>
                    </div>
                    <div class="list-item-footer" style="display: flex; gap: 10px;">
                        <button class="btn btn-primary btn-small" style="flex: 1;" onclick="viewOvertimeDetail(${ot.id})">详情</button>
                        <button class="btn btn-success btn-small" style="flex: 1;" onclick="approveOvertime(${ot.id}, true)">批准</button>
                        <button class="btn btn-danger btn-small" style="flex: 1;" onclick="approveOvertime(${ot.id}, false)">拒绝</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载待审批加班失败:', error);
    }
}

// 审批请假
async function approveLeave(id, approved) {
    const title = approved ? '批准请假申请' : '拒绝请假申请';
    const placeholder = approved ? '请输入批准意见（可选）' : '请输入拒绝理由（必填）';
    const comment = await showInputDialog(title, placeholder, !approved);
    
    if (comment === null) return; // 用户取消
    if (!approved && (!comment || !comment.trim())) {
        await showToast('拒绝时必须填写理由', 'warning');
        return;
    }

    try {
        await apiRequest(`/leave/${id}/approve`, {
            method: 'POST',
            body: JSON.stringify({ approved, comment: comment || '' })
        });

        await showToast(approved ? '已批准' : '已拒绝', 'success', { timeout: 2000 });
        // 重新加载当前标签的数据和徽章
        const currentTab = document.querySelector('.tab-btn.active');
        if (currentTab && currentTab.textContent.includes('请假')) {
            await loadPendingLeaves();
        } else {
            await loadPendingOvertimes();
        }
        loadPendingCount();
    } catch (error) {
        await showToast('操作失败: ' + error.message, 'error');
    }
}

// 审批加班
async function approveOvertime(id, approved) {
    const title = approved ? '批准加班申请' : '拒绝加班申请';
    const placeholder = approved ? '请输入批准意见（可选）' : '请输入拒绝理由（必填）';
    const comment = await showInputDialog(title, placeholder, !approved);
    
    if (comment === null) return; // 用户取消
    if (!approved && (!comment || !comment.trim())) {
        await showToast('拒绝时必须填写理由', 'warning');
        return;
    }

    try {
        await apiRequest(`/overtime/${id}/approve`, {
            method: 'POST',
            body: JSON.stringify({ approved, comment: comment || '' })
        });

        await showToast(approved ? '已批准' : '已拒绝', 'success', { timeout: 2000 });
        // 重新加载当前标签的数据和徽章
        const currentTab = document.querySelector('.tab-btn.active');
        if (currentTab && currentTab.textContent.includes('请假')) {
            await loadPendingLeaves();
        } else {
            await loadPendingOvertimes();
        }
        loadPendingCount();
    } catch (error) {
        await showToast('操作失败: ' + error.message, 'error');
    }
}

// 加载我的统计
async function loadMyStats() {
    const monthInput = document.getElementById('stats-month');
    if (!monthInput.value) {
        const now = new Date();
        monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const [year, month] = monthInput.value.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    try {
        const stats = await apiRequest(`/statistics/my?start_date=${startDate}&end_date=${endDate}`);
        const container = document.getElementById('stats-cards');

        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${stats.present_days}</div>
                <div class="stat-label">出勤天数</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.work_hours.toFixed(1)}</div>
                <div class="stat-label">工作时长(h)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.late_days}</div>
                <div class="stat-label">迟到次数</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.early_leave_days}</div>
                <div class="stat-label">早退次数</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.leave_days}</div>
                <div class="stat-label">请假天数</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.overtime_days.toFixed(1)}</div>
                <div class="stat-label">加班天数</div>
            </div>
        `;
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

async function fetchLeaveTypes(force = false) {
    if (leaveTypesCache.length && !force) {
        return leaveTypesCache;
    }
    try {
        leaveTypesCache = await apiRequest('/leave-types/');
    } catch (error) {
        console.error('加载请假类型失败:', error);
        leaveTypesCache = [];
    }
    return leaveTypesCache;
}

// ==================== 请假申请表单 ====================
async function showNewLeaveForm() {
    // 根据用户角色决定是否显示审批人选择器
    const userRole = currentUser?.role;
    const isVicePresident = userRole === 'vice_president';
    
    // 只有副总需要显示审批人选择器
    let vpOptions = '<option value="">默认本人审批</option>';
    let gmOptions = '<option value="">系统自动分配</option>';
    
    if (isVicePresident) {
        try {
            const approvers = await apiRequest('/users/approvers');
            const vps = approvers.filter(u => u.role === 'vice_president');
            const gms = approvers.filter(u => u.role === 'general_manager');
            
            vpOptions += vps.map(vp => `<option value="${vp.id}" ${vp.id === currentUser.id ? 'selected' : ''}>${vp.real_name}</option>`).join('');
            gmOptions += gms.map(gm => `<option value="${gm.id}">${gm.real_name}</option>`).join('');
        } catch (error) {
            console.error('加载审批人列表失败:', error);
        }
    }
    
    // 开始时间节点选项（9:00默认、14:00）
    const startTimeNodes = [
        { value: '09:00', label: '09:00' },
        { value: '14:00', label: '14:00' }
    ];
    const startTimeNodeOptions = startTimeNodes.map(node => 
        `<option value="${node.value}">${node.label}</option>`
    ).join('');
    
    // 结束时间节点选项（12:00、17:30默认）
    const endTimeNodes = [
        { value: '12:00', label: '12:00' },
        { value: '17:30', label: '17:30' }
    ];
    const endTimeNodeOptions = endTimeNodes.map(node => 
        `<option value="${node.value}" ${node.value === '17:30' ? 'selected' : ''}>${node.label}</option>`
    ).join('');
    
    const leaveTypes = await fetchLeaveTypes();
    if (!leaveTypes.length) {
        await showToast('请假类型未配置，请联系管理员', 'warning');
        return;
    }
    const leaveTypeOptions = leaveTypes.map(type => `<option value="${type.id}">${type.name}</option>`).join('');
    
    const modalHtml = `
        <div class="modal-overlay" onclick="closeFormModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>申请请假</h3>
                    <button class="modal-close" onclick="closeFormModal()">×</button>
                </div>
                <form id="leave-form" onsubmit="submitLeaveForm(event)">
                    <div class="form-group inline-field">
                        <label class="form-label">请假类型 *</label>
                        <select id="leave-type-select" class="form-input" required onchange="onLeaveTypeChange()">
                            <option value="">请选择</option>
                            ${leaveTypeOptions}
                        </select>
                    </div>
                    <div id="annual-leave-info" class="annual-leave-info" style="display: none;"></div>
                    <div class="form-row">
                        <div class="form-group form-group-date">
                            <label class="form-label">开始日期 *</label>
                            <input type="date" id="leave-start-date" class="form-input" onchange="calculateLeaveDays()" required>
                        </div>
                        <div class="form-group form-group-time">
                            <label class="form-label">时间 *</label>
                            <select id="leave-start-time-node" class="form-input" onchange="calculateLeaveDays()" required>
                                <option value="09:00" selected>09:00</option>
                                <option value="14:00">14:00</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group form-group-date">
                            <label class="form-label">结束日期 *</label>
                            <input type="date" id="leave-end-date" class="form-input" onchange="calculateLeaveDays()" required>
                        </div>
                        <div class="form-group form-group-time">
                            <label class="form-label">时间 *</label>
                            <select id="leave-end-time-node" class="form-input" onchange="calculateLeaveDays()" required>
                                <option value="12:00">12:00</option>
                                <option value="17:30" selected>17:30</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">计算出的请假天数</label>
                        <div id="leave-calculated-days" style="padding: 10px; background: #f5f5f5; border-radius: 4px; font-size: 1.1em; font-weight: bold;">0 天</div>
                        <small style="color: #888; font-size: 0.9em;">系统根据日期和时间节点自动计算</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">请假原因 *</label>
                        <textarea id="leave-reason" class="form-input" rows="4" required placeholder="请输入请假原因"></textarea>
                    </div>
                    ${isVicePresident ? `
                    <div class="form-group" id="leave-vp-selector">
                        <label class="form-label">指定副总审批人（可选）</label>
                        <select id="leave-assigned-vp" class="form-input">
                            ${vpOptions}
                        </select>
                        <small style="color: #888; font-size: 0.9em;">默认本人审批，可选择其他副总</small>
                    </div>
                    <div class="form-group" id="leave-gm-selector" style="display: none;">
                        <label class="form-label">指定总经理审批人（可选）</label>
                        <select id="leave-assigned-gm" class="form-input">
                            ${gmOptions}
                        </select>
                        <small style="color: #888; font-size: 0.9em;">留空则系统自动分配</small>
                    </div>
                    ` : ''}
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeFormModal()">取消</button>
                        <button type="submit" class="btn btn-primary">提交申请</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('modal-container').innerHTML = modalHtml;
    
    // 设置默认日期为今天（使用本地时间）
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    document.getElementById('leave-start-date').value = today;
    document.getElementById('leave-end-date').value = today;
    
    // 加载年假使用情况
    await loadAnnualLeaveInfo();
    
    // 检查是否已经选择了"年假调休"类型，如果是则显示年假信息
    setTimeout(() => {
        onLeaveTypeChange();
    }, 100);
    
    // 初始计算请假天数
    calculateLeaveDays();
}

// 加载年假使用情况
let annualLeaveInfo = null;

async function loadAnnualLeaveInfo() {
    try {
        const info = await apiRequest('/users/me/annual-leave');
        annualLeaveInfo = info;
    } catch (error) {
        console.error('加载年假信息失败:', error);
        annualLeaveInfo = null;
    }
}

// 请假类型变更处理
function onLeaveTypeChange() {
    const leaveTypeSelect = document.getElementById('leave-type-select');
    const annualLeaveInfoDiv = document.getElementById('annual-leave-info');
    
    if (!leaveTypeSelect || !annualLeaveInfoDiv) {
        return;
    }
    
    const selectedOption = leaveTypeSelect.options[leaveTypeSelect.selectedIndex];
    const leaveTypeName = selectedOption ? selectedOption.text : '';
    const isAnnualLeave = leaveTypeName === '年假调休';
    
    if (isAnnualLeave && annualLeaveInfo) {
        // 显示年假信息
        annualLeaveInfoDiv.textContent = `您本年度年假共计${annualLeaveInfo.total_days}天，已调休${annualLeaveInfo.used_days}天，剩余${annualLeaveInfo.remaining_days}天`;
        annualLeaveInfoDiv.style.display = 'block';
    } else {
        // 隐藏年假信息
        annualLeaveInfoDiv.style.display = 'none';
    }
}

// 计算请假天数（mobile端）
function calculateLeaveDays() {
    const startDate = document.getElementById('leave-start-date')?.value;
    const startTimeNode = document.getElementById('leave-start-time-node')?.value;
    const endDate = document.getElementById('leave-end-date')?.value;
    const endTimeNode = document.getElementById('leave-end-time-node')?.value;
    const calculatedDaysDiv = document.getElementById('leave-calculated-days');
    
    if (!startDate || !startTimeNode || !endDate || !endTimeNode || !calculatedDaysDiv) {
        if (calculatedDaysDiv) calculatedDaysDiv.textContent = '0 天';
        return;
    }
    
    // 确保日期格式正确
    const normalizedStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    const normalizedEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;
    
    const startDateObj = new Date(normalizedStartDate + 'T00:00:00');
    const endDateObj = new Date(normalizedEndDate + 'T00:00:00');
    
    if (endDateObj < startDateObj) {
        calculatedDaysDiv.textContent = '0 天';
        return;
    }
    
    const days = calculateLeaveDaysByRules(normalizedStartDate, startTimeNode, normalizedEndDate, endTimeNode);
    calculatedDaysDiv.textContent = days.toFixed(1) + ' 天';
    
    // 更新审批人选择器可见性
    updateLeaveApproverVisibility();
}

// 根据规则计算请假天数
function calculateLeaveDaysByRules(startDate, startTime, endDate, endTime) {
    // 确保日期格式正确（YYYY-MM-DD）
    const normalizedStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    const normalizedEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;
    
    // 如果是同一天
    if (normalizedStartDate === normalizedEndDate) {
        return calculateSingleDayLeave(startTime, endTime);
    }
    
    // 跨天情况
    let totalDays = 0;
    
    // 使用标准日期格式，避免时区问题
    const startDateObj = new Date(normalizedStartDate + 'T00:00:00');
    const endDateObj = new Date(normalizedEndDate + 'T00:00:00');
    const currentDate = new Date(startDateObj);
    
    // 格式化日期字符串用于比较（YYYY-MM-DD格式）
    const formatDateStr = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    const startDateStr = formatDateStr(startDateObj);
    const endDateStr = formatDateStr(endDateObj);
    
    // 确保循环能正确执行
    let loopCount = 0;
    const maxLoops = 100; // 防止无限循环
    
    while (currentDate <= endDateObj && loopCount < maxLoops) {
        const currentDateStr = formatDateStr(currentDate);
        
        if (currentDateStr === startDateStr) {
            // 起始日：根据开始时间节点计算
            // 9点开始算请假的，起始日算一天
            // 14点开始算请假的，算半天
            let firstDayDays = 0;
            if (startTime === '09:00') {
                firstDayDays = 1.0;
            } else if (startTime === '14:00') {
                firstDayDays = 0.5;
            }
            totalDays += firstDayDays;
        } else if (currentDateStr === endDateStr) {
            // 结尾日：根据结束时间节点计算
            // 到12点的算半天
            // 到17:30的算一天
            let lastDayDays = 0;
            if (endTime === '12:00') {
                lastDayDays = 0.5;
            } else if (endTime === '17:30') {
                lastDayDays = 1.0;
            }
            totalDays += lastDayDays;
        } else {
            // 中间天数：每天的算一天
            totalDays += 1.0;
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
        loopCount++;
    }
    
    return Math.round(totalDays * 10) / 10;
}

// 计算单一天的请假天数
function calculateSingleDayLeave(startTime, endTime) {
    // 单日请假规则：
    // 9:00-12:00 = 0.5天
    // 14:00-17:30 = 0.5天
    // 9:00-17:30 = 1天
    
    if (startTime === '09:00' && endTime === '12:00') {
        return 0.5;
    } else if (startTime === '14:00' && endTime === '17:30') {
        return 0.5;
    } else if (startTime === '09:00' && endTime === '17:30') {
        return 1.0;
    }
    
    return 0;
}

// 根据请假天数显示/隐藏审批人选择器（仅对副总显示）
function updateLeaveApproverVisibility() {
    const calculatedDaysDiv = document.getElementById('leave-calculated-days');
    const vpSelector = document.getElementById('leave-vp-selector');
    const gmSelector = document.getElementById('leave-gm-selector');
    
    if (!calculatedDaysDiv) return;
    
    const userRole = currentUser?.role;
    const isVicePresident = userRole === 'vice_president';
    
    // 只有副总才显示审批人选择器
    if (!isVicePresident) {
        if (vpSelector) vpSelector.style.display = 'none';
        if (gmSelector) gmSelector.style.display = 'none';
        return;
    }
    
    const daysText = calculatedDaysDiv.textContent.replace(' 天', '');
    const days = parseFloat(daysText) || 0;
    
    // 副总请假：3天以上需要总经理审批
    if (gmSelector) {
        if (days > 3) {
            gmSelector.style.display = 'block';
        } else {
            gmSelector.style.display = 'none';
        }
    }
}

async function submitLeaveForm(event) {
    event.preventDefault();
    
    const startDate = document.getElementById('leave-start-date').value;
    const startTimeNode = document.getElementById('leave-start-time-node').value;
    const endDate = document.getElementById('leave-end-date').value;
    const endTimeNode = document.getElementById('leave-end-time-node').value;
    const reason = document.getElementById('leave-reason').value;
    const calculatedDaysDiv = document.getElementById('leave-calculated-days');
    const leaveTypeId = document.getElementById('leave-type-select')?.value;
    const assignedVpId = document.getElementById('leave-assigned-vp')?.value || '';
    const assignedGmId = document.getElementById('leave-assigned-gm')?.value || '';
    
    if (!startDate || !startTimeNode || !endDate || !endTimeNode || !reason || !leaveTypeId) {
        await showToast('请填写所有必填项', 'warning');
        return;
    }
    
    // 确保日期格式正确
    const normalizedStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    const normalizedEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;
    
    const startDateObj = new Date(normalizedStartDate + 'T00:00:00');
    const endDateObj = new Date(normalizedEndDate + 'T00:00:00');
    
    if (endDateObj < startDateObj) {
        await showToast('结束日期不能早于开始日期', 'warning');
        return;
    }
    
    // 获取计算出的请假天数
    const calculatedDaysText = calculatedDaysDiv?.textContent || '0 天';
    const days = parseFloat(calculatedDaysText.replace(' 天', ''));
    
    if (days <= 0) {
        await showToast('请选择有效的时间节点', 'warning');
        return;
    }
    
    // 构建开始和结束日期时间
    const startDateTime = `${normalizedStartDate}T${startTimeNode}:00`;
    const endDateTime = `${normalizedEndDate}T${endTimeNode}:00`;
    
    const requestData = {
        start_date: startDateTime,
        end_date: endDateTime,
        days: days,
        reason: reason,
        leave_type_id: parseInt(leaveTypeId)
    };
    
    // 如果指定了审批人，添加到请求中
    if (assignedVpId) {
        requestData.assigned_vp_id = parseInt(assignedVpId);
    }
    if (assignedGmId) {
        requestData.assigned_gm_id = parseInt(assignedGmId);
    }
    
    try {
        await apiRequest('/leave/', {
            method: 'POST',
            body: JSON.stringify(requestData)
        });
        
        await showToast('请假申请提交成功！', 'success', { timeout: 2000 });
        closeFormModal();
        loadMyLeaveApplications();
        loadMyPendingCounts();  // 更新未完成申请数量徽章
    } catch (error) {
        await showToast('提交失败: ' + error.message, 'error');
    }
}

// ==================== 加班申请表单 ====================
function showNewOvertimeForm() {
    // 起点时间节点选项（只可选：9:00, 14:00, 17:30）
    const startTimeNodes = [
        { value: '09:00', label: '09:00' },
        { value: '14:00', label: '14:00' },
        { value: '17:30', label: '17:30' }
    ];
    
    // 终点时间节点选项（可选：12:00, 17:30, 20:00, 22:00）
    const endTimeNodes = [
        { value: '12:00', label: '12:00' },
        { value: '17:30', label: '17:30' },
        { value: '20:00', label: '20:00' },
        { value: '22:00', label: '22:00' }
    ];
    
    const startTimeNodeOptions = startTimeNodes.map(n => `<option value="${n.value}">${n.label}</option>`).join('');
    const endTimeNodeOptions = endTimeNodes.map(n => `<option value="${n.value}">${n.label}</option>`).join('');
    
    const modalHtml = `
        <div class="modal-overlay" onclick="closeFormModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>申请加班</h3>
                    <button class="modal-close" onclick="closeFormModal()">×</button>
                </div>
                <form id="overtime-form" onsubmit="submitOvertimeForm(event)">
                    <div class="form-row">
                        <div class="form-group" style="flex: 1; margin-right: 10px;">
                            <label class="form-label">加班性质 *</label>
                            <select id="overtime-nature" class="form-input" required>
                                <option value="">请选择</option>
                                <option value="active">主动加班</option>
                                <option value="passive">被动加班</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex: 1;">
                            <label class="form-label">加班类型 *</label>
                            <select id="overtime-type" class="form-input" onchange="handleOvertimeTypeChange()" required>
                                <option value="">请选择</option>
                                <option value="single" selected>单日</option>
                                <option value="multi">多日</option>
                            </select>
                        </div>
                    </div>
                    <small style="color: #888; font-size: 0.9em; display: block; margin-bottom: 15px;">主动加班：员工主动申请；被动加班：领导安排</small>
                    
                    <!-- 单日加班 -->
                    <div id="single-day-section" style="display: none;">
                        <div class="form-group">
                            <label class="form-label">加班日期 *</label>
                            <input type="date" id="overtime-date" class="form-input" onchange="calculateOvertimeDays()">
                        </div>
                        <div class="form-group">
                            <label class="form-label">加班时间 *</label>
                            <div class="time-row">
                                <div class="time-item">
                                    <select id="overtime-start-time-node" class="form-input" onchange="calculateOvertimeDays()">
                                        <option value="">请选择</option>
                                        ${startTimeNodeOptions}
                                    </select>
                                </div>
                                <div class="time-separator">-</div>
                                <div class="time-item">
                                    <select id="overtime-end-time-node" class="form-input" onchange="calculateOvertimeDays()">
                                        <option value="">请选择</option>
                                        ${endTimeNodeOptions}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">计算出的加班天数</label>
                            <div id="overtime-calculated-days" style="padding: 10px; background: #f5f5f5; border-radius: 4px; font-size: 1.1em; font-weight: bold;">0 天</div>
                            <small style="color: #888; font-size: 0.9em;">系统根据时间节点自动计算</small>
                        </div>
                    </div>
                    
                    <!-- 多日加班 -->
                    <div id="multi-day-section" style="display: none;">
                        <div class="form-group">
                            <label class="form-label">开始时间 *</label>
                            <div class="date-time-row">
                                <div class="date-item">
                                    <input type="date" id="overtime-start-date" class="form-input" onchange="calculateOvertimeDays()">
                                </div>
                                <div class="time-item">
                                    <select id="overtime-start-date-time-node" class="form-input" onchange="calculateOvertimeDays()">
                                        <option value="">请选择</option>
                                        ${startTimeNodeOptions}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">结束时间 *</label>
                            <div class="date-time-row">
                                <div class="date-item">
                                    <input type="date" id="overtime-end-date" class="form-input" onchange="calculateOvertimeDays()">
                                </div>
                                <div class="time-item">
                                    <select id="overtime-end-date-time-node" class="form-input" onchange="calculateOvertimeDays()">
                                        <option value="">请选择</option>
                                        ${endTimeNodeOptions}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">计算出的加班天数</label>
                            <div id="overtime-calculated-days" style="padding: 10px; background: #f5f5f5; border-radius: 4px; font-size: 1.1em; font-weight: bold;">0 天</div>
                            <small style="color: #888; font-size: 0.9em;">系统根据日期和时间节点自动计算</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label">手动调节加班天数（可选）</label>
                            <div style="display: flex; align-items: center; margin: 10px 0;">
                                <input type="checkbox" id="overtime-use-manual-days" onchange="handleManualDaysToggle()" style="margin-right: 8px; width: 18px; height: 18px;">
                                <label for="overtime-use-manual-days" style="font-size: 14px; color: #666; cursor: pointer;">启用手动调节</label>
                            </div>
                            <div id="overtime-manual-days-container" style="display: none; margin-top: 15px;">
                                <input 
                                    type="number" 
                                    id="overtime-manual-days" 
                                    class="form-input" 
                                    placeholder="请输入加班天数（整数或x.5）"
                                    step="0.5"
                                    min="0"
                                    oninput="validateManualDays(this)"
                                    onchange="calculateOvertimeDays()"
                                />
                                <small style="color: #888; font-size: 0.9em; display: block; margin-top: 5px;">手动输入加班天数，将覆盖自动计算结果（只能输入整数天或x.5天）</small>
                                <small id="overtime-manual-days-error" style="color: #ff4d4f; font-size: 0.9em; display: none; margin-top: 5px;">加班天数只能是整数或x.5天（如：1、1.5、2、2.5）</small>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">加班原因 *</label>
                        <textarea id="overtime-reason" class="form-input" rows="4" required placeholder="请输入加班原因"></textarea>
                    </div>
                    
                    ${currentUser?.role === 'vice_president' ? `
                    <div class="form-group">
                        <label class="form-label">指定副总审批人（可选）</label>
                        <select id="overtime-assigned-approver" class="form-input">
                            <option value="">默认本人审批</option>
                        </select>
                        <small style="color: #888; font-size: 0.9em;">默认本人审批，可选择其他副总</small>
                    </div>
                    ` : ''}
                    
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeFormModal()">取消</button>
                        <button type="submit" class="btn btn-primary">提交申请</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('modal-container').innerHTML = modalHtml;
    
    // 设置默认日期为今天（使用本地时间）
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    
    const dateInput = document.getElementById('overtime-date');
    const startDateInput = document.getElementById('overtime-start-date');
    const endDateInput = document.getElementById('overtime-end-date');
    if (dateInput) {
        dateInput.value = today;
        dateInput.setAttribute('value', today); // 确保默认值设置
    }
    if (startDateInput) {
        startDateInput.value = today;
        startDateInput.setAttribute('value', today);
        // 添加日期联动事件监听器
        startDateInput.addEventListener('change', function() {
            if (endDateInput) {
                endDateInput.value = this.value;
            }
            calculateOvertimeDays();
        });
    }
    if (endDateInput) {
        endDateInput.value = today;
        endDateInput.setAttribute('value', today);
    }
    
    // 设置默认值：加班类型为单日
    const overtimeTypeSelect = document.getElementById('overtime-type');
    if (overtimeTypeSelect) {
        overtimeTypeSelect.value = 'single';
        // 触发change事件以显示单日表单
        handleOvertimeTypeChange();
    }
    
    setDefaultSingleOvertimeNodes();
    setDefaultMultiOvertimeNodes();
    
    // 加载审批人列表
    loadOvertimeApprovers();
}

// 加载加班申请的审批人列表（仅副总需要）
async function loadOvertimeApprovers() {
    const approverSelect = document.getElementById('overtime-assigned-approver');
    if (!approverSelect) return;
    
    const userRole = currentUser?.role;
    if (userRole !== 'vice_president') return;
    
    try {
        const approvers = await apiRequest('/users/approvers');
        const vps = approvers.filter(u => u.role === 'vice_president');
        
        let options = '<option value="">默认本人审批</option>';
        options += vps.map(vp => `<option value="${vp.id}" ${vp.id === currentUser.id ? 'selected' : ''}>${vp.real_name}</option>`).join('');
        
        approverSelect.innerHTML = options;
    } catch (error) {
        console.error('加载审批人列表失败:', error);
    }
}

function handleOvertimeTypeChange() {
    const type = document.getElementById('overtime-type').value;
    const singleSection = document.getElementById('single-day-section');
    const multiSection = document.getElementById('multi-day-section');
    
    // 重置显示
    if (singleSection) singleSection.style.display = 'none';
    if (multiSection) multiSection.style.display = 'none';
    
    if (type === 'single') {
        if (singleSection) singleSection.style.display = 'block';
        setDefaultSingleOvertimeNodes();
    } else if (type === 'multi') {
        if (multiSection) multiSection.style.display = 'block';
        setDefaultMultiOvertimeNodes();
    }
    
    calculateOvertimeDays();
}

function setDefaultSingleOvertimeNodes() {
    const startSelect = document.getElementById('overtime-start-time-node');
    const endSelect = document.getElementById('overtime-end-time-node');
    let updated = false;
    
    if (startSelect && !startSelect.value) {
        startSelect.value = '09:00';
        updated = true;
    }
    
    if (endSelect && !endSelect.value) {
        endSelect.value = '17:30';
        updated = true;
    }
    
    if (updated && document.getElementById('overtime-type')?.value === 'single') {
        calculateOvertimeDays();
    }
}

function setDefaultMultiOvertimeNodes() {
    const startSelect = document.getElementById('overtime-start-date-time-node');
    const endSelect = document.getElementById('overtime-end-date-time-node');
    let updated = false;
    
    if (startSelect && !startSelect.value) {
        startSelect.value = '09:00';
        updated = true;
    }
    
    if (endSelect && !endSelect.value) {
        endSelect.value = '17:30';
        updated = true;
    }
    
    if (updated && document.getElementById('overtime-type')?.value === 'multi') {
        calculateOvertimeDays();
    }
}

// 计算加班天数（mobile端）
function calculateOvertimeDays() {
    const type = document.getElementById('overtime-type')?.value;
    
    // 根据类型获取对应的显示元素（单日和多日各有一个）
    let calculatedDaysDiv = null;
    if (type === 'single') {
        const singleSection = document.getElementById('single-day-section');
        if (singleSection) {
            calculatedDaysDiv = singleSection.querySelector('#overtime-calculated-days');
        }
    } else if (type === 'multi') {
        const multiSection = document.getElementById('multi-day-section');
        if (multiSection) {
            calculatedDaysDiv = multiSection.querySelector('#overtime-calculated-days');
        }
    }
    
    // 如果找不到，尝试直接获取（兼容旧代码）
    if (!calculatedDaysDiv) {
        calculatedDaysDiv = document.getElementById('overtime-calculated-days');
    }
    
    if (!type || !calculatedDaysDiv) {
        return;
    }
    
    let days = 0;
    
    if (type === 'single') {
        const date = document.getElementById('overtime-date')?.value;
        const startTimeNode = document.getElementById('overtime-start-time-node')?.value;
        const endTimeNode = document.getElementById('overtime-end-time-node')?.value;
        
        if (!date || !startTimeNode || !endTimeNode) {
            calculatedDaysDiv.textContent = '0 天';
            return;
        }
        
        days = calculateOvertimeDaysByRules(date, startTimeNode, date, endTimeNode);
    } else if (type === 'multi') {
        const startDate = document.getElementById('overtime-start-date')?.value;
        const startDateTimeNode = document.getElementById('overtime-start-date-time-node')?.value;
        const endDate = document.getElementById('overtime-end-date')?.value;
        const endDateTimeNode = document.getElementById('overtime-end-date-time-node')?.value;
        const useManualDays = document.getElementById('overtime-use-manual-days')?.checked;
        const manualDays = document.getElementById('overtime-manual-days')?.value;
        
        if (!startDate || !startDateTimeNode || !endDate || !endDateTimeNode) {
            calculatedDaysDiv.textContent = '0 天';
            return;
        }
        
        // 确保日期格式正确
        const normalizedStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
        const normalizedEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;
        
        const startDateObj = new Date(normalizedStartDate + 'T00:00:00');
        const endDateObj = new Date(normalizedEndDate + 'T00:00:00');
        
        if (endDateObj < startDateObj) {
            calculatedDaysDiv.textContent = '0 天';
            return;
        }
        
        // 如果使用手动调节的天数
        if (useManualDays && manualDays && parseFloat(manualDays) > 0) {
            days = parseFloat(manualDays);
        } else {
            days = calculateOvertimeDaysByRules(normalizedStartDate, startDateTimeNode, normalizedEndDate, endDateTimeNode);
        }
    }
    
    // 更新显示
    const displayText = days.toFixed(1) + ' 天';
    calculatedDaysDiv.textContent = displayText;
}

// 验证手动调节的天数（只能是整数或x.5天）
function validateManualDays(input) {
    const value = input.value;
    const errorEl = document.getElementById('overtime-manual-days-error');
    
    if (!value || value === '') {
        if (errorEl) errorEl.style.display = 'none';
        return true;
    }
    
    const numValue = parseFloat(value);
    
    // 检查是否为有效数字
    if (isNaN(numValue) || numValue <= 0) {
        if (errorEl) errorEl.style.display = 'block';
        return false;
    }
    
    // 检查是否为整数或x.5（即0.5的倍数）
    const remainder = numValue % 0.5;
    if (remainder !== 0 && Math.abs(remainder - 0.5) > 0.001) {
        // 不是0.5的倍数，自动修正为最接近的0.5倍数
        const rounded = Math.round(numValue * 2) / 2;
        input.value = rounded.toFixed(1);
        if (errorEl) errorEl.style.display = 'none';
        return true;
    }
    
    if (errorEl) errorEl.style.display = 'none';
    return true;
}

// 处理手动调节开关切换（mobile端）
function handleManualDaysToggle() {
    const useManual = document.getElementById('overtime-use-manual-days')?.checked;
    const container = document.getElementById('overtime-manual-days-container');
    const manualDaysInput = document.getElementById('overtime-manual-days');
    
    // 根据类型获取对应的显示元素
    const type = document.getElementById('overtime-type')?.value;
    let calculatedDaysDiv = null;
    if (type === 'multi') {
        const multiSection = document.getElementById('multi-day-section');
        if (multiSection) {
            calculatedDaysDiv = multiSection.querySelector('#overtime-calculated-days');
        }
    }
    if (!calculatedDaysDiv) {
        calculatedDaysDiv = document.getElementById('overtime-calculated-days');
    }
    
    if (container) {
        container.style.display = useManual ? 'block' : 'none';
    }
    
    if (useManual && manualDaysInput && calculatedDaysDiv) {
        // 如果启用手动调节，使用当前计算值作为初始值
        const currentDays = calculatedDaysDiv.textContent.replace(' 天', '');
        manualDaysInput.value = currentDays;
        // 验证初始值
        validateManualDays(manualDaysInput);
    }
    
    // 重新计算以应用手动值
    calculateOvertimeDays();
}

// 根据规则计算加班天数
function calculateOvertimeDaysByRules(startDate, startTime, endDate, endTime) {
    // 确保日期格式正确（YYYY-MM-DD）
    const normalizedStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    const normalizedEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;
    
    const startDateTime = new Date(`${normalizedStartDate}T${startTime}:00`);
    const endDateTime = new Date(`${normalizedEndDate}T${endTime}:00`);

    if (endDateTime <= startDateTime) {
        return 0;
    }

    // 如果是同一天
    if (normalizedStartDate === normalizedEndDate) {
        return calculateSingleDayOvertime(startTime, endTime);
    }

    // 跨天情况
    let totalDays = 0;
    
    // 使用标准日期格式，避免时区问题
    const startDateObj = new Date(normalizedStartDate + 'T00:00:00');
    const endDateObj = new Date(normalizedEndDate + 'T00:00:00');
    const currentDate = new Date(startDateObj);
    
    // 格式化日期字符串用于比较（YYYY-MM-DD格式）
    const formatDateStr = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    const startDateStr = formatDateStr(startDateObj);
    const endDateStr = formatDateStr(endDateObj);

    // 确保循环能正确执行
    let loopCount = 0;
    const maxLoops = 100; // 防止无限循环

    while (currentDate <= endDateObj && loopCount < maxLoops) {
        const currentDateStr = formatDateStr(currentDate);
        
        if (currentDateStr === startDateStr) {
            // 起始日：根据开始时间节点计算
            // 9点开始算加班的，起始日算一天
            // 14点开始算加班的，算半天
            // 17:30开始算加班的，也算半天
            let firstDayDays = 0;
            if (startTime === '09:00') {
                firstDayDays = 1.0;
            } else if (startTime === '14:00') {
                firstDayDays = 0.5;
            } else if (startTime === '17:30') {
                firstDayDays = 0.5;
            }
            totalDays += firstDayDays;
        } else if (currentDateStr === endDateStr) {
            // 结尾日：根据结束时间节点计算
            // 到12点的算半天
            // 到5点半（17:30）的算一天
            // 到20点的算1.5天
            // 到22点的算2天
            let lastDayDays = 0;
            if (endTime === '12:00') {
                lastDayDays = 0.5;
            } else if (endTime === '17:30') {
                lastDayDays = 1.0;
            } else if (endTime === '20:00') {
                lastDayDays = 1.5;
            } else if (endTime === '22:00') {
                lastDayDays = 2.0;
            }
            totalDays += lastDayDays;
        } else {
            // 中间天数：每天的算一天
            totalDays += 1.0;
        }

        currentDate.setDate(currentDate.getDate() + 1);
        loopCount++;
    }

    return Math.round(totalDays * 10) / 10;
}

// 计算单一天的加班天数
function calculateSingleDayOvertime(startTime, endTime) {
    // 定义时间段
    const morningStart = { hour: 9, minute: 0 };
    const morningEnd = { hour: 12, minute: 0 };
    const afternoonStart = { hour: 14, minute: 0 };
    const afternoonEnd = { hour: 17, minute: 30 };
    const eveningFirstStart = { hour: 17, minute: 30 };
    const eveningFirstEnd = { hour: 20, minute: 0 };
    const eveningSecondStart = { hour: 20, minute: 0 };
    const eveningSecondEnd = { hour: 22, minute: 0 };

    // 解析时间
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (endMinutes <= startMinutes) {
        return 0;
    }

    let days = 0;

    // 检查上午时段（09:00-12:00）
    const morningStartMin = morningStart.hour * 60 + morningStart.minute;
    const morningEndMin = morningEnd.hour * 60 + morningEnd.minute;
    const morningOverlap = calculateTimeOverlapForMobile(
        startMinutes, endMinutes, morningStartMin, morningEndMin
    );
    if (morningOverlap >= 120) { // 2小时 = 120分钟
        days += 0.5;
    }

    // 检查下午时段（14:00-17:30）
    const afternoonStartMin = afternoonStart.hour * 60 + afternoonStart.minute;
    const afternoonEndMin = afternoonEnd.hour * 60 + afternoonEnd.minute;
    const afternoonOverlap = calculateTimeOverlapForMobile(
        startMinutes, endMinutes, afternoonStartMin, afternoonEndMin
    );
    if (afternoonOverlap >= 150) { // 2.5小时 = 150分钟
        days += 0.5;
    }

    // 检查晚上第一段（17:30-20:00）
    const eveningFirstStartMin = eveningFirstStart.hour * 60 + eveningFirstStart.minute;
    const eveningFirstEndMin = eveningFirstEnd.hour * 60 + eveningFirstEnd.minute;
    const eveningFirstOverlap = calculateTimeOverlapForMobile(
        startMinutes, endMinutes, eveningFirstStartMin, eveningFirstEndMin
    );
    if (eveningFirstOverlap >= 90) { // 1.5小时 = 90分钟
        days += 0.5;
    }

    // 检查晚上第二段（20:00-22:00）
    const eveningSecondStartMin = eveningSecondStart.hour * 60 + eveningSecondStart.minute;
    const eveningSecondEndMin = eveningSecondEnd.hour * 60 + eveningSecondEnd.minute;
    const eveningSecondOverlap = calculateTimeOverlapForMobile(
        startMinutes, endMinutes, eveningSecondStartMin, eveningSecondEndMin
    );
    if (eveningSecondOverlap >= 90) { // 1.5小时 = 90分钟
        days += 0.5;
    }

    return Math.round(days * 10) / 10;
}

// 计算时间重叠（分钟）- mobile端
function calculateTimeOverlapForMobile(start1, end1, start2, end2) {
    const overlapStart = Math.max(start1, start2);
    const overlapEnd = Math.min(end1, end2);
    return Math.max(0, overlapEnd - overlapStart);
}

// 获取实际开始时间（如果早于09:00，则从09:00开始）- mobile端
function getActualStartTime(startTime) {
    const [hour, minute] = startTime.split(':').map(Number);
    const startMinutes = hour * 60 + minute;
    const earliestMinutes = 9 * 60; // 09:00
    
    if (startMinutes < earliestMinutes) {
        return '09:00';
    }
    return startTime;
}

async function submitOvertimeForm(event) {
    event.preventDefault();
    
    const nature = document.getElementById('overtime-nature').value;
    const type = document.getElementById('overtime-type').value;
    const reason = document.getElementById('overtime-reason').value;
    
    if (!nature || !type || !reason) {
        await showToast('请填写所有必填项', 'warning');
        return;
    }
    
    let startTime, endTime, hours, days;
    
    // 根据类型获取对应的显示元素（单日和多日各有一个）
    let calculatedDaysDiv = null;
    if (type === 'single') {
        const singleSection = document.getElementById('single-day-section');
        if (singleSection) {
            calculatedDaysDiv = singleSection.querySelector('#overtime-calculated-days');
        }
    } else if (type === 'multi') {
        const multiSection = document.getElementById('multi-day-section');
        if (multiSection) {
            calculatedDaysDiv = multiSection.querySelector('#overtime-calculated-days');
        }
    }
    
    // 如果找不到，尝试直接获取（兼容旧代码）
    if (!calculatedDaysDiv) {
        calculatedDaysDiv = document.getElementById('overtime-calculated-days');
    }
    
    if (type === 'single') {
        const date = document.getElementById('overtime-date').value;
        const startTimeNode = document.getElementById('overtime-start-time-node').value;
        const endTimeNode = document.getElementById('overtime-end-time-node').value;
        
        if (!date || !startTimeNode || !endTimeNode) {
            await showToast('请填写完整的单日加班信息', 'warning');
            return;
        }
        
        startTime = `${date}T${startTimeNode}:00`;
        endTime = `${date}T${endTimeNode}:00`;
        
        // 单日加班：获取计算出的天数
        const calculatedDaysText = calculatedDaysDiv?.textContent || '0 天';
        days = parseFloat(calculatedDaysText.replace(' 天', ''));
    } else if (type === 'multi') {
        const startDate = document.getElementById('overtime-start-date').value;
        const startDateTimeNode = document.getElementById('overtime-start-date-time-node').value;
        const endDate = document.getElementById('overtime-end-date').value;
        const endDateTimeNode = document.getElementById('overtime-end-date-time-node').value;
        
        if (!startDate || !startDateTimeNode || !endDate || !endDateTimeNode) {
            await showToast('请填写完整的多日加班信息', 'warning');
            return;
        }
        
        startTime = `${startDate}T${startDateTimeNode}:00`;
        endTime = `${endDate}T${endDateTimeNode}:00`;
        
        // 确定最终使用的天数（手动调节或自动计算）
        const useManualDays = document.getElementById('overtime-use-manual-days')?.checked;
        const manualDaysInput = document.getElementById('overtime-manual-days');
        const manualDays = manualDaysInput?.value;
        
        if (useManualDays && manualDays) {
            const manualDaysValue = parseFloat(manualDays);
            // 验证手动输入的天数是否符合规则（整数或x.5）
            if (isNaN(manualDaysValue) || manualDaysValue <= 0) {
                await showToast('请输入有效的加班天数', 'warning');
                return;
            }
            const remainder = manualDaysValue % 0.5;
            if (remainder !== 0 && Math.abs(remainder - 0.5) > 0.001) {
                await showToast('加班天数只能是整数或x.5天（如：1、1.5、2、2.5）', 'warning');
                return;
            }
            days = manualDaysValue;
        } else {
            const calculatedDaysText = calculatedDaysDiv?.textContent || '0 天';
            days = parseFloat(calculatedDaysText.replace(' 天', ''));
        }
    }
    
    // 计算小时数
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    // 验证日期是否有效
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        await showToast('日期时间格式错误，请重新选择', 'warning');
        return;
    }
    
    hours = (end - start) / (1000 * 60 * 60);
    
    // 验证小时数和天数
    if (isNaN(hours) || hours < 0) {
        await showToast('计算小时数失败，请检查时间节点', 'warning');
        return;
    }
    
    if (isNaN(days) || days <= 0) {
        await showToast('请选择有效的时间节点', 'warning');
        return;
    }
    
    // 验证原因
    if (!reason || reason.trim() === '') {
        await showToast('请填写加班原因', 'warning');
        return;
    }
    
    const assignedApproverId = document.getElementById('overtime-assigned-approver')?.value || '';
    
    // 确保日期时间格式正确（ISO 8601格式）
    const formatDateTime = (dateTimeStr) => {
        // 如果已经是正确的格式，直接返回
        if (dateTimeStr.includes('T') && dateTimeStr.length >= 16) {
            return dateTimeStr;
        }
        // 否则尝试修复格式
        const date = new Date(dateTimeStr);
        if (isNaN(date.getTime())) {
            return dateTimeStr; // 如果无法解析，返回原值
        }
        // 格式化为 ISO 8601 格式
        return date.toISOString().slice(0, 19); // 移除毫秒和时区
    };
    
    const requestData = {
        start_time: formatDateTime(startTime),
        end_time: formatDateTime(endTime),
        hours: parseFloat(hours.toFixed(2)), // 保留两位小数
        days: parseFloat(days.toFixed(1)), // 保留一位小数
        reason: reason.trim(),
        overtime_type: nature // 添加加班类型字段
    };
    
    // 如果指定了审批人，添加到请求中
    if (assignedApproverId) {
        const approverId = parseInt(assignedApproverId);
        if (!isNaN(approverId)) {
            requestData.assigned_approver_id = approverId;
        }
    }
    
    try {
        await apiRequest('/overtime/', {
            method: 'POST',
            body: JSON.stringify(requestData)
        });
        
        await showToast('加班申请提交成功！', 'success', { timeout: 2000 });
        closeFormModal();
        loadMyOvertimeApplications();
        loadMyPendingCounts();  // 更新未完成申请数量徽章
    } catch (error) {
        await showToast('提交失败: ' + error.message, 'error');
    }
}

function closeFormModal(event) {
    if (event && !event.target.classList.contains('modal-overlay')) return;
    document.getElementById('modal-container').innerHTML = '';
}

// ==================== 撤回申请 ====================
async function cancelLeaveApplication(leaveId) {
    const confirmed = await showToast('确定要撤回这个请假申请吗？', 'warning', { 
        confirm: true,
        confirmText: '确定撤回',
        cancelText: '取消'
    });
    if (!confirmed) {
        return;
    }
    
    try {
        await apiRequest(`/leave/${leaveId}/cancel`, {
            method: 'POST'
        });
        
        await showToast('请假申请已撤回！', 'success', { timeout: 2000 });
        loadMyLeaveApplications();
        loadMyPendingCounts();  // 更新未完成申请数量徽章
    } catch (error) {
        await showToast('撤回失败: ' + error.message, 'error');
    }
}

async function deleteLeaveApplication(leaveId) {
    const confirmed = await showToast('确定要删除这个已取消的请假申请吗？删除后无法恢复！', 'warning', { 
        confirm: true,
        confirmText: '确定删除',
        cancelText: '取消',
        danger: true
    });
    if (!confirmed) {
        return;
    }
    
    try {
        await apiRequest(`/leave/${leaveId}/delete`, {
            method: 'DELETE'
        });
        
        await showToast('请假申请已删除！', 'success', { timeout: 2000 });
        loadMyLeaveApplications();
        loadMyPendingCounts();  // 更新未完成申请数量徽章
    } catch (error) {
        await showToast('删除失败: ' + error.message, 'error');
    }
}

async function cancelOvertimeApplication(overtimeId) {
    const confirmed = await showToast('确定要撤回这个加班申请吗？', 'warning', { 
        confirm: true,
        confirmText: '确定撤回',
        cancelText: '取消'
    });
    if (!confirmed) {
        return;
    }
    
    try {
        await apiRequest(`/overtime/${overtimeId}/cancel`, {
            method: 'POST'
        });
        
        await showToast('加班申请已撤回！', 'success', { timeout: 2000 });
        loadMyOvertimeApplications();
        loadMyPendingCounts();  // 更新未完成申请数量徽章
    } catch (error) {
        await showToast('撤回失败: ' + error.message, 'error');
    }
}

async function deleteOvertimeApplication(overtimeId) {
    const confirmed = await showToast('确定要删除这个已取消的加班申请吗？删除后无法恢复！', 'warning', { 
        confirm: true,
        confirmText: '确定删除',
        cancelText: '取消',
        danger: true
    });
    if (!confirmed) {
        return;
    }
    
    try {
        await apiRequest(`/overtime/${overtimeId}/delete`, {
            method: 'DELETE'
        });
        
        await showToast('加班申请已删除！', 'success', { timeout: 2000 });
        loadMyOvertimeApplications();
        loadMyPendingCounts();  // 更新未完成申请数量徽章
    } catch (error) {
        await showToast('删除失败: ' + error.message, 'error');
    }
}

// 辅助函数
function getRoleName(role) {
    const names = {
        'admin': '管理员',
        'general_manager': '总经理',
        'vice_president': '副总',
        'department_head': '部门主任',
        'employee': '员工'
    };
    return names[role] || role;
}

function getLeaveStatusName(status) {
    const names = {
        'pending': '待审批',
        'dept_approved': '部门已批',
        'vp_approved': '副总已批',
        'approved': '已批准',
        'rejected': '已拒绝',
        'cancelled': '已取消'
    };
    return names[status] || status;
}

function getOvertimeStatusName(status) {
    const names = {
        'pending': '待审批',
        'approved': '已批准',
        'rejected': '已拒绝',
        'cancelled': '已取消'
    };
    return names[status] || status;
}

function getStatusClass(status) {
    if (status === 'approved') return 'success';
    if (status === 'rejected' || status === 'cancelled') return 'danger';
    if (status.includes('approved')) return 'warning';
    return 'pending';
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('zh-CN');
}

function formatTime(dateStr) {
    if (!dateStr || dateStr === null || dateStr === '') {
        return '未打卡';
    }
    
    try {
        // 尝试解析日期字符串
        const date = new Date(dateStr);
        
        // 检查日期是否有效
        if (isNaN(date.getTime())) {
            console.warn('无效的日期字符串:', dateStr);
            return '未打卡';
        }
        
        // 使用更兼容的方式格式化时间
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (error) {
        console.error('格式化时间失败:', error, dateStr);
        return '未打卡';
    }
}

function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    })}`;
}

// 格式化时间范围（智能省略重复的年份和日期）
function formatTimeRange(startStr, endStr) {
    if (!startStr || !endStr) return '';
    try {
        // 处理时区问题：确保日期字符串格式正确
        const normalizeDateStr = (dateStr) => {
            if (!dateStr) return '';
            // 如果包含 'T'，直接使用；否则添加 'T00:00:00'
            if (dateStr.includes('T')) {
                return dateStr.split('.')[0]; // 移除毫秒部分
            }
            return dateStr + 'T00:00:00';
        };
        
        const normalizedStartStr = normalizeDateStr(startStr);
        const normalizedEndStr = normalizeDateStr(endStr);
        
        const startDate = new Date(normalizedStartStr);
        const endDate = new Date(normalizedEndStr);
        
        const startYear = startDate.getFullYear();
        const startMonth = startDate.getMonth() + 1;
        const startDay = startDate.getDate();
        const startHours = String(startDate.getHours()).padStart(2, '0');
        const startMinutes = String(startDate.getMinutes()).padStart(2, '0');
        
        const endYear = endDate.getFullYear();
        const endMonth = endDate.getMonth() + 1;
        const endDay = endDate.getDate();
        const endHours = String(endDate.getHours()).padStart(2, '0');
        const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
        
        let startPart = `${startYear}/${String(startMonth).padStart(2, '0')}/${String(startDay).padStart(2, '0')} ${startHours}:${startMinutes}`;
        let endPart = '';
        
        // 如果年份相同
        if (startYear === endYear) {
            // 如果日期也相同
            if (startMonth === endMonth && startDay === endDay) {
                // 只显示时间
                endPart = `${endHours}:${endMinutes}`;
            } else {
                // 只省略年份
                endPart = `${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')} ${endHours}:${endMinutes}`;
            }
        } else {
            // 年份不同，显示完整日期时间
            endPart = `${endYear}/${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')} ${endHours}:${endMinutes}`;
        }
        
        return `${startPart} ~ ${endPart}`;
    } catch (error) {
        console.error('格式化时间范围失败:', error, startStr, endStr);
        return `${formatDateTime(startStr)} ~ ${formatDateTime(endStr)}`;
    }
}

// 查看请假详情
async function viewLeaveDetail(leaveId) {
    try {
        const leave = await apiRequest(`/leave/${leaveId}`);
        
        // 获取申请人姓名（从API返回或尝试获取用户信息）
        let applicantName = leave.applicant_name;
        if (!applicantName) {
            try {
                const applicantInfo = await apiRequest(`/users/${leave.user_id}`);
                applicantName = applicantInfo.real_name;
            } catch (error) {
                applicantName = `用户${leave.user_id}`;
            }
        }
        
        // 构建详情内容
        let content = `
            <div style="line-height: 1.8; padding: 10px 0;">
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px;">状态:</span>
                    <span class="status-badge status-${getStatusClass(leave.status)}">${getLeaveStatusName(leave.status)}</span>
                </div>
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">申请人:</span>
                    <span style="font-size: 1em; font-weight: 500;">${applicantName}</span>
                </div>
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">类型:</span>
                    <span style="font-size: 1em;">${leave.leave_type_name || '普通请假'}</span>
                </div>
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">请假时间:</span>
                    <span style="font-size: 1em;">${formatTimeRange(leave.start_date, leave.end_date)}</span>
                </div>
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">天数:</span>
                    <span style="font-size: 1em;">${leave.days}天</span>
                </div>
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">原因:</span>
                    <span style="font-size: 1em;">${leave.reason}</span>
                </div>
        `;
        
        // 添加审批流程信息
        if (leave.dept_approver_id) {
            const deptApproverName = leave.dept_approver_name || `用户${leave.dept_approver_id}`;
            content += `
                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #E5E5EA;">
                    <div style="font-size: 0.95em; font-weight: 500; margin-bottom: 10px; color: #333;">部门主任审批</div>
                    <div style="font-size: 0.9em; color: #666; margin-bottom: 5px;">审批人: <span style="color: #333;">${deptApproverName}</span></div>
                    <div style="font-size: 0.9em; color: #666; margin-bottom: 5px;">时间: <span style="color: #333;">${leave.dept_approved_at ? formatDateTime(leave.dept_approved_at) : '-'}</span></div>
                    <div style="font-size: 0.9em; color: #666;">意见: <span style="color: #333;">${leave.dept_comment || '无'}</span></div>
                </div>
            `;
        }
        
        if (leave.vp_approver_id) {
            const vpApproverName = leave.vp_approver_name || `用户${leave.vp_approver_id}`;
            content += `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #E5E5EA;">
                    <div style="font-size: 0.95em; font-weight: 500; margin-bottom: 10px; color: #333;">副总审批</div>
                    <div style="font-size: 0.9em; color: #666; margin-bottom: 5px;">审批人: <span style="color: #333;">${vpApproverName}</span></div>
                    <div style="font-size: 0.9em; color: #666; margin-bottom: 5px;">时间: <span style="color: #333;">${leave.vp_approved_at ? formatDateTime(leave.vp_approved_at) : '-'}</span></div>
                    <div style="font-size: 0.9em; color: #666;">意见: <span style="color: #333;">${leave.vp_comment || '无'}</span></div>
                </div>
            `;
        }
        
        if (leave.gm_approver_id) {
            const gmApproverName = leave.gm_approver_name || `用户${leave.gm_approver_id}`;
            content += `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #E5E5EA;">
                    <div style="font-size: 0.95em; font-weight: 500; margin-bottom: 10px; color: #333;">总经理审批</div>
                    <div style="font-size: 0.9em; color: #666; margin-bottom: 5px;">审批人: <span style="color: #333;">${gmApproverName}</span></div>
                    <div style="font-size: 0.9em; color: #666; margin-bottom: 5px;">时间: <span style="color: #333;">${leave.gm_approved_at ? formatDateTime(leave.gm_approved_at) : '-'}</span></div>
                    <div style="font-size: 0.9em; color: #666;">意见: <span style="color: #333;">${leave.gm_comment || '无'}</span></div>
                </div>
            `;
        }
        
        content += `</div>`;
        
        // 显示详情弹窗
        showDetailModal('请假详情', content);
    } catch (error) {
        console.error('加载请假详情失败:', error);
        await showToast('加载详情失败: ' + error.message, 'error');
    }
}

// 查看加班详情
async function viewOvertimeDetail(overtimeId) {
    try {
        const overtime = await apiRequest(`/overtime/${overtimeId}`);
        
        // 获取申请人姓名（从API返回或尝试获取用户信息）
        let applicantName = overtime.applicant_name;
        if (!applicantName) {
            try {
                const applicantInfo = await apiRequest(`/users/${overtime.user_id}`);
                applicantName = applicantInfo.real_name;
            } catch (error) {
                applicantName = `用户${overtime.user_id}`;
            }
        }
        
        // 获取加班类型显示
        const overtimeTypeText = overtime.overtime_type === 'passive' ? '被动加班' : '主动加班';
        
        // 构建详情内容
        let content = `
            <div style="line-height: 1.8; padding: 10px 0;">
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px;">状态:</span>
                    <span class="status-badge status-${getStatusClass(overtime.status)}">${getOvertimeStatusName(overtime.status)}</span>
                </div>
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">申请人:</span>
                    <span style="font-size: 1em; font-weight: 500;">${applicantName}</span>
                </div>
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">加班类型:</span>
                    <span style="font-size: 1em;">${overtimeTypeText}</span>
                </div>
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">开始时间:</span>
                    <span style="font-size: 1em;">${formatDateTime(overtime.start_time)}</span>
                </div>
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">结束时间:</span>
                    <span style="font-size: 1em;">${formatDateTime(overtime.end_time)}</span>
                </div>
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">天数:</span>
                    <span style="font-size: 1em;">${overtime.days}天</span>
                </div>
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">原因:</span>
                    <span style="font-size: 1em;">${overtime.reason}</span>
                </div>
        `;
        
        // 添加审批信息
        if (overtime.approver_id) {
            const approverName = overtime.approver_name || `用户${overtime.approver_id}`;
            content += `
                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #E5E5EA;">
                    <div style="font-size: 0.95em; font-weight: 500; margin-bottom: 10px; color: #333;">审批信息</div>
                    <div style="font-size: 0.9em; color: #666; margin-bottom: 5px;">审批人: <span style="color: #333;">${approverName}</span></div>
                    <div style="font-size: 0.9em; color: #666; margin-bottom: 5px;">时间: <span style="color: #333;">${overtime.approved_at ? formatDateTime(overtime.approved_at) : '-'}</span></div>
                    <div style="font-size: 0.9em; color: #666;">意见: <span style="color: #333;">${overtime.comment || '无'}</span></div>
                </div>
            `;
        }
        
        content += `</div>`;
        
        // 显示详情弹窗
        showDetailModal('加班详情', content);
    } catch (error) {
        console.error('加载加班详情失败:', error);
        await showToast('加载详情失败: ' + error.message, 'error');
    }
}

// 显示详情弹窗
function showDetailModal(title, content) {
    const modalHtml = `
        <div class="modal-overlay" onclick="closeFormModal(event)">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 90%; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close" onclick="closeFormModal()">×</button>
                </div>
                <div class="modal-content" style="padding: 20px;">
                    ${content}
                </div>
                <div class="modal-actions" style="padding: 15px 20px; border-top: 1px solid #E5E5EA;">
                    <button class="btn btn-primary btn-block" onclick="closeFormModal()">关闭</button>
                </div>
            </div>
        </div>
    `;
    
    // 创建或更新模态框容器
    let modalContainer = document.getElementById('modal-container');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'modal-container';
        document.body.appendChild(modalContainer);
    }
    
    modalContainer.innerHTML = modalHtml;
    modalContainer.style.display = 'flex';
}

// 初始化
window.addEventListener('DOMContentLoaded', () => {
    setDefaultOverviewDate();
    const savedToken = getToken();
    if (savedToken) {
        apiRequest('/users/me')
            .then(user => {
                currentUser = user;
                updateUserInfo();
                showPage('main');
                showSection('home');
            })
            .catch(() => {
                clearToken();
                showPage('login');
            });
    } else {
        showPage('login');
    }

    // 点击其他地方关闭用户菜单
    document.addEventListener('click', (e) => {
        const userMenu = document.getElementById('user-menu');
        const userAvatar = document.querySelector('.user-avatar');
        if (!userMenu.contains(e.target) && !userAvatar.contains(e.target)) {
            userMenu.classList.remove('active');
        }
    });
});



