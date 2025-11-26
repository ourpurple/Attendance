/**
 * 认证相关页面模块
 * 处理登录、修改密码、退出等
 */
import { login, getCurrentUser, changePassword } from '../api/auth.js';
import { setToken, clearToken, setCurrentUser } from '../config.js';
import { showPage, showSection } from './navigation.js';
import { showToast } from '../utils/toast.js';
import { validatePassword, validatePasswordMatch, validatePasswordNotSame } from '../utils/validation.js';
import { getRoleName } from '../utils/status.js';

/**
 * 处理登录
 */
export async function handleLogin(username, password) {
    try {
        const data = await login(username, password);
        setToken(data.access_token);
        
        // 获取当前用户信息
        const user = await getCurrentUser();
        setCurrentUser(user);
        updateUserInfo();
        
        showPage('main');
        showSection('home');
    } catch (error) {
        throw error;
    }
}

/**
 * 更新用户信息显示
 */
export function updateUserInfo() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    const initialEl = document.getElementById('user-initial');
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.getElementById('header-user-role');
    
    if (initialEl) initialEl.textContent = currentUser.real_name.charAt(0);
    if (nameEl) nameEl.textContent = currentUser.real_name;
    if (roleEl) roleEl.textContent = getRoleName(currentUser.role);
    
    // 根据角色显示/隐藏审批功能
    updateApprovalVisibility();
}

/**
 * 更新审批功能可见性
 */
export function updateApprovalVisibility() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
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

/**
 * 检查出勤情况查看权限
 */
async function checkAttendanceOverviewPermission() {
    try {
        const { checkAttendanceViewerPermission } = await import('../api/user.js');
        const permission = await checkAttendanceViewerPermission();
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

/**
 * 加载待审批数量
 */
async function loadPendingCount() {
    try {
        const { getPendingLeaves } = await import('../api/leave.js');
        const { getPendingOvertimes } = await import('../api/overtime.js');
        
        const [leaves, overtimes] = await Promise.all([
            getPendingLeaves(),
            getPendingOvertimes()
        ]);
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

/**
 * 加载我的未完成申请数量
 */
async function loadMyPendingCounts() {
    try {
        const { getMyLeaveApplications } = await import('../api/leave.js');
        const { getMyOvertimeApplications } = await import('../api/overtime.js');
        
        const [leaves, overtimes] = await Promise.all([
            getMyLeaveApplications('pending'),
            getMyOvertimeApplications('pending')
        ]);
        
        const leaveCount = leaves.length || 0;
        const overtimeCount = overtimes.length || 0;
        
        const leaveBadge = document.getElementById('leave-pending-count');
        const overtimeBadge = document.getElementById('overtime-pending-count');
        
        if (leaveBadge) {
            leaveBadge.textContent = leaveCount;
            leaveBadge.style.display = leaveCount > 0 ? 'inline-block' : 'none';
        }
        
        if (overtimeBadge) {
            overtimeBadge.textContent = overtimeCount;
            overtimeBadge.style.display = overtimeCount > 0 ? 'inline-block' : 'none';
        }
    } catch (error) {
        console.error('加载未完成申请数量失败:', error);
    }
}

/**
 * 更新标签徽章
 */
function updateTabBadges(leaveCount, overtimeCount) {
    const leaveTabBadge = document.getElementById('leave-tab-badge');
    const overtimeTabBadge = document.getElementById('overtime-tab-badge');
    
    if (leaveTabBadge) {
        leaveTabBadge.textContent = leaveCount;
        leaveTabBadge.style.display = leaveCount > 0 ? 'inline-block' : 'none';
    }
    
    if (overtimeTabBadge) {
        overtimeTabBadge.textContent = overtimeCount;
        overtimeTabBadge.style.display = overtimeCount > 0 ? 'inline-block' : 'none';
    }
}

/**
 * 显示修改密码模态框
 */
export function showChangePasswordModal() {
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;
    
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeFormModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>修改密码</h2>
                    <button class="modal-close" onclick="closeFormModal()">×</button>
                </div>
                <form id="change-password-form" onsubmit="submitChangePassword(event)">
                    <div class="form-group">
                        <label>原密码</label>
                        <input type="password" id="old-password" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>新密码</label>
                        <input type="password" id="new-password" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>确认新密码</label>
                        <input type="password" id="confirm-password" class="form-input" required>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeFormModal()">取消</button>
                        <button type="submit" class="btn btn-primary">确定</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    modalContainer.style.display = 'flex';
    window.submitChangePassword = submitChangePassword;
}

/**
 * 提交修改密码
 */
export async function submitChangePassword(event) {
    event.preventDefault();
    
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    // 验证新密码长度
    const passwordValidation = validatePassword(newPassword, 6);
    if (!passwordValidation.valid) {
        await showToast(passwordValidation.message, 'warning');
        return;
    }
    
    // 验证两次输入的新密码是否一致
    const matchValidation = validatePasswordMatch(newPassword, confirmPassword);
    if (!matchValidation.valid) {
        await showToast(matchValidation.message, 'warning');
        return;
    }
    
    // 验证新密码不能与原密码相同
    const sameValidation = validatePasswordNotSame(oldPassword, newPassword);
    if (!sameValidation.valid) {
        await showToast(sameValidation.message, 'warning');
        return;
    }
    
    try {
        await changePassword(oldPassword, newPassword);
        await showToast('密码修改成功！', 'success', { timeout: 2000 });
        closeFormModal();
    } catch (error) {
        await showToast('密码修改失败: ' + error.message, 'error');
    }
}

/**
 * 退出登录
 */
export function logout() {
    clearToken();
    setCurrentUser(null);
    showPage('login');
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.reset();
    const loginError = document.getElementById('login-error');
    if (loginError) loginError.textContent = '';
    const userMenu = document.getElementById('user-menu');
    if (userMenu) userMenu.classList.remove('active');
}

/**
 * 切换用户菜单
 */
export function toggleUserMenu() {
    const userMenu = document.getElementById('user-menu');
    if (userMenu) {
        userMenu.classList.toggle('active');
    }
}

// 导出到全局
window.updateUserInfo = updateUserInfo;
window.updateApprovalVisibility = updateApprovalVisibility;
window.showChangePasswordModal = showChangePasswordModal;
window.submitChangePassword = submitChangePassword;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;

