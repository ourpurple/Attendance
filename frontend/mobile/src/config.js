/**
 * 配置文件
 * 包含API基础URL和其他全局配置
 */

/**
 * 获取API基础URL
 * 自动检测当前访问的域名
 */
export function getApiBaseUrl() {
    const protocol = window.location.protocol;
    const host = window.location.host;
    return `${protocol}//${host}/api`;
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * 应用配置
 */
export const APP_CONFIG = {
    // API配置
    API_TIMEOUT: 30000, // 30秒超时
    
    // 缓存配置
    CACHE_EXPIRY: 5 * 60 * 1000, // 5分钟
    
    // UI配置
    TOAST_DURATION: 3000, // Toast显示时长
    DEBOUNCE_DELAY: 300, // 防抖延迟
    THROTTLE_DELAY: 1000, // 节流延迟
    
    // 分页配置
    PAGE_SIZE: 20,
    
    // 地图配置
    MAP_ZOOM: 15,
    MAP_CENTER: [116.397428, 39.90923], // 北京天安门
};

export default {
    getApiBaseUrl,
    API_BASE_URL,
    APP_CONFIG
};
