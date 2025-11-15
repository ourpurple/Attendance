// utils/debug.js
// 调试工具函数

// 是否开启调试模式（可以通过编译条件控制）
const DEBUG = true;

/**
 * 调试日志
 */
export const debugLog = (...args) => {
  if (DEBUG) {
    console.log('[DEBUG]', ...args);
  }
};

/**
 * 调试错误
 */
export const debugError = (...args) => {
  if (DEBUG) {
    console.error('[ERROR]', ...args);
  }
};

/**
 * 调试警告
 */
export const debugWarn = (...args) => {
  if (DEBUG) {
    console.warn('[WARN]', ...args);
  }
};

/**
 * 打印对象（格式化）
 */
export const debugObject = (label, obj) => {
  if (DEBUG) {
    console.log(`[DEBUG] ${label}:`, JSON.stringify(obj, null, 2));
  }
};

/**
 * 打印页面数据
 */
export const debugPageData = (page) => {
  if (DEBUG) {
    console.log('[DEBUG] 页面数据:', page.data);
  }
};

/**
 * 打印全局数据
 */
export const debugGlobalData = () => {
  if (DEBUG) {
    const app = getApp();
    console.log('[DEBUG] 全局数据:', app.globalData);
  }
};

/**
 * 性能计时
 */
export const performanceTimer = {
  timers: {},
  
  start(label) {
    if (DEBUG) {
      this.timers[label] = Date.now();
    }
  },
  
  end(label) {
    if (DEBUG && this.timers[label]) {
      const duration = Date.now() - this.timers[label];
      console.log(`[PERF] ${label}: ${duration}ms`);
      delete this.timers[label];
      return duration;
    }
    return 0;
  }
};

