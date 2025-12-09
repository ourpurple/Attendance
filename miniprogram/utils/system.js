/**
 * 系统信息模块
 * 处理系统信息获取和缓存
 */

const config = require('./config.js');

// 系统信息缓存
let systemInfoCache = null;
let systemInfoCacheTime = 0;

/**
 * 获取系统信息（带缓存）
 * @returns {Object}
 */
function getSystemInfo() {
  // 检查缓存
  const now = Date.now();
  if (systemInfoCache && (now - systemInfoCacheTime) < config.cache.systemInfoTimeout) {
    return systemInfoCache;
  }
  
  let systemInfo = null;
  
  // 检查新API是否可用
  const hasNewAPI = typeof wx.getDeviceInfo === 'function' && 
                    typeof wx.getAppBaseInfo === 'function' && 
                    typeof wx.getWindowInfo === 'function';
  
  if (hasNewAPI) {
    try {
      // 使用新API
      const deviceInfo = wx.getDeviceInfo();
      const appBaseInfo = wx.getAppBaseInfo();
      const windowInfo = wx.getWindowInfo();
      
      if (deviceInfo && appBaseInfo && windowInfo) {
        systemInfo = {
          platform: deviceInfo.platform || 'unknown',
          system: deviceInfo.system || '',
          version: appBaseInfo.version || '',
          SDKVersion: appBaseInfo.SDKVersion || '',
          screenWidth: windowInfo.screenWidth || 0,
          screenHeight: windowInfo.screenHeight || 0,
          pixelRatio: windowInfo.pixelRatio || 1
        };
      }
    } catch (error) {
      // 降级使用旧API
      try {
        systemInfo = wx.getSystemInfoSync();
      } catch (e) {
        // 忽略错误
      }
    }
  }
  
  // 如果新API失败，降级使用旧API
  if (!systemInfo) {
    try {
      systemInfo = wx.getSystemInfoSync();
    } catch (error) {
      // 返回默认值
      systemInfo = getDefaultSystemInfo();
    }
  }
  
  // 缓存结果
  if (systemInfo) {
    systemInfoCache = systemInfo;
    systemInfoCacheTime = now;
  }
  
  return systemInfo || getDefaultSystemInfo();
}

/**
 * 获取默认系统信息
 * @returns {Object}
 */
function getDefaultSystemInfo() {
  return {
    platform: 'unknown',
    system: '',
    version: '',
    SDKVersion: '',
    screenWidth: 0,
    screenHeight: 0,
    pixelRatio: 1
  };
}

/**
 * 检查是否是安卓平台
 * @returns {boolean}
 */
function isAndroid() {
  const systemInfo = getSystemInfo();
  return systemInfo.platform === 'android';
}

/**
 * 检查是否是iOS平台
 * @returns {boolean}
 */
function isIOS() {
  const systemInfo = getSystemInfo();
  return systemInfo.platform === 'ios';
}

/**
 * 解析微信版本号
 * @returns {Object}
 */
function parseWechatVersion() {
  const systemInfo = getSystemInfo();
  const version = systemInfo.version || '';
  const parts = version.split('.').map(v => parseInt(v) || 0);
  
  return {
    version,
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0
  };
}

/**
 * 检查是否是新版本微信（8.0.64+）
 * @returns {boolean}
 */
function isNewWechatVersion() {
  const { major, minor, patch } = parseWechatVersion();
  return major > 8 || 
         (major === 8 && minor > 0) ||
         (major === 8 && minor === 0 && patch >= 64);
}

/**
 * 获取屏幕信息
 * @returns {Object}
 */
function getScreenInfo() {
  const systemInfo = getSystemInfo();
  return {
    width: systemInfo.screenWidth || 0,
    height: systemInfo.screenHeight || 0,
    pixelRatio: systemInfo.pixelRatio || 1
  };
}

/**
 * 清除缓存
 */
function clearCache() {
  systemInfoCache = null;
  systemInfoCacheTime = 0;
}

/**
 * 设置全局错误处理
 */
function setupErrorHandler() {
  // 捕获未处理的错误
  const originalError = console.error;
  console.error = function(...args) {
    // 过滤微信内部错误
    const errorMsg = args.join(' ');
    if (errorMsg.includes('Java bridge method invocation error') ||
        errorMsg.includes('Java object is gone') ||
        errorMsg.includes('reportQualityData')) {
      return; // 静默处理
    }
    originalError.apply(console, args);
  };
  
  // 捕获未处理的Promise错误
  if (typeof wx.onError === 'function') {
    wx.onError((error) => {
      // 过滤微信内部错误
      if (error && (
        error.includes('Java bridge method invocation error') ||
        error.includes('Java object is gone') ||
        error.includes('reportQualityData')
      )) {
        return; // 静默处理
      }
      console.warn('未处理的错误:', error);
    });
  }
}

module.exports = {
  getSystemInfo,
  isAndroid,
  isIOS,
  parseWechatVersion,
  isNewWechatVersion,
  getScreenInfo,
  clearCache,
  setupErrorHandler
};
