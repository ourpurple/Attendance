/**
 * 网络请求封装
 * 统一处理HTTP请求、错误处理、token管理
 */

const config = require('./config.js');
const system = require('./system.js');

/**
 * 获取请求头
 */
function getHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  // 添加token - 延迟获取app实例
  const app = getApp();
  const token = (app && app.globalData && app.globalData.token) || wx.getStorageSync('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * 获取请求配置
 */
function getRequestConfig() {
  const systemInfo = system.getSystemInfo();
  const isAndroid = systemInfo.platform === 'android';

  // 解析微信版本号
  const wechatVersion = systemInfo.version || '';
  const versionParts = wechatVersion.split('.').map(v => parseInt(v) || 0);
  const majorVersion = versionParts[0] || 0;
  const minorVersion = versionParts[1] || 0;
  const patchVersion = versionParts[2] || 0;
  const isNewWechatVersion = majorVersion > 8 ||
                             (majorVersion === 8 && minorVersion > 0) ||
                             (majorVersion === 8 && minorVersion === 0 && patchVersion >= 64);

  return {
    timeout: isAndroid ? config.request.androidTimeout : config.request.timeout,
    enableCache: config.request.enableCache,
    enableHttp2: isAndroid && isNewWechatVersion ? false : config.request.enableHttp2
  };
}

/**
 * 处理响应
 */
function handleResponse(res, resolve, reject) {
  if (config.debug.logResponse) {
    console.log('✅ 响应:', res.statusCode, res.data);
  }
  
  // 成功响应
  if (res.statusCode === 200 || res.statusCode === 201) {
    let data = res.data;
    
    // 处理空数据
    if (data === null || data === undefined) {
      data = Array.isArray(data) ? [] : {};
    }
    
    resolve(data);
    return;
  }
  
  // 204 No Content
  if (res.statusCode === 204) {
    resolve({});
    return;
  }
  
  // 401 未授权
  if (res.statusCode === 401) {
    console.warn('❌ 未授权，清除登录状态');
    // 延迟获取app实例
    const app = getApp();
    if (app && app.logout) {
      app.logout();
    } else {
      // 直接清除存储
      wx.removeStorageSync('token');
      wx.removeStorageSync('userInfo');
    }
    reject({ message: '未授权，请重新登录', code: 401 });
    return;
  }
  
  // 403 权限不足
  if (res.statusCode === 403) {
    console.warn('❌ 权限不足');
    reject({ message: '权限不足', code: 403 });
    return;
  }
  
  // 其他错误
  const error = res.data || {};
  reject({
    message: error.detail || error.message || '请求失败',
    code: res.statusCode,
    data: error
  });
}

/**
 * 处理请求失败
 */
function handleError(err, reject) {
  console.error('❌ 请求失败:', err);

  const systemInfo = system.getSystemInfo();
  const isAndroid = systemInfo.platform === 'android';
  
  let errorMessage = '请求失败';
  let errorDetail = '';
  
  if (err.errMsg) {
    if (err.errMsg.includes('timeout')) {
      errorMessage = '请求超时';
      errorDetail = isAndroid 
        ? '网络连接超时，请检查网络连接或稍后重试'
        : '网络连接超时';
    } else if (err.errMsg.includes('domain')) {
      errorMessage = '域名配置错误';
      errorDetail = '请在微信公众平台配置合法域名';
    } else if (err.errMsg.includes('ssl') || err.errMsg.includes('certificate')) {
      errorMessage = 'SSL证书错误';
      errorDetail = '服务器SSL证书无效或已过期';
    } else if (err.errMsg.includes('connect')) {
      errorMessage = '无法连接到服务器';
      errorDetail = '请检查网络连接';
    } else {
      errorDetail = err.errMsg;
    }
  }
  
  reject({
    message: errorMessage,
    detail: errorDetail,
    errMsg: err.errMsg,
    originalError: err
  });
}

/**
 * 发起请求
 * @param {Object} options - 请求选项
 * @param {string} options.url - 请求路径（不含baseURL）
 * @param {string} options.method - 请求方法
 * @param {Object} options.data - 请求数据
 * @param {Object} options.header - 请求头
 * @returns {Promise}
 */
function request(options) {
  return new Promise((resolve, reject) => {
    const { url, method = 'GET', data = {}, header = {} } = options;
    
    // 打印请求日志
    if (config.debug.logRequest) {
      console.log('📤 请求:', method, url);
    }
    
    // 构建请求配置
    const requestConfig = getRequestConfig();
    const fullUrl = `${config.apiBaseUrl}${url}`;
    
    wx.request({
      url: fullUrl,
      method,
      data,
      header: {
        ...getHeaders(),
        ...header
      },
      timeout: requestConfig.timeout,
      enableCache: requestConfig.enableCache,
      enableHttp2: requestConfig.enableHttp2,
      success: (res) => handleResponse(res, resolve, reject),
      fail: (err) => handleError(err, reject)
    });
  });
}

/**
 * GET请求
 */
function get(url, data = {}) {
  return request({ url, method: 'GET', data });
}

/**
 * POST请求
 */
function post(url, data = {}) {
  return request({ url, method: 'POST', data });
}

/**
 * PUT请求
 */
function put(url, data = {}) {
  return request({ url, method: 'PUT', data });
}

/**
 * DELETE请求
 */
function del(url, data = {}) {
  return request({ url, method: 'DELETE', data });
}

module.exports = {
  request,
  get,
  post,
  put,
  delete: del
};
