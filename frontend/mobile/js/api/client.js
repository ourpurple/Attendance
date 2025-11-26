/**
 * API客户端模块
 * 封装所有API请求
 */
import { API_BASE_URL, getToken, clearToken } from '../config.js';
import { showPage } from '../pages/navigation.js';
import { showToast } from '../utils/toast.js';

/**
 * API请求封装
 * @param {string} endpoint - API端点
 * @param {object} options - 请求选项
 * @returns {Promise<any>} 响应数据
 */
export async function apiRequest(endpoint, options = {}) {
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

