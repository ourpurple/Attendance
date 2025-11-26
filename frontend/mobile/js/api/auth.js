/**
 * 认证相关API
 */
import { apiRequest } from './client.js';

/**
 * 用户登录
 */
export async function login(username, password) {
    return await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });
}

/**
 * 微信登录
 */
export async function wechatLogin(code) {
    return await apiRequest('/auth/wechat-login', {
        method: 'POST',
        body: JSON.stringify({ code })
    });
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser() {
    return await apiRequest('/users/me');
}

/**
 * 修改密码
 */
export async function changePassword(oldPassword, newPassword) {
    return await apiRequest('/users/me/change-password', {
        method: 'POST',
        body: JSON.stringify({
            old_password: oldPassword,
            new_password: newPassword
        })
    });
}

