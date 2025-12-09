/**
 * 认证模块
 * 处理登录、登出、token管理等
 */

const request = require('./request.js');
const config = require('./config.js');

/**
 * 获取微信登录code
 */
function getWechatCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: resolve,
      fail: reject
    });
  });
}

/**
 * 微信登录（通过OpenID）
 * @param {string} code - 微信登录code
 * @returns {Promise}
 */
function wechatLogin(code) {
  return new Promise((resolve, reject) => {
    request.post('/auth/wechat-login', { code })
      .then(data => {
        if (data.access_token) {
          // 已绑定，自动登录成功
          saveToken(data.access_token);
          resolve({ autoLogin: true, data });
        } else {
          // 未绑定，需要用户输入账号密码
          resolve({ autoLogin: false, message: data.message || '需要绑定账号' });
        }
      })
      .catch(error => {
        if (error.code === 404) {
          // 接口不存在或用户未绑定
          resolve({ autoLogin: false, message: '需要绑定账号' });
        } else {
          reject({
            message: '微信登录失败，请使用账号密码登录',
            error
          });
        }
      });
  });
}

/**
 * 账号密码登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @param {string} wechatCode - 微信code（可选，用于绑定）
 * @returns {Promise}
 */
function login(username, password, wechatCode = null) {
  return new Promise((resolve, reject) => {
    // 优先使用传入的wechatCode，否则检查本地存储
    if (!wechatCode) {
      wechatCode = wx.getStorageSync('wechat_code');
    }
    
    const requestData = { username, password };
    if (wechatCode) {
      requestData.wechat_code = wechatCode;
    }
    
    if (config.debug.enabled) {
      console.log('🔐 登录请求:', { username, hasWechatCode: !!wechatCode });
    }
    
    request.post('/auth/login', requestData)
      .then(data => {
        if (data && data.access_token) {
          saveToken(data.access_token);
          
          // 清除微信code（已绑定）
          if (wechatCode) {
            wx.removeStorageSync('wechat_code');
          }
          
          // 验证登录状态
          checkLoginStatus()
            .then(() => resolve(data))
            .catch(() => resolve(data)); // 即使验证失败，也返回登录成功
        } else {
          reject({
            detail: '登录响应格式错误',
            message: '登录失败，请重试'
          });
        }
      })
      .catch(error => {
        reject(error);
      });
  });
}

/**
 * 检查登录状态
 * @returns {Promise<boolean>}
 */
function checkLoginStatus() {
  return new Promise((resolve) => {
    const app = getApp();
    
    // 先尝试从本地存储获取token
    if (!app.globalData.token) {
      const token = wx.getStorageSync('token');
      if (token) {
        app.globalData.token = token;
      } else {
        resolve(false);
        return;
      }
    }
    
    request.get('/users/me')
      .then(data => {
        app.globalData.userInfo = data;
        resolve(true);
      })
      .catch(() => {
        console.warn('❌ Token验证失败，清除登录状态');
        logout();
        resolve(false);
      });
  });
}

/**
 * 登出
 */
function logout() {
  const app = getApp();
  app.globalData.token = null;
  app.globalData.userInfo = null;
  wx.removeStorageSync('token');
  wx.reLaunch({
    url: '/pages/login/login'
  });
}

/**
 * 保存token
 * @param {string} token - 访问令牌
 */
function saveToken(token) {
  const app = getApp();
  app.globalData.token = token;
  wx.setStorageSync('token', token);
  
  if (config.debug.enabled) {
    console.log('✅ Token已保存');
  }
}

/**
 * 获取token
 * @returns {string|null}
 */
function getToken() {
  const app = getApp();
  if (!app.globalData.token) {
    app.globalData.token = wx.getStorageSync('token');
  }
  return app.globalData.token;
}

/**
 * 微信自动登录
 */
async function wechatAutoLogin() {
  try {
    // 先检查本地是否有token
    const token = wx.getStorageSync('token');
    if (token) {
      const app = getApp();
      app.globalData.token = token;
      
      // 验证token是否有效
      const isValid = await checkLoginStatus();
      if (isValid) {
        console.log('✅ 使用本地token自动登录成功');
        return true;
      }
    }
    
    // 检查后端是否支持微信登录
    console.log('ℹ️ 微信自动登录功能需要后端支持');
    return false;
  } catch (error) {
    console.error('❌ 微信自动登录异常:', error);
    return false;
  }
}

/**
 * 初始化认证状态
 */
async function initAuth() {
  return await wechatAutoLogin();
}

module.exports = {
  getWechatCode,
  wechatLogin,
  login,
  checkLoginStatus,
  logout,
  saveToken,
  getToken,
  wechatAutoLogin,
  initAuth
};
