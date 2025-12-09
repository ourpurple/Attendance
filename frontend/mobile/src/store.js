/**
 * 状态管理器
 * 使用发布-订阅模式管理全局状态
 */

class Store {
    constructor() {
        this.state = {
            currentUser: null,
            token: null,
            currentLocation: null,
            leaveTypesCache: [],
            isLoading: false,
        };
        
        this.listeners = {};
        
        // 从localStorage恢复状态
        this.loadFromStorage();
    }
    
    /**
     * 获取状态
     */
    getState(key) {
        if (key) {
            return this.state[key];
        }
        return { ...this.state };
    }
    
    /**
     * 设置状态
     */
    setState(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        
        // 持久化到localStorage
        this.saveToStorage(key, value);
        
        // 通知订阅者
        this.notify(key, value, oldValue);
        
        // 开发模式下打印状态变更
        if (process.env.NODE_ENV === 'development') {
            console.log(`[Store] ${key}:`, oldValue, '->', value);
        }
    }
    
    /**
     * 批量设置状态
     */
    setStates(updates) {
        Object.entries(updates).forEach(([key, value]) => {
            this.setState(key, value);
        });
    }
    
    /**
     * 订阅状态变更
     */
    subscribe(key, callback) {
        if (!this.listeners[key]) {
            this.listeners[key] = [];
        }
        this.listeners[key].push(callback);
        
        // 返回取消订阅函数
        return () => {
            this.listeners[key] = this.listeners[key].filter(cb => cb !== callback);
        };
    }
    
    /**
     * 通知订阅者
     */
    notify(key, newValue, oldValue) {
        if (this.listeners[key]) {
            this.listeners[key].forEach(callback => {
                callback(newValue, oldValue);
            });
        }
        
        // 通知通配符订阅者
        if (this.listeners['*']) {
            this.listeners['*'].forEach(callback => {
                callback(key, newValue, oldValue);
            });
        }
    }
    
    /**
     * 保存到localStorage
     */
    saveToStorage(key, value) {
        const persistKeys = ['token', 'currentUser'];
        if (persistKeys.includes(key)) {
            try {
                localStorage.setItem(`app_${key}`, JSON.stringify(value));
            } catch (error) {
                console.error('Failed to save to localStorage:', error);
            }
        }
    }
    
    /**
     * 从localStorage加载
     */
    loadFromStorage() {
        const persistKeys = ['token', 'currentUser'];
        persistKeys.forEach(key => {
            try {
                const value = localStorage.getItem(`app_${key}`);
                if (value) {
                    this.state[key] = JSON.parse(value);
                }
            } catch (error) {
                console.error(`Failed to load ${key} from localStorage:`, error);
            }
        });
    }
    
    /**
     * 清除状态
     */
    clear() {
        this.state = {
            currentUser: null,
            token: null,
            currentLocation: null,
            leaveTypesCache: [],
            isLoading: false,
        };
        
        // 清除localStorage
        localStorage.removeItem('app_token');
        localStorage.removeItem('app_currentUser');
    }
}

// 创建全局store实例
const store = new Store();

export default store;
