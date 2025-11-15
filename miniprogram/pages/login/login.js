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
      // 先尝试获取微信 code（用于绑定）
      let wechatCode = null;
      try {
        const loginRes = await app.getWechatCode();
        if (loginRes.code) {
          wechatCode = loginRes.code;
        }
      } catch (error) {
        console.warn('获取微信code失败，将不进行绑定:', error);
        // 获取微信code失败不影响登录，继续执行
      }

      // 如果已经有保存的微信code（从自动登录流程来的），优先使用
      const savedCode = wx.getStorageSync('wechat_code');
      if (savedCode) {
        wechatCode = savedCode;
      }

      // 执行登录（如果提供了微信code，会自动绑定）
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
    } catch (error) {
      wx.hideLoading();
      this.setData({
        errorMessage: error.detail || error.message || '登录失败，请检查用户名和密码'
      });
    }
  }
});



