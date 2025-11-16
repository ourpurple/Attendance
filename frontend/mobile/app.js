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
        // 调试信息
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            console.log('API Request:', url);
        }
        
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
    
    // 检查是否会迟到
    try {
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
    } catch (error) {
        console.warn('检查迟到状态失败:', error);
        // 如果检查失败，继续执行打卡（不影响正常流程）
    }
    
    btn.disabled = true;
    btn.innerHTML = '<span>📍</span><span>获取位置中...</span>';

    try {
        // 显示获取位置提示
        await showToast('正在获取位置信息，请稍候...', 'info', { timeout: 3000 });
        
        const locationData = await getCurrentLocation();
        // 显示地址文本，如果没有则显示坐标
        const displayLocation = locationData.address || locationData.location;
        document.getElementById('clock-location').textContent = `位置: ${displayLocation}`;
        
        const result = await apiRequest('/attendance/checkin', {
            method: 'POST',
            body: JSON.stringify(locationData)
        });

        await showToast('上班打卡成功！', 'success', { timeout: 2000 });
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
    
    // 如果按钮已禁用（已打卡），直接返回
    if (btn.disabled) {
        await showToast('今天已经打过下班卡', 'warning');
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
        // 显示地址文本，如果没有则显示坐标
        const displayLocation = locationData.address || locationData.location;
        document.getElementById('clock-location').textContent = `位置: ${displayLocation}`;
        
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

// 判断是否为工作日（调用后端API）
async function checkWorkday(date = null) {
    try {
        // 如果没有指定日期，使用今天
        if (!date) {
            const today = new Date();
            date = today.toISOString().split('T')[0];
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
        // 使用更兼容的方式获取今天的日期
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;
        
        const attendances = await apiRequest(`/attendance/my?start_date=${today}&end_date=${today}`);
        if (attendances && attendances.length > 0) {
            todayAttendance = attendances[0];
        }
    } catch (error) {
        console.error('获取今日打卡状态失败:', error);
    }
    
    // 检查今天是否为工作日
    const workdayCheck = await checkWorkday();
    
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
        
        // 显示提示信息
        if (clockLocation) {
            let message = '';
            if (workdayCheck.holiday_name) {
                message = `今天是${workdayCheck.holiday_name}，无需打卡`;
            } else if (workdayCheck.reason === '周末') {
                const today = new Date();
                const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                const dayName = dayNames[today.getDay()];
                message = `今天是${dayName}，非工作日无需打卡`;
            } else {
                message = `${workdayCheck.reason}，无需打卡`;
            }
            clockLocation.textContent = message;
            clockLocation.style.color = '#ff9500';
            clockLocation.style.fontWeight = 'bold';
        }
    } else {
        // 工作日，显示打卡状态区域
        if (clockStatus) {
            clockStatus.style.display = 'flex';
        }
        
        // 根据打卡状态设置按钮（已打卡的按钮保持禁用）
        if (todayAttendance) {
            // 更严格地检查时间字段
            const hasCheckin = todayAttendance.checkin_time && 
                              todayAttendance.checkin_time !== null && 
                              todayAttendance.checkin_time !== '';
            const hasCheckout = todayAttendance.checkout_time && 
                               todayAttendance.checkout_time !== null && 
                               todayAttendance.checkout_time !== '';
            
            // 已打卡的按钮保持禁用状态（灰色）
            checkinBtn.disabled = hasCheckin;
            checkoutBtn.disabled = !hasCheckin || hasCheckout;
        } else {
            // 未打卡，根据工作日状态启用按钮
            checkinBtn.disabled = false;
            checkoutBtn.disabled = true; // 未上班时，下班按钮禁用
        }
        
        // 设置按钮样式
        checkinBtn.style.opacity = checkinBtn.disabled ? '0.6' : '1';
        checkoutBtn.style.opacity = checkoutBtn.disabled ? '0.6' : '1';
        checkinBtn.style.cursor = checkinBtn.disabled ? 'not-allowed' : 'pointer';
        checkoutBtn.style.cursor = checkoutBtn.disabled ? 'not-allowed' : 'pointer';
        
        // 如果是调休工作日，显示提示
        if (workdayCheck.reason === '调休工作日' && clockLocation && !todayAttendance) {
            clockLocation.textContent = `今天是${workdayCheck.holiday_name || '调休工作日'}`;
            clockLocation.style.color = '#007aff';
            clockLocation.style.fontWeight = 'bold';
        }
    }
}

// 加载首页数据
async function loadHomeData() {
    await loadTodayAttendance();
    await loadRecentAttendance();
    await loadPendingCount();
    // 检查工作日并设置按钮状态（会考虑打卡状态）
    await checkAndSetAttendanceButtons();
}

// 加载今日打卡状态
async function loadTodayAttendance() {
    try {
        // 使用更兼容的方式获取今天的日期
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;
        
        const attendances = await apiRequest(`/attendance/my?start_date=${today}&end_date=${today}`);
        
        console.log('今日打卡数据:', attendances); // 调试日志

        if (attendances && attendances.length > 0) {
            const att = attendances[0];
            
            // 更严格地检查时间字段是否存在且有效
            const hasCheckin = att.checkin_time && att.checkin_time !== null && att.checkin_time !== '';
            const hasCheckout = att.checkout_time && att.checkout_time !== null && att.checkout_time !== '';
            
            console.log('打卡状态检查:', { 
                hasCheckin, 
                hasCheckout, 
                checkin_time: att.checkin_time, 
                checkout_time: att.checkout_time 
            }); // 调试日志
            
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
            
            // 设置按钮禁用状态（已打卡的按钮会变为灰色）
            if (checkinBtn) {
                checkinBtn.disabled = hasCheckin;
            }
            if (checkoutBtn) {
                checkoutBtn.disabled = !hasCheckin || hasCheckout;
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

        container.innerHTML = attendances.map(att => {
            const date = new Date(att.date);
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
                            ${att.is_late ? '<span class="status-badge status-warning">迟到</span>' : ''}
                        </div>
                        <div class="attendance-time">
                            <span>下班:</span>
                            <strong>${att.checkout_time ? formatTime(att.checkout_time) : '-'}</strong>
                            ${att.is_early_leave ? '<span class="status-badge status-warning">早退</span>' : ''}
                        </div>
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

        container.innerHTML = attendances.map(att => `
            <div class="list-item">
                <div class="list-item-header">
                    <span class="list-item-title">${formatDate(att.date)}</span>
                    ${att.work_hours ? `<span>${att.work_hours.toFixed(1)}小时</span>` : ''}
                </div>
                <div class="list-item-content">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span>上班: ${att.checkin_time ? formatTime(att.checkin_time) : '-'}</span>
                        ${att.is_late ? '<span class="status-badge status-warning">迟到</span>' : ''}
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>下班: ${att.checkout_time ? formatTime(att.checkout_time) : '-'}</span>
                        ${att.is_early_leave ? '<span class="status-badge status-warning">早退</span>' : ''}
                    </div>
                </div>
            </div>
        `).join('');
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
                        <span class="list-item-title">${formatDate(leave.start_date)} ~ ${formatDate(leave.end_date)}</span>
                        <span class="status-badge status-${getStatusClass(leave.status)}">${getLeaveStatusName(leave.status)}</span>
                    </div>
                    <div class="list-item-content">
                        <div><strong>天数:</strong> ${leave.days}天</div>
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
            
            return `
                <div class="list-item">
                    <div class="list-item-header">
                        <span class="list-item-title">${formatDateTime(ot.start_time)} ~ ${formatDateTime(ot.end_time)}</span>
                        <span class="status-badge status-${getStatusClass(ot.status)}">${getOvertimeStatusName(ot.status)}</span>
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
                    <span class="list-item-title">${formatDate(leave.start_date)} ~ ${formatDate(leave.end_date)}</span>
                    <span class="status-badge status-${getStatusClass(leave.status)}">${getLeaveStatusName(leave.status)}</span>
                </div>
                <div class="list-item-content">
                    <div style="display: flex; margin-bottom: 8px;">
                        <div style="flex: 1;"><strong>申请人:</strong> ${leave.applicant_name || `用户${leave.user_id}`}</div>
                        <div style="flex: 1;"><strong>请假天数:</strong> ${leave.days}天</div>
                    </div>
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

        container.innerHTML = overtimes.map(ot => `
            <div class="list-item">
                <div class="list-item-header">
                    <span class="list-item-title">${formatDateTime(ot.start_time)} ~ ${formatDateTime(ot.end_time)}</span>
                    <span class="status-badge status-${getStatusClass(ot.status)}">${getOvertimeStatusName(ot.status)}</span>
                </div>
                <div class="list-item-content">
                    <div style="display: flex; margin-bottom: 8px;">
                        <div style="flex: 1;"><strong>申请人:</strong> ${ot.applicant_name || `用户${ot.user_id}`}</div>
                        <div style="flex: 1;"><strong>加班天数:</strong> ${ot.days}天</div>
                    </div>
                    <div><strong>原因:</strong> ${ot.reason}</div>
                </div>
                <div class="list-item-footer" style="display: flex; gap: 10px;">
                    <button class="btn btn-primary btn-small" style="flex: 1;" onclick="viewOvertimeDetail(${ot.id})">详情</button>
                    <button class="btn btn-success btn-small" style="flex: 1;" onclick="approveOvertime(${ot.id}, true)">批准</button>
                    <button class="btn btn-danger btn-small" style="flex: 1;" onclick="approveOvertime(${ot.id}, false)">拒绝</button>
                </div>
            </div>
        `).join('');
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
    
    const modalHtml = `
        <div class="modal-overlay" onclick="closeFormModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>申请请假</h3>
                    <button class="modal-close" onclick="closeFormModal()">×</button>
                </div>
                <form id="leave-form" onsubmit="submitLeaveForm(event)">
                    <div class="form-group">
                        <label class="form-label">开始日期 *</label>
                        <input type="date" id="leave-start-date" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">结束日期 *</label>
                        <input type="date" id="leave-end-date" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">请假天数 *</label>
                        <input type="number" id="leave-days" class="form-input" step="0.5" min="0.5" required placeholder="例如：0.5, 1, 2.5" onchange="updateLeaveApproverVisibility()">
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
    
    // 设置默认日期
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('leave-start-date').value = today;
    document.getElementById('leave-end-date').value = today;
    
    // 初始检查天数，显示/隐藏审批人选择器
    updateLeaveApproverVisibility();
}

// 根据请假天数显示/隐藏审批人选择器（仅对副总显示）
function updateLeaveApproverVisibility() {
    const daysInput = document.getElementById('leave-days');
    const vpSelector = document.getElementById('leave-vp-selector');
    const gmSelector = document.getElementById('leave-gm-selector');
    
    if (!daysInput) return;
    
    const userRole = currentUser?.role;
    const isVicePresident = userRole === 'vice_president';
    
    // 只有副总才显示审批人选择器
    if (!isVicePresident) {
        if (vpSelector) vpSelector.style.display = 'none';
        if (gmSelector) gmSelector.style.display = 'none';
        return;
    }
    
    const days = parseFloat(daysInput.value) || 0;
    
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
    const endDate = document.getElementById('leave-end-date').value;
    const days = parseFloat(document.getElementById('leave-days').value);
    const reason = document.getElementById('leave-reason').value;
    const assignedVpId = document.getElementById('leave-assigned-vp')?.value || '';
    const assignedGmId = document.getElementById('leave-assigned-gm')?.value || '';
    
    if (!startDate || !endDate || !days || !reason) {
        await showToast('请填写所有必填项', 'warning');
        return;
    }
    
    if (new Date(endDate) < new Date(startDate)) {
        await showToast('结束日期不能早于开始日期', 'warning');
        return;
    }
    
    const requestData = {
        start_date: startDate + 'T00:00:00',
        end_date: endDate + 'T23:59:59',
        days: days,
        reason: reason
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
    } catch (error) {
        await showToast('提交失败: ' + error.message, 'error');
    }
}

// ==================== 加班申请表单 ====================
function showNewOvertimeForm() {
    const modalHtml = `
        <div class="modal-overlay" onclick="closeFormModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>申请加班</h3>
                    <button class="modal-close" onclick="closeFormModal()">×</button>
                </div>
                <form id="overtime-form" onsubmit="submitOvertimeForm(event)">
                    <div class="form-group">
                        <label class="form-label">加班类型 *</label>
                        <select id="overtime-type" class="form-input" onchange="handleOvertimeTypeChange()" required>
                            <option value="">请选择</option>
                            <option value="half-day">半天</option>
                            <option value="full-day">整天</option>
                            <option value="custom">自定义时长</option>
                        </select>
                    </div>
                    
                    <!-- 自定义时间段 -->
                    <div id="custom-time-section" style="display: none;">
                        <div class="form-group">
                            <label class="form-label">加班日期 *</label>
                            <input type="date" id="overtime-date" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="form-label">开始时间 *</label>
                            <input type="time" id="overtime-start-time" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="form-label">结束时间 *</label>
                            <input type="time" id="overtime-end-time" class="form-input">
                        </div>
                    </div>
                    
                    <!-- 快捷选择 -->
                    <div id="quick-select-section" style="display: none;">
                        <div class="form-group">
                            <label class="form-label">加班日期 *</label>
                            <input type="date" id="overtime-quick-date" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="form-label">加班时段</label>
                            <div class="radio-group" id="time-period-group">
                                <!-- 动态生成时段选项 -->
                            </div>
                        </div>
                    </div>
                    
                    <!-- 自定义天数输入（仅在自定义模式显示） -->
                    <div class="form-group" id="custom-days-section" style="display: none;">
                        <label class="form-label">加班天数 *</label>
                        <input type="number" id="overtime-days" class="form-input" step="0.5" min="0.5" placeholder="只能填整数或x.5天（如1, 1.5, 2, 2.5）">
                        <small style="color: #888; font-size: 0.9em;">只能填整数或x.5天（如1, 1.5, 2, 2.5）</small>
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
    
    // 设置默认日期
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('overtime-date').value = today;
    document.getElementById('overtime-quick-date').value = today;
    
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
    const customSection = document.getElementById('custom-time-section');
    const quickSection = document.getElementById('quick-select-section');
    const customDaysSection = document.getElementById('custom-days-section');
    const timePeriodGroup = document.getElementById('time-period-group');
    
    // 重置显示
    customSection.style.display = 'none';
    quickSection.style.display = 'none';
    customDaysSection.style.display = 'none';
    timePeriodGroup.innerHTML = '';
    
    if (type === 'half-day') {
        quickSection.style.display = 'block';
        // 半天时段选项
        timePeriodGroup.innerHTML = `
            <label class="radio-label">
                <input type="radio" name="time-period" value="morning" checked>
                <span>上午 (09:00-12:00)</span>
            </label>
            <label class="radio-label">
                <input type="radio" name="time-period" value="afternoon">
                <span>下午 (14:00-17:30)</span>
            </label>
            <label class="radio-label">
                <input type="radio" name="time-period" value="evening">
                <span>晚上 (17:30-19:30)</span>
            </label>
        `;
    } else if (type === 'full-day') {
        quickSection.style.display = 'block';
        // 整天时段选项
        timePeriodGroup.innerHTML = `
            <label class="radio-label">
                <input type="radio" name="time-period" value="day" checked>
                <span>白天 (09:00-17:30)</span>
            </label>
            <label class="radio-label">
                <input type="radio" name="time-period" value="night">
                <span>晚上 (17:30-22:00)</span>
            </label>
        `;
    } else if (type === 'custom') {
        customSection.style.display = 'block';
        customDaysSection.style.display = 'block';
    }
}

async function submitOvertimeForm(event) {
    event.preventDefault();
    
    const type = document.getElementById('overtime-type').value;
    const reason = document.getElementById('overtime-reason').value;
    
    if (!type || !reason) {
        await showToast('请填写所有必填项', 'warning');
        return;
    }
    
    let startTime, endTime, hours, days;
    
    if (type === 'half-day' || type === 'full-day') {
        // 快捷选择
        const date = document.getElementById('overtime-quick-date').value;
        const period = document.querySelector('input[name="time-period"]:checked').value;
        
        if (!date) {
            await showToast('请选择加班日期', 'warning');
            return;
        }
        
        // 根据时段设置时间和时长
        const timeRanges = {
            // 半天时段
            morning: { start: '09:00', end: '12:00', hours: 3 },      // 上午
            afternoon: { start: '14:00', end: '17:30', hours: 3.5 },  // 下午
            evening: { start: '17:30', end: '19:30', hours: 2 },      // 晚上
            // 整天时段
            day: { start: '09:00', end: '17:30', hours: 8.5 },        // 白天
            night: { start: '17:30', end: '22:00', hours: 4.5 }       // 晚上
        };
        
        const range = timeRanges[period];
        startTime = `${date}T${range.start}:00`;
        endTime = `${date}T${range.end}:00`;
        hours = range.hours;
        
        // 根据类型设置天数
        days = type === 'half-day' ? 0.5 : 1.0;
        
    } else if (type === 'custom') {
        // 自定义时间
        const date = document.getElementById('overtime-date').value;
        const startTimeStr = document.getElementById('overtime-start-time').value;
        const endTimeStr = document.getElementById('overtime-end-time').value;
        const daysInput = document.getElementById('overtime-days').value;
        
        if (!date || !startTimeStr || !endTimeStr || !daysInput) {
            await showToast('请填写完整的时间信息和加班天数', 'warning');
            return;
        }
        
        startTime = `${date}T${startTimeStr}:00`;
        endTime = `${date}T${endTimeStr}:00`;
        hours = calculateHours(startTimeStr, endTimeStr);
        days = parseFloat(daysInput);
        
        if (hours <= 0) {
            await showToast('结束时间必须晚于开始时间', 'warning');
            return;
        }
        
        // 验证天数格式（只能是整数或x.5）
        if (days <= 0 || days % 0.5 !== 0) {
            await showToast('加班天数只能是整数或整数.5（如1, 1.5, 2, 2.5）', 'warning');
            return;
        }
    }
    
    const assignedApproverId = document.getElementById('overtime-assigned-approver')?.value || '';
    
    const requestData = {
        start_time: startTime,
        end_time: endTime,
        hours: hours,
        days: days,
        reason: reason
    };
    
    // 如果指定了审批人，添加到请求中
    if (assignedApproverId) {
        requestData.assigned_approver_id = parseInt(assignedApproverId);
    }
    
    try {
        await apiRequest('/overtime/', {
            method: 'POST',
            body: JSON.stringify(requestData)
        });
        
        await showToast('加班申请提交成功！', 'success', { timeout: 2000 });
        closeFormModal();
        loadMyOvertimeApplications();
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
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">开始日期:</span>
                    <span style="font-size: 1em;">${formatDate(leave.start_date)}</span>
                </div>
                <div style="margin-bottom: 15px; display: flex; align-items: center;">
                    <span style="font-size: 0.9em; color: #666; margin-right: 8px; min-width: 80px;">结束日期:</span>
                    <span style="font-size: 1em;">${formatDate(leave.end_date)}</span>
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


