/**
 * 配置模块
 * 应用全局配置
 */

// API基础URL - 自动检测当前访问的域名
function getApiBaseUrl() {
    const protocol = window.location.protocol; // http: 或 https:
    const host = window.location.host; // hostname:port
    return `${protocol}//${host}/api`;
}

export const API_BASE_URL = getApiBaseUrl();

// 全局状态
export let currentUser = null;
export let token = null;
export let currentLocation = null;
export let leaveTypesCache = [];

// 设置当前用户
export function setCurrentUser(user) {
    currentUser = user;
}

// 获取当前用户
export function getCurrentUser() {
    return currentUser;
}

// 设置token
export function setToken(newToken) {
    token = newToken;
    localStorage.setItem('token', newToken);
}

// 获取token
export function getToken() {
    if (!token) {
        token = localStorage.getItem('token');
    }
    return token;
}

// 清除token
export function clearToken() {
    token = null;
    localStorage.removeItem('token');
}

// 设置当前位置
export function setCurrentLocation(location) {
    currentLocation = location;
}

// 获取当前位置
export function getCurrentLocation() {
    return currentLocation;
}

