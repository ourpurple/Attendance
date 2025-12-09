/**
 * API请求封装
 * 统一处理HTTP请求、错误处理、token管理
 */

import { API_BASE_URL, APP_CONFIG } from './config.js';
import store from './store.js';
import { showToast } from './ui.js';

/**
 * HTTP请求方法
 */
class ApiClient {
    constructor(baseURL) {
        this.baseURL = baseURL;
    }
    
    /**
     * 获取请求头
     */
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        
        const token = store.getState('token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        return headers;
    }
    
    /**
     * 处理响应
     */
    async handleResponse(response) {
        if (!response.ok) {
            const error = await response.json().catch(() => ({
                detail: `HTTP ${response.status}: ${response.statusText}`
            }));
            throw new Error(error.detail || error.message || '请求失败');
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        
        return await response.text();
    }
    
    /**
     * 处理错误
     */
    handleError(error) {
        console.error('API Error:', error);
        
        // 401未授权，清除token并跳转登录
        if (error.message.includes('401')) {
            store.clear();
            window.location.hash = '#login';
            showToast('登录已过期，请重新登录', 'error');
            return;
        }
        
        // 显示错误提示
        showToast(error.message || '请求失败', 'error');
        throw error;
    }
    
    /**
     * GET请求
     */
    async get(endpoint, params = {}) {
        try {
            const url = new URL(`${this.baseURL}${endpoint}`);
            Object.entries(params).forEach(([key, value]) => {
                if (value !== null && value !== undefined) {
                    url.searchParams.append(key, value);
                }
            });
            
            const response = await fetch(url, {
                method: 'GET',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(APP_CONFIG.API_TIMEOUT),
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }
    
    /**
     * POST请求
     */
    async post(endpoint, data = {}) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(data),
                signal: AbortSignal.timeout(APP_CONFIG.API_TIMEOUT),
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }
    
    /**
     * PUT请求
     */
    async put(endpoint, data = {}) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(data),
                signal: AbortSignal.timeout(APP_CONFIG.API_TIMEOUT),
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }
    
    /**
     * DELETE请求
     */
    async delete(endpoint) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'DELETE',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(APP_CONFIG.API_TIMEOUT),
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }
    
    /**
     * 上传文件
     */
    async upload(endpoint, formData) {
        try {
            const headers = {};
            const token = store.getState('token');
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'POST',
                headers: headers,
                body: formData,
                signal: AbortSignal.timeout(APP_CONFIG.API_TIMEOUT),
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }
}

// 创建API客户端实例
const api = new ApiClient(API_BASE_URL);

export default api;
