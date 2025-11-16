// pages/login/login.js
const app = getApp();

Page({
  data: {
    username: '',
    password: '',
    errorMessage: '',
    isWechatBinding: false  // 是否为微信绑定模式
  },

  onLoad() {
    // 检查是否有微信 code（需要绑定）
    const wechatCode = wx.getStorageSync('wechat_code');
    if (wechatCode) {
      this.setData({ isWechatBinding: true });
    }

    // 检查是否已登录
    if (app.globalData.token) {
      this.checkAutoLogin();
    }
  },

  onShow() {
    // 每次显示时检查是否已登录
    if (app.globalData.token) {
      this.checkAutoLogin();
    }
  },

  // 检查自动登录状态
  async checkAutoLogin() {
    const isValid = await app.checkLoginStatus();
    if (isValid) {
      // 已登录，跳转到首页
      wx.switchTab({
        url: '/pages/index/index'
      });
    }
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  // 微信登录
  async handleWechatLogin() {
    wx.showLoading({ title: '登录中...' });

    try {
      // 获取微信 code
      const loginRes = await app.getWechatCode();
      if (!loginRes.code) {
        wx.hideLoading();
        this.setData({ errorMessage: '获取微信授权失败，请重试' });
        return;
      }

      // 尝试微信登录
      const result = await app.wechatLogin(loginRes.code);
      wx.hideLoading();

      if (result.autoLogin) {
        // 自动登录成功
        wx.switchTab({
          url: '/pages/index/index'
        });
      } else {
        // 需要绑定账号
        wx.setStorageSync('wechat_code', loginRes.code);
        this.setData({ 
          isWechatBinding: true,
          errorMessage: '首次使用需要绑定账号，请输入用户名和密码'
        });
      }
    } catch (error) {
      wx.hideLoading();
      
      // 如果接口未实现，显示友好提示
      if (error.code === 'NOT_IMPLEMENTED' || error.message?.includes('暂未启用')) {
        wx.showModal({
          title: '提示',
          content: '微信登录功能暂未启用，请使用账号密码登录',
          showCancel: false,
          confirmText: '知道了'
        });
        this.setData({
          errorMessage: '微信登录功能暂未启用'
        });
      } else {
        this.setData({
          errorMessage: error.detail || error.message || '微信登录失败，请使用账号密码登录'
        });
      }
    }
  },

  // 账号密码登录
  async handleLogin() {
    const { username, password } = this.data;

    if (!username || !password) {
      this.setData({ errorMessage: '请输入用户名和密码' });
      return;
    }

    wx.showLoading({ title: this.data.isWechatBinding ? '绑定中...' : '登录中...' });

    try {
      // 如果是微信绑定模式，优先获取新的微信 code（旧的code可能已过期）
      let wechatCode = null;
      if (this.data.isWechatBinding) {
        try {
          // 先尝试获取新的微信 code
          const loginRes = await app.getWechatCode();
          if (loginRes.code) {
            wechatCode = loginRes.code;
            // 更新保存的code
            wx.setStorageSync('wechat_code', loginRes.code);
          }
        } catch (error) {
          console.warn('获取微信code失败:', error);
          // 如果获取新code失败，尝试使用保存的code
          const savedCode = wx.getStorageSync('wechat_code');
          if (savedCode) {
            wechatCode = savedCode;
          }
        }
      } else {
        // 非绑定模式，尝试获取微信 code（用于绑定）
        try {
          const loginRes = await app.getWechatCode();
          if (loginRes.code) {
            wechatCode = loginRes.code;
          }
        } catch (error) {
          console.warn('获取微信code失败，将不进行绑定:', error);
          // 获取微信code失败不影响登录，继续执行
        }
      }

      // 执行登录（如果提供了微信code，会自动绑定）
      try {
        await app.login(username, password, wechatCode);
        
        // 清除保存的微信code（已绑定）
        if (wechatCode) {
          wx.removeStorageSync('wechat_code');
        }
        
        wx.hideLoading();
        
        // 如果成功绑定了微信，显示提示
        if (wechatCode) {
          wx.showToast({
            title: '登录成功，已绑定微信',
            icon: 'success',
            duration: 2000
          });
          
          // 延迟跳转，让用户看到提示
          setTimeout(() => {
            wx.switchTab({
              url: '/pages/index/index'
            });
          }, 1500);
        } else {
          wx.switchTab({
            url: '/pages/index/index'
          });
        }
      } catch (loginError) {
        // 如果登录失败是因为code失效，尝试重新获取code
        if (loginError.detail && loginError.detail.includes('invalid code')) {
          console.log('微信code已失效，尝试重新获取...');
          
          // 清除旧的code
          wx.removeStorageSync('wechat_code');
          
          // 重新获取code并重试
          try {
            const loginRes = await app.getWechatCode();
            if (loginRes.code) {
              // 使用新的code重试登录
              await app.login(username, password, loginRes.code);
              
              wx.removeStorageSync('wechat_code');
              wx.hideLoading();
              
              wx.showToast({
                title: '登录成功，已绑定微信',
                icon: 'success',
                duration: 2000
              });
              
              setTimeout(() => {
                wx.switchTab({
                  url: '/pages/index/index'
                });
              }, 1500);
              return;
            }
          } catch (retryError) {
            console.error('重新获取code失败:', retryError);
          }
        }
        
        // 如果绑定失败但不影响登录，继续执行
        if (loginError.detail && loginError.detail.includes('获取微信OpenID失败')) {
          // code失效，但不影响登录，允许用户继续
          wx.hideLoading();
          wx.showModal({
            title: '提示',
            content: '微信绑定失败（code已过期），但登录成功。下次登录时可重新绑定微信。',
            showCancel: false,
            confirmText: '知道了',
            success: () => {
              wx.switchTab({
                url: '/pages/index/index'
              });
            }
          });
          return;
        }
        
        // 其他错误，抛出异常
        throw loginError;
      }
    } catch (error) {
      wx.hideLoading();
      this.setData({
        errorMessage: error.detail || error.message || '登录失败，请检查用户名和密码'
      });
    }
  }
});



