// app.js
App({
  globalData: {
    userInfo: null,
    token: null,
    apiBaseUrl: 'http://localhost:8000/api'  // 生产环境需要替换为实际域名
  },
  
  // 公司信息
  companyInfo: {
    fullName: '河南新盟科教有限公司',
    shortName: '新盟科教'
  },

  onLaunch() {
    // 尝试微信自动登录
    this.wechatAutoLogin();
  },

  // 微信自动登录
  async wechatAutoLogin() {
    try {
      // 先检查本地是否有 token
      const token = wx.getStorageSync('token');
      if (token) {
        this.globalData.token = token;
        // 验证 token 是否有效
        const isValid = await this.checkLoginStatus();
        if (isValid) {
          console.log('✅ 使用本地 token 自动登录成功');
          return;
        }
      }

      // 检查后端是否支持微信登录（如果接口不存在，跳过微信登录）
      // 这里不主动调用，让用户手动点击微信登录按钮
      console.log('ℹ️ 微信自动登录功能需要后端支持');
    } catch (error) {
      console.error('❌ 微信自动登录异常:', error);
    }
  },

  // 获取微信登录 code
  getWechatCode() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: resolve,
        fail: reject
      });
    });
  },

  // 微信登录（通过 OpenID）
  wechatLogin(code) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.globalData.apiBaseUrl}/auth/wechat-login`,
        method: 'POST',
        data: { code },
        success: (res) => {
          if (res.statusCode === 200) {
            // 已绑定，自动登录成功
            if (res.data.access_token) {
              this.globalData.token = res.data.access_token;
              wx.setStorageSync('token', res.data.access_token);
              this.checkLoginStatus();
              resolve({ autoLogin: true, data: res.data });
            } else {
              // 未绑定，需要用户输入账号密码
              resolve({ autoLogin: false, message: res.data.message || '需要绑定账号' });
            }
          } else if (res.statusCode === 404) {
            // 404 可能是两种情况：
            // 1. 接口不存在（路由未注册）
            // 2. 用户未绑定账号（正常业务逻辑）
            // 通过检查响应数据来判断
            if (res.data && res.data.detail && res.data.detail.includes('需要绑定账号')) {
              // 这是正常的业务逻辑：用户未绑定账号
              resolve({ autoLogin: false, message: res.data.detail || '需要绑定账号' });
            } else {
              // 接口不存在
              reject({ 
                message: '微信登录功能暂未启用，请使用账号密码登录',
                code: 'NOT_IMPLEMENTED'
              });
            }
          } else if (res.statusCode === 400) {
            // 未绑定账号或其他业务错误
            resolve({ autoLogin: false, message: res.data.detail || '需要绑定账号' });
          } else {
            reject(res.data);
          }
        },
        fail: (err) => {
          // 网络错误或其他错误
          reject({ 
            message: '微信登录失败，请检查网络连接或使用账号密码登录',
            error: err
          });
        }
      });
    });
  },

  // 检查登录状态
  checkLoginStatus() {
    return new Promise((resolve) => {
      if (!this.globalData.token) {
        resolve(false);
        return;
      }

      wx.request({
        url: `${this.globalData.apiBaseUrl}/users/me`,
        header: {
          'Authorization': `Bearer ${this.globalData.token}`
        },
        success: (res) => {
          if (res.statusCode === 200) {
            this.globalData.userInfo = res.data;
            resolve(true);
          } else {
            this.logout();
            resolve(false);
          }
        },
        fail: () => {
          this.logout();
          resolve(false);
        }
      });
    });
  },

  // 登录（账号密码登录，支持绑定微信 OpenID）
  login(username, password, wechatCode = null) {
    return new Promise((resolve, reject) => {
      // 优先使用传入的 wechatCode，否则检查本地存储
      if (!wechatCode) {
        wechatCode = wx.getStorageSync('wechat_code');
      }
      
      const requestData = { username, password };
      if (wechatCode) {
        requestData.wechat_code = wechatCode;
      }

      wx.request({
        url: `${this.globalData.apiBaseUrl}/auth/login`,
        method: 'POST',
        data: requestData,
        success: (res) => {
          if (res.statusCode === 200) {
            this.globalData.token = res.data.access_token;
            wx.setStorageSync('token', res.data.access_token);
            // 清除微信 code（已绑定）
            if (wechatCode) {
              wx.removeStorageSync('wechat_code');
            }
            this.checkLoginStatus();
            resolve(res.data);
          } else {
            reject(res.data);
          }
        },
        fail: reject
      });
    });
  },

  // 退出登录
  logout() {
    this.globalData.token = null;
    this.globalData.userInfo = null;
    wx.removeStorageSync('token');
    wx.reLaunch({
      url: '/pages/login/login'
    });
  },

  // API请求封装（带调试日志）
  request(options) {
    return new Promise((resolve, reject) => {
      const { url, method = 'GET', data = {} } = options;
      
      // 打印请求日志（小程序中可以直接打印，不影响性能）
      console.log('📤 请求:', method, url, data);
      
      wx.request({
        url: `${this.globalData.apiBaseUrl}${url}`,
        method,
        data,
        header: {
          'Content-Type': 'application/json',
          'Authorization': this.globalData.token ? `Bearer ${this.globalData.token}` : ''
        },
        success: (res) => {
          // 打印响应日志
          console.log('✅ 响应:', res.statusCode, res.data);
          
          if (res.statusCode === 401) {
            console.warn('❌ 未授权，清除登录状态');
            this.logout();
            reject({ message: '未授权，请重新登录' });
          } else if (res.statusCode === 200 || res.statusCode === 201) {
            // 确保返回的数据不是 null 或 undefined
            let responseData = res.data;
            
            // 如果响应数据是 null 或 undefined，根据 URL 判断返回类型
            if (responseData === null || responseData === undefined) {
              const isListEndpoint = options.url.includes('/my') || 
                                    options.url.includes('/pending') || 
                                    options.url.includes('/list') ||
                                    options.url.includes('/attendance');
              responseData = isListEndpoint ? [] : {};
            } 
            // 如果是数组，确保数组本身和元素都是有效的
            else if (Array.isArray(responseData)) {
              // 过滤掉 null/undefined 元素，并确保每个元素都是有效的对象
              responseData = responseData.filter(item => {
                // 确保元素不是 null/undefined，且是对象类型
                if (item === null || item === undefined) {
                  return false;
                }
                // 确保是对象类型（不是基本类型）
                if (typeof item !== 'object') {
                  return false;
                }
                // 确保对象不是 null（typeof null === 'object' 的特殊情况）
                if (item === null) {
                  return false;
                }
                return true;
              });
            }
            // 如果是对象，确保不是 null
            else if (typeof responseData === 'object') {
              // 对象本身应该是安全的，但确保它不是 null
              if (responseData === null) {
                responseData = {};
              }
            }
            
            resolve(responseData);
          } else {
            console.error('❌ 错误响应:', res.statusCode, res.data);
            reject(res.data || { message: '请求失败' });
          }
        },
        fail: (err) => {
          console.error('❌ 请求失败:', err);
          reject(err);
        }
      });
    });
  }
});



