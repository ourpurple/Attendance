// pages/login/login.js
const app = getApp();

Page({
  data: {
    username: '',
    password: '',
    errorMessage: '',
    isWechatBinding: false,  // 是否为微信绑定模式
    showNetworkTest: false   // 是否显示网络测试按钮
  },

  // 请求订阅消息授权
  requestSubscribeMessage() {
    return app.requestSubscribeMessage();
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
      // 已登录，请求订阅消息授权（首次登录时显示提示）
      // 等待授权流程完全完成后再跳转
      await this.requestSubscribeMessageWithTip();
      // 已登录，跳转到首页
      wx.switchTab({
        url: '/pages/index/index'
      });
    }
  },

  // 请求订阅消息授权（带提示）
  async requestSubscribeMessageWithTip() {
    // 检查是否首次登录（通过检查是否已授权过）
    const hasAuthorized = wx.getStorageSync('subscribe_message_authorized');
    
    if (!hasAuthorized) {
      // 首次登录，显示详细说明
      const authResult = await app.requestSubscribeMessage([], {
        showTip: true,
        tipTitle: '订阅消息授权',
        tipContent: '为了及时通知您重要的审批信息，需要您授权接收订阅消息。\n\n' +
          '📋 待审批通知：审批人接收待审批申请提醒\n' +
          '📋 审批结果通知：申请人接收审批结果通知\n\n' +
          '⚠️ 如果拒绝授权，将无法收到重要通知，建议允许授权。'
      });
      
      // 检查授权结果并给出详细反馈
      if (authResult && authResult.success) {
        // 保存授权状态
        const authStatus = {
          allAccepted: authResult.allAccepted,
          acceptedCount: authResult.accepted,
          totalCount: authResult.total,
          timestamp: Date.now()
        };
        wx.setStorageSync('subscribe_message_auth_status', authStatus);
        
        // 如果部分授权，延迟显示提示（避免与成功提示冲突）
        if (authResult.partialAccepted) {
          setTimeout(() => {
            wx.showModal({
              title: '授权提醒',
              content: `您已授权 ${authResult.accepted} 个模板，但拒绝了 ${authResult.rejected} 个模板。\n\n为了确保能收到所有类型的通知，建议允许所有模板授权。`,
              showCancel: true,
              cancelText: '稍后',
              confirmText: '重新授权',
              success: (res) => {
                if (res.confirm) {
                  // 用户选择重新授权，清除状态并重新授权
                  wx.removeStorageSync('subscribe_message_authorized');
                  this.requestSubscribeMessageWithTip();
                }
              }
            });
          }, 2500);
        }
      }
      
      // 标记已授权过（无论成功与否）
      wx.setStorageSync('subscribe_message_authorized', true);
    } else {
      // 非首次登录，静默授权（不显示提示）
      const authResult = await app.requestSubscribeMessage();
      
      // 检查授权状态，如果之前是部分授权，现在检查是否全部授权成功
      if (authResult && authResult.success) {
        const previousStatus = wx.getStorageSync('subscribe_message_auth_status');
        if (previousStatus && !previousStatus.allAccepted) {
          // 之前是部分授权，现在检查是否全部授权成功
          if (authResult.allAccepted) {
            wx.showToast({
              title: '授权已完成',
              icon: 'success',
              duration: 2000
            });
          }
        }
        
        // 更新授权状态
        const authStatus = {
          allAccepted: authResult.allAccepted,
          acceptedCount: authResult.accepted,
          totalCount: authResult.total,
          timestamp: Date.now()
        };
        wx.setStorageSync('subscribe_message_auth_status', authStatus);
      }
    }
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  // 测试网络连接
  async testNetwork() {
    wx.showLoading({ title: '测试中...' });
    
    try {
      // 尝试访问一个简单的API端点
      const testUrl = `${app.globalData.apiBaseUrl}/users/me`;
      const systemInfo = app.getSystemInfo();
      const isAndroid = systemInfo.platform === 'android';
      
      wx.request({
        url: testUrl,
        method: 'GET',
        timeout: isAndroid ? 60000 : 30000,
        enableCache: false,
        enableHttp2: !isAndroid,
        header: {
          'Content-Type': 'application/json'
        },
        success: (res) => {
          wx.hideLoading();
          if (res.statusCode === 401 || res.statusCode === 403) {
            // 401/403说明网络是通的，只是需要登录
            wx.showModal({
              title: '网络测试',
              content: '✅ 网络连接正常！\n\n服务器可以访问，请检查：\n1. 用户名和密码是否正确\n2. 账号是否被禁用',
              showCancel: false,
              confirmText: '知道了'
            });
          } else {
            wx.showModal({
              title: '网络测试',
              content: `✅ 网络连接正常！\n\n服务器响应：${res.statusCode}`,
              showCancel: false,
              confirmText: '知道了'
            });
          }
        },
        fail: (err) => {
          wx.hideLoading();
          let errorMsg = '网络连接失败';
          
          if (err.errMsg) {
            if (err.errMsg.includes('domain') || err.errMsg.includes('域名') || err.errMsg.includes('不在以下 request 合法域名')) {
              errorMsg = '❌ 域名未配置！\n\n请在微信公众平台配置合法域名：\n1. 登录 mp.weixin.qq.com\n2. 开发版：开发→开发管理→开发设置\n3. 正式版：设置→基本设置\n4. 在"request合法域名"中添加：\noa.ruoshui-edu.cn\n5. 保存后等待生效';
            } else if (err.errMsg.includes('timeout')) {
              errorMsg = '❌ 请求超时\n\n请检查：\n1. 网络连接是否正常\n2. 服务器是否正常运行';
            } else if (err.errMsg.includes('ssl') || err.errMsg.includes('证书') || err.errMsg.includes('ERR_CERT') || err.errMsg.includes('CERT_DATE')) {
              // SSL证书错误，特别是证书日期无效
              if (err.errMsg.includes('ERR_CERT_DATE_INVALID') || err.errMsg.includes('CERT_DATE')) {
                errorMsg = '❌ SSL证书日期无效！\n\n微信8.0.64+版本对证书验证更严格。\n\n可能原因：\n1. SSL证书已过期\n2. 证书还未生效\n3. 服务器时间不正确\n\n解决：\n1. 检查服务器SSL证书有效期\n2. 确保证书未过期\n3. 检查服务器系统时间\n4. 更新证书后重试';
              } else {
                errorMsg = '❌ SSL证书错误\n\n请检查服务器SSL证书配置：\n1. 证书是否有效\n2. 证书是否过期\n3. 证书链是否完整';
              }
            } else {
              errorMsg = `❌ 网络错误：${err.errMsg}\n\n请检查：\n1. 网络连接\n2. 域名配置\n3. 服务器状态`;
            }
          }
          
          wx.showModal({
            title: '网络测试结果',
            content: errorMsg,
            showCancel: false,
            confirmText: '知道了'
          });
        }
      });
    } catch (error) {
      wx.hideLoading();
      wx.showModal({
        title: '网络测试失败',
        content: error.message || '无法测试网络连接',
        showCancel: false,
        confirmText: '知道了'
      });
    }
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
        // 请求订阅消息授权（首次登录时显示提示）
        await this.requestSubscribeMessageWithTip();
        // 延迟一下，确保授权弹窗已显示
        await new Promise(resolve => setTimeout(resolve, 100));
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
      // 如果是微信绑定模式，必须获取新的微信 code（旧的code可能已过期）
      let wechatCode = null;
      if (this.data.isWechatBinding) {
        try {
          // 必须获取新的微信 code，不使用旧的code
          const loginRes = await app.getWechatCode();
          if (loginRes.code) {
            wechatCode = loginRes.code;
            // 更新保存的code
            wx.setStorageSync('wechat_code', loginRes.code);
          } else {
            // 如果无法获取code，提示用户
            wx.hideLoading();
            wx.showModal({
              title: '提示',
              content: '无法获取微信授权，请重新点击"微信登录"按钮，或直接使用账号密码登录（不绑定微信）',
              showCancel: true,
              cancelText: '直接登录',
              confirmText: '重新获取',
              success: (res) => {
                if (res.confirm) {
                  // 用户选择重新获取，清除绑定状态，让用户重新点击微信登录
                  wx.removeStorageSync('wechat_code');
                  this.setData({ 
                    isWechatBinding: false,
                    errorMessage: '请重新点击"微信登录"按钮'
                  });
                } else {
                  // 用户选择直接登录，不绑定微信
                  this.setData({ isWechatBinding: false });
                  // 直接执行登录，不带微信code
                  wx.showLoading({ title: '登录中...' });
                  app.login(username, password, null).then(async () => {
                    wx.hideLoading();
                    // 请求订阅消息授权（首次登录时显示提示）
                    await this.requestSubscribeMessageWithTip();
                    wx.switchTab({
                      url: '/pages/index/index'
                    });
                  }).catch((err) => {
                    wx.hideLoading();
                    this.setData({
                      errorMessage: err.detail || err.message || '登录失败，请检查用户名和密码'
                    });
                  });
                }
              }
            });
            return;
          }
        } catch (error) {
          console.warn('获取微信code失败:', error);
          // 如果获取新code失败，提示用户
          wx.hideLoading();
          wx.showModal({
            title: '提示',
            content: '获取微信授权失败，请重新点击"微信登录"按钮，或直接使用账号密码登录（不绑定微信）',
            showCancel: true,
            cancelText: '直接登录',
            confirmText: '重新获取',
            success: (res) => {
              if (res.confirm) {
                // 用户选择重新获取，清除绑定状态
                wx.removeStorageSync('wechat_code');
                this.setData({ 
                  isWechatBinding: false,
                  errorMessage: '请重新点击"微信登录"按钮'
                });
              } else {
                // 用户选择直接登录，不绑定微信
                this.setData({ isWechatBinding: false });
                // 直接执行登录，不带微信code
                wx.showLoading({ title: '登录中...' });
                app.login(username, password, null).then(() => {
                  wx.hideLoading();
                  wx.switchTab({
                    url: '/pages/index/index'
                  });
                }).catch((err) => {
                  wx.hideLoading();
                  this.setData({
                    errorMessage: err.detail || err.message || '登录失败，请检查用户名和密码'
                  });
                });
              }
            }
          });
          return;
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
        setTimeout(async () => {
          // 请求订阅消息授权（首次登录时显示提示）
          await this.requestSubscribeMessageWithTip();
          wx.switchTab({
            url: '/pages/index/index'
          });
        }, 1500);
      } else {
        // 请求订阅消息授权（首次登录时显示提示）
        await this.requestSubscribeMessageWithTip();
        // 延迟一下，确保授权弹窗已显示
        await new Promise(resolve => setTimeout(resolve, 100));
        wx.switchTab({
          url: '/pages/index/index'
        });
        }
      } catch (loginError) {
        // 如果登录失败是因为code失效，尝试重新获取code
        if (loginError.detail && (loginError.detail.includes('invalid code') || loginError.detail.includes('授权码已失效'))) {
          console.log('微信code已失效，尝试重新获取...');
          
          // 清除旧的code
          wx.removeStorageSync('wechat_code');
          
          // 如果是绑定模式，尝试重新获取code
          if (this.data.isWechatBinding) {
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
                
                setTimeout(async () => {
                  // 请求订阅消息授权（首次登录时显示提示）
                  await this.requestSubscribeMessageWithTip();
                  wx.switchTab({
                    url: '/pages/index/index'
                  });
                }, 1500);
                return;
              }
            } catch (retryError) {
              console.error('重新获取code失败:', retryError);
              // 如果重新获取失败，提示用户
              wx.hideLoading();
              wx.showModal({
                title: '提示',
                content: '微信授权码已失效，无法完成绑定。是否直接登录（不绑定微信）？',
                showCancel: true,
                cancelText: '取消',
                confirmText: '直接登录',
                success: (res) => {
                  if (res.confirm) {
                    // 用户选择直接登录，不绑定微信
                    this.setData({ isWechatBinding: false });
                    // 直接执行登录，不带微信code
                    wx.showLoading({ title: '登录中...' });
                    app.login(username, password, null).then(() => {
                      wx.hideLoading();
                      wx.switchTab({
                        url: '/pages/index/index'
                      });
                    }).catch((err) => {
                      wx.hideLoading();
                      this.setData({
                        errorMessage: err.detail || err.message || '登录失败，请检查用户名和密码'
                      });
                    });
                  } else {
                    this.setData({
                      errorMessage: '请重新点击"微信登录"按钮获取新的授权码'
                    });
                  }
                }
              });
              return;
            }
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
            success: async () => {
              // 请求订阅消息授权（首次登录时显示提示）
              await this.requestSubscribeMessageWithTip();
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
      
      // 显示详细的错误信息，特别是针对安卓的网络错误
      let errorMsg = error.detail || error.message || '登录失败，请检查用户名和密码';
      
      // 判断是否是网络错误，显示网络测试按钮
      const isNetworkError = error.detail && (
        error.detail.includes('网络') || 
        error.detail.includes('域名') || 
        error.detail.includes('连接') ||
        error.detail.includes('request合法域名') ||
        error.errMsg && (
          error.errMsg.includes('domain') || 
          error.errMsg.includes('fail') ||
          error.errMsg.includes('timeout')
        )
      );
      
      // 如果是网络错误，显示更详细的提示
      if (isNetworkError) {
        // 网络错误，显示详细提示
        wx.showModal({
          title: '登录失败',
          content: errorMsg,
          showCancel: false,
          confirmText: '知道了',
          success: () => {
            this.setData({ 
              errorMessage: errorMsg,
              showNetworkTest: true
            });
          }
        });
      } else {
        // 其他错误，直接显示
      this.setData({
          errorMessage: errorMsg,
          showNetworkTest: false
        });
      }
      
      // 打印详细错误信息到控制台，方便调试
      console.error('登录错误详情:', {
        error: error,
        detail: error.detail,
        message: error.message,
        errMsg: error.errMsg,
        platform: error.platform
      });
    }
  }
});



