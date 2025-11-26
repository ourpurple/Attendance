/**
 * 页面导航模块
 * 处理页面切换和导航
 */
import { getCurrentUser } from '../config.js';
import { apiRequest } from '../api/client.js';
import { showToast } from '../utils/toast.js';

/**
 * 显示页面
 */
export function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    if (pageName === 'login') {
        document.getElementById('login-page').classList.add('active');
        // 显示登录页面时，重新修复用户名输入框
        setTimeout(() => {
            if (window.fixUsernameInputKeyboard) {
                window.fixUsernameInputKeyboard();
            }
        }, 100);
    } else {
        document.getElementById('main-page').classList.add('active');
    }
}

/**
 * 显示内容区
 */
export async function showSection(sectionName) {
    // 权限检查：审批页面需要审批权限
    if (sectionName === 'approval') {
        const currentUser = getCurrentUser();
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
    if (window.loadSectionData) {
        window.loadSectionData(sectionName);
    }
}

