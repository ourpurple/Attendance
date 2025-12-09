/**
 * 认证模块
 * 处理登录、登出、token管理等
 */

import api from './api.js';
import store from './store.js';
import { showToast } from './ui.js';

/**
 * 登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<object>} - 用户信息
 */
export async function login(username, password) {
    try {
        const response = await api.post('/auth/login', {
            username,
            password
        });
        
        if (response.access_token) {
            // 保存token
            store.setState('token', response.access_token);
            
            // 获取用户信息
            const user = await getCurrentUser();
            
            showToast('登录成功', 'success');
            return user;
        } else {
            throw new Error('登录失败：未返回token');
        }
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

/**
 * 登出
 */
export async function logout() {
    try {
        // 清除状态
        store.clear();
        
        // 跳转到登录页
        window.location.hash = '#login';
        
        showToast('已退出登录', 'info');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

/**
 * 获取当前用户信息
 * @returns {Promise<object>} - 用户信息
 */
export async function getCurrentUser() {
    try {
        const user = await api.get('/users/me');
        store.setState('currentUser', user);
        return user;
    } catch (error) {
        console.error('Get current user error:', error);
        throw error;
    }
}

/**
 * 检查是否已登录
 * @returns {boolean} - 是否已登录
 */
export function isAuthenticated() {
    const token = store.getState('token');
    return !!token;
}

/**
 * 检查用户权限
 * @param {string|string[]} roles - 需要的角色
 * @returns {boolean} - 是否有权限
 */
export function hasRole(roles) {
    const user = store.getState('currentUser');
    if (!user) return false;
    
    const userRole = user.role;
    if (Array.isArray(roles)) {
        return roles.includes(userRole);
    }
    return userRole === roles;
}

/**
 * 检查是否是管理员
 * @returns {boolean} - 是否是管理员
 */
export function isAdmin() {
    return hasRole('admin');
}

/**
 * 检查是否是部门主任
 * @returns {boolean} - 是否是部门主任
 */
export function isDepartmentHead() {
    return hasRole(['department_head', 'admin']);
}

/**
 * 检查是否是副总
 * @returns {boolean} - 是否是副总
 */
export function isVicePresident() {
    return hasRole(['vice_president', 'admin']);
}

/**
 * 检查是否是总经理
 * @returns {boolean} - 是否是总经理
 */
export function isGeneralManager() {
    return hasRole(['general_manager', 'admin']);
}

/**
 * 修改密码
 * @param {string} oldPassword - 旧密码
 * @param {string} newPassword - 新密码
 * @returns {Promise<void>}
 */
export async function changePassword(oldPassword, newPassword) {
    try {
        await api.post('/auth/change-password', {
            old_password: oldPassword,
            new_password: newPassword
        });
        
        showToast('密码修改成功，请重新登录', 'success');
        
        // 清除token，要求重新登录
        await logout();
    } catch (error) {
        console.error('Change password error:', error);
        throw error;
    }
}

/**
 * 刷新token
 * @returns {Promise<string>} - 新的token
 */
export async function refreshToken() {
    try {
        const response = await api.post('/auth/refresh');
        if (response.access_token) {
            store.setState('token', response.access_token);
            return response.access_token;
        }
        throw new Error('刷新token失败');
    } catch (error) {
        console.error('Refresh token error:', error);
        // 刷新失败，清除登录状态
        await logout();
        throw error;
    }
}

/**
 * 初始化认证状态
 * 从localStorage恢复登录状态
 */
export async function initAuth() {
    const token = store.getState('token');
    if (token) {
        try {
            // 验证token是否有效
            await getCurrentUser();
            return true;
        } catch (error) {
            // token无效，清除状态
            store.clear();
            return false;
        }
    }
    return false;
}

export default {
    login,
    logout,
    getCurrentUser,
    isAuthenticated,
    hasRole,
    isAdmin,
    isDepartmentHead,
    isVicePresident,
    isGeneralManager,
    changePassword,
    refreshToken,
    initAuth
};
