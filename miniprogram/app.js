// app.js
App({
  globalData: {
    userInfo: null,
    token: null,
    apiBaseUrl: 'http://localhost:8000/api',  // 本地开发使用 http://localhost
    // apiBaseUrl: 'https://your-domain.com/api',  // 生产环境使用 https://your-domain.com
    subscribeTemplateIds: [
      'JzcNdxTsNr-OTqMjqzF4xx1GRZab-lMXXq6ux-vIdxM',  // 待审批通知模板ID（审批提醒）
      '58inG1DfC2U_9Za0Csn4zxilWJP_kqAP5SejR6rAF4A'     // 审批结果通知模板ID（需要替换为实际ID）
    ]
  },
  /**
   * 检查授权状态
   * @returns {Object|null} 授权状态信息，如果未授权过返回null
   */
  getSubscribeMessageAuthStatus() {
    try {
      return wx.getStorageSync('subscribe_message_auth_status') || null;
    } catch (e) {
      console.warn('获取授权状态失败:', e);
      return null;
    }
  },

  /**
   * 检查是否所有模板都已授权
   * @returns {boolean} 是否全部授权成功
   */
  isAllSubscribeMessageAuthorized() {
    const status = this.getSubscribeMessageAuthStatus();
    if (!status) return false;
    
    const expectedCount = this.globalData.subscribeTemplateIds?.length || 0;
    return status.allAccepted && status.acceptedCount === expectedCount;
  },

  /**
   * 统一请求订阅消息授权
   * @param {string[]} extraTemplateIds 可选，额外指定模板ID
   * @param {Object} options 可选配置
   * @param {boolean} options.showTip 是否显示授权说明提示（默认：false）
   * @param {string} options.tipTitle 提示标题（默认：'订阅消息授权'）
   * @param {string} options.tipContent 提示内容
   * @returns {Promise<{success?: boolean, skipped?: boolean, result?: Object}>}
   */
  requestSubscribeMessage(extraTemplateIds = [], options = {}) {
    const idsFromGlobal = Array.isArray(this.globalData.subscribeTemplateIds)
      ? this.globalData.subscribeTemplateIds
      : [];
    const tmplIds = (Array.isArray(extraTemplateIds) && extraTemplateIds.length
      ? extraTemplateIds
      : idsFromGlobal
    ).filter(id => !!id);

    // 检查模板ID配置
    if (tmplIds.length > 0) {
      // 检查是否有重复的模板ID
      const uniqueIds = [...new Set(tmplIds)];
      if (uniqueIds.length !== tmplIds.length) {
        console.warn('警告：模板ID配置有重复，可能导致授权问题', {
          original: tmplIds,
          unique: uniqueIds
        });
        // 使用去重后的ID
        tmplIds.splice(0, tmplIds.length, ...uniqueIds);
      }
      
      // 检查模板ID是否还是占位符
      const placeholderPattern = /TODO|YOUR_|占位符|placeholder/i;
      const hasPlaceholder = tmplIds.some(id => placeholderPattern.test(id));
      if (hasPlaceholder) {
        console.warn('警告：模板ID可能还是占位符，请检查配置', tmplIds);
      }
    }

    if (!tmplIds.length || typeof wx.requestSubscribeMessage !== 'function') {
      return Promise.resolve({ skipped: true });
    }

    return new Promise(resolve => {
      // 如果需要显示提示，先显示说明
      if (options.showTip) {
        const tipContent = options.tipContent || 
          '为了及时通知您重要的审批信息，需要您授权接收订阅消息。\n\n' +
          '• 待审批通知：审批人接收待审批申请提醒\n' +
          '• 审批结果通知：申请人接收审批结果通知\n\n' +
          '如果拒绝授权，将无法收到重要通知，建议允许授权。';
        
        wx.showModal({
          title: options.tipTitle || '订阅消息授权',
          content: tipContent,
          showCancel: true,
          cancelText: '稍后',
          confirmText: '去授权',
          success: (modalRes) => {
            if (modalRes.confirm) {
              // 用户点击"去授权"，继续授权流程
              // 等待一下，确保 modal 完全关闭后再显示授权弹窗
              setTimeout(() => {
                this._doRequestSubscribeMessage(tmplIds, resolve);
              }, 300);
            } else {
              // 用户点击"稍后"，跳过授权
              resolve({ skipped: true, reason: 'user_cancelled' });
            }
          }
        });
      } else {
        // 直接授权，不显示提示
        this._doRequestSubscribeMessage(tmplIds, resolve);
      }
    });
  },

  /**
   * 执行订阅消息授权请求
   * @private
   */
  _doRequestSubscribeMessage(tmplIds, resolve) {
    // 立即调用 wx.requestSubscribeMessage，它会立即显示授权弹窗
    // 但是我们需要等待用户操作完成后才 resolve Promise
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        // 检查授权结果
        const templateIds = Object.keys(res);
        const accepted = templateIds.filter(id => res[id] === 'accept');
        const rejected = templateIds.filter(id => res[id] === 'reject');
        const ban = templateIds.filter(id => res[id] === 'ban');
        
        const acceptedCount = accepted.length;
        const rejectedCount = rejected.length + ban.length;
        const totalCount = templateIds.length;
        const expectedCount = tmplIds.length;
        
        // 延迟显示提示，确保授权弹窗已关闭
        setTimeout(() => {
          // 如果全部授权成功
          if (acceptedCount === expectedCount && expectedCount > 0) {
            wx.showToast({
              title: `授权成功（${acceptedCount}/${expectedCount}）`,
              icon: 'success',
              duration: 2000
            });
          } 
          // 如果全部拒绝
          else if (rejectedCount === expectedCount) {
            wx.showModal({
              title: '授权提示',
              content: '您拒绝了所有订阅消息授权，将无法收到重要的审批通知。\n\n建议允许授权，以便及时了解审批状态。\n\n您可以在下次操作时重新授权。',
              showCancel: false,
              confirmText: '知道了'
            });
          } 
          // 如果部分授权成功
          else if (acceptedCount > 0 && rejectedCount > 0) {
            // 构建详细的提示信息
            let detailMsg = `您已授权 ${acceptedCount} 个模板，拒绝了 ${rejectedCount} 个模板。\n\n`;
            
            // 根据模板ID判断哪个模板授权成功/失败
            // 注意：这里需要使用传入的 tmplIds，因为可能是通过 extraTemplateIds 传入的
            const approvalTemplateId = tmplIds[0] || '';
            const resultTemplateId = tmplIds[1] || '';
            
            const approvalAccepted = accepted.includes(approvalTemplateId);
            const resultAccepted = accepted.includes(resultTemplateId);
            
            if (!approvalAccepted && !resultAccepted) {
              detailMsg += '⚠️ 待审批通知和审批结果通知都未授权。';
            } else if (!approvalAccepted) {
              detailMsg += '⚠️ 待审批通知未授权，审批人将无法收到待审批提醒。';
            } else if (!resultAccepted) {
              detailMsg += '⚠️ 审批结果通知未授权，申请人将无法收到审批结果通知。';
            }
            
            detailMsg += '\n\n建议允许所有模板授权，以便及时了解审批状态。';
            
            wx.showModal({
              title: '授权提示',
              content: detailMsg,
              showCancel: true,
              cancelText: '稍后',
              confirmText: '重新授权',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  // 用户选择重新授权，清除状态并重新授权
                  wx.removeStorageSync('subscribe_message_authorized');
                  wx.removeStorageSync('subscribe_message_auth_status');
                  // 延迟一下再重新授权
                  setTimeout(() => {
                    this.requestSubscribeMessage([], { showTip: true });
                  }, 500);
                }
              }
            });
          }
          // 如果部分拒绝（但没有成功授权的）
          else if (rejectedCount > 0) {
            wx.showModal({
              title: '授权提示',
              content: `您拒绝了 ${rejectedCount} 个模板的授权，可能无法收到部分通知。\n\n建议允许所有模板授权，以便及时了解审批状态。`,
              showCancel: false,
              confirmText: '知道了'
            });
          }
        }, 500);
        
        // 授权完成，resolve Promise
        resolve({ 
          success: true, 
          res,
          accepted: acceptedCount,
          rejected: rejectedCount,
          ban: ban.length,
          total: totalCount,
          // 添加详细的授权状态
          allAccepted: acceptedCount === totalCount && totalCount > 0,
          allRejected: rejectedCount === totalCount,
          partialAccepted: acceptedCount > 0 && rejectedCount > 0,
          acceptedIds: accepted,
          rejectedIds: rejected.concat(ban)
        });
      },
      fail: (err) => {
        console.warn('请求订阅消息授权失败:', err);
        resolve({ success: false, err });
      }
    });
    
    // 注意：wx.requestSubscribeMessage 会立即显示授权弹窗
    // 但是 success/fail 回调会在用户操作完成后才执行
    // 所以 Promise 会在用户完成授权操作后才 resolve
  },
  
  // 公司信息
  companyInfo: {
    fullName: '河南新盟科教有限公司',
    shortName: '新盟科教'
  },

  // 缓存系统信息，避免频繁调用
  _systemInfoCache: null,
  _systemInfoCacheTime: 0,
  _systemInfoCacheTimeout: 60000, // 缓存60秒

  // 获取系统信息（使用新API，兼容旧API，带缓存）
  getSystemInfo() {
    // 检查缓存
    const now = Date.now();
    if (this._systemInfoCache && (now - this._systemInfoCacheTime) < this._systemInfoCacheTimeout) {
      return this._systemInfoCache;
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
        
        // 确保返回的对象不为空且有效
        if (deviceInfo && appBaseInfo && windowInfo && 
            typeof deviceInfo === 'object' && 
            typeof appBaseInfo === 'object' && 
            typeof windowInfo === 'object') {
          systemInfo = {
            platform: deviceInfo.platform || 'unknown',
            system: deviceInfo.system || '',
            version: appBaseInfo.version || '',
            SDKVersion: appBaseInfo.SDKVersion || '',
            // 保留其他可能用到的字段
            screenWidth: windowInfo.screenWidth || 0,
            screenHeight: windowInfo.screenHeight || 0,
            pixelRatio: windowInfo.pixelRatio || 1
          };
        }
      } catch (error) {
        // 如果新API调用失败，降级使用旧API
        // 静默处理，避免触发微信内部错误上报
        try {
          systemInfo = wx.getSystemInfoSync();
        } catch (e) {
          // 忽略错误
        }
      }
    }
    
    // 如果新API失败，降级使用旧API（兼容旧版本微信）
    if (!systemInfo) {
      try {
        systemInfo = wx.getSystemInfoSync();
      } catch (error) {
        // 返回默认值，避免程序崩溃
        systemInfo = {
          platform: 'unknown',
          system: '',
          version: '',
          SDKVersion: '',
          screenWidth: 0,
          screenHeight: 0,
          pixelRatio: 1
        };
      }
    }

    // 缓存结果
    if (systemInfo) {
      this._systemInfoCache = systemInfo;
      this._systemInfoCacheTime = now;
    }

    return systemInfo || {
      platform: 'unknown',
      system: '',
      version: '',
      SDKVersion: '',
      screenWidth: 0,
      screenHeight: 0,
      pixelRatio: 1
    };
  },

  onLaunch() {
    // 添加全局错误处理，捕获微信内部错误
    this.setupErrorHandler();
    
    // 从本地存储恢复 token
    const token = wx.getStorageSync('token');
    if (token) {
      this.globalData.token = token;
      console.log('✅ 从本地存储恢复 token');
    }
    
    // 尝试微信自动登录
    this.wechatAutoLogin();
  },

  // 设置全局错误处理
  setupErrorHandler() {
    // 捕获未处理的错误
    const originalError = console.error;
    console.error = function(...args) {
      // 过滤掉微信内部的错误，避免影响用户体验
      const errorMsg = args.join(' ');
      if (errorMsg.includes('Java bridge method invocation error') ||
          errorMsg.includes('Java object is gone') ||
          errorMsg.includes('reportQualityData')) {
        // 静默处理微信内部错误，不输出到控制台
        return;
      }
      // 其他错误正常输出
      originalError.apply(console, args);
    };

    // 捕获未处理的 Promise 错误
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
        // 其他错误可以记录或上报
        console.warn('未处理的错误:', error);
      });
    }
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
      // 获取系统信息，针对不同平台和微信版本优化配置
      const systemInfo = this.getSystemInfo();
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
      
      // 构建请求配置
      const wechatRequestConfig = {
        url: `${this.globalData.apiBaseUrl}/auth/wechat-login`,
        method: 'POST',
        data: { code },
        timeout: isAndroid ? 60000 : 30000, // 安卓使用更长的超时时间
        enableCache: false, // 禁用缓存
      };
      
      // HTTP/2 配置：新版本微信（8.0.64+）在安卓上可能有HTTP/2问题
      if (isAndroid && isNewWechatVersion) {
        wechatRequestConfig.enableHttp2 = false;
        console.log('⚠️ 安卓 + 新版本微信(8.0.64+)，禁用HTTP/2');
      } else if (isAndroid) {
        wechatRequestConfig.enableHttp2 = false;
      } else {
        wechatRequestConfig.enableHttp2 = true;
      }
      
      wx.request({
        ...wechatRequestConfig,
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
      // 先尝试从本地存储获取 token
      if (!this.globalData.token) {
        const token = wx.getStorageSync('token');
        if (token) {
          this.globalData.token = token;
        } else {
          resolve(false);
          return;
        }
      }

      // 获取系统信息，针对不同平台和微信版本优化配置
      const systemInfo = this.getSystemInfo();
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
      
      // 构建请求配置
      const checkRequestConfig = {
        url: `${this.globalData.apiBaseUrl}/users/me`,
        header: {
          'Authorization': `Bearer ${this.globalData.token}`
        },
        timeout: isAndroid ? 60000 : 30000,
        enableCache: false,
      };
      
      // HTTP/2 配置
      if (isAndroid && isNewWechatVersion) {
        checkRequestConfig.enableHttp2 = false;
      } else if (isAndroid) {
        checkRequestConfig.enableHttp2 = false;
      } else {
        checkRequestConfig.enableHttp2 = true;
      }
      
      wx.request({
        ...checkRequestConfig,
        success: (res) => {
          if (res.statusCode === 200) {
            this.globalData.userInfo = res.data;
            resolve(true);
          } else {
            console.warn('❌ Token 验证失败，清除登录状态');
            this.logout();
            resolve(false);
          }
        },
        fail: (err) => {
          console.error('❌ 检查登录状态失败:', err);
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

      const loginUrl = `${this.globalData.apiBaseUrl}/auth/login`;
      console.log('🔐 登录请求:', loginUrl, { username, hasWechatCode: !!wechatCode });

      // 获取系统信息，针对不同平台和微信版本优化配置
      const systemInfo = this.getSystemInfo();
      const isAndroid = systemInfo.platform === 'android';
      
      // 解析微信版本号，处理版本兼容性
      const wechatVersion = systemInfo.version || '';
      const versionParts = wechatVersion.split('.').map(v => parseInt(v) || 0);
      const majorVersion = versionParts[0] || 0;
      const minorVersion = versionParts[1] || 0;
      const patchVersion = versionParts[2] || 0;
      
      // 微信8.0.64及更高版本可能需要特殊处理
      const isNewWechatVersion = majorVersion > 8 || 
                                 (majorVersion === 8 && minorVersion > 0) ||
                                 (majorVersion === 8 && minorVersion === 0 && patchVersion >= 64);
      
      console.log('微信版本信息:', {
        version: wechatVersion,
        major: majorVersion,
        minor: minorVersion,
        patch: patchVersion,
        isNewVersion: isNewWechatVersion,
        platform: systemInfo.platform
      });
      
      // 构建请求配置
      const loginRequestConfig = {
        url: loginUrl,
        method: 'POST',
        data: requestData,
        header: {
          'Content-Type': 'application/json'
        },
        timeout: isAndroid ? 60000 : 30000, // 安卓使用更长的超时时间
        enableCache: false, // 禁用缓存
      };
      
      // HTTP/2 配置：新版本微信（8.0.64+）在安卓上可能有HTTP/2问题
      if (isAndroid && isNewWechatVersion) {
        // 安卓 + 新版本微信，禁用HTTP/2
        loginRequestConfig.enableHttp2 = false;
        console.log('⚠️ 安卓 + 新版本微信(8.0.64+)，禁用HTTP/2');
      } else if (isAndroid) {
        // 安卓旧版本，也禁用HTTP/2（更安全）
        loginRequestConfig.enableHttp2 = false;
      } else {
        // iOS或其他平台，启用HTTP/2
        loginRequestConfig.enableHttp2 = true;
      }
      
      wx.request({
        ...loginRequestConfig,
        success: (res) => {
          console.log('🔐 登录响应:', res.statusCode, res.data);
          
          if (res.statusCode === 200) {
            if (res.data && res.data.access_token) {
              this.globalData.token = res.data.access_token;
              wx.setStorageSync('token', res.data.access_token);
              console.log('✅ 登录成功，Token 已保存');
              
              // 清除微信 code（已绑定）
              if (wechatCode) {
                wx.removeStorageSync('wechat_code');
              }
              
              // 验证登录状态
              this.checkLoginStatus().then(() => {
                resolve(res.data);
              }).catch((err) => {
                console.error('❌ 验证登录状态失败:', err);
                // 即使验证失败，也返回登录成功（token已保存）
                resolve(res.data);
              });
            } else {
              console.error('❌ 登录响应中缺少 access_token');
              reject({ 
                detail: '登录响应格式错误',
                message: '登录失败，请重试'
              });
            }
          } else {
            console.error('❌ 登录失败:', res.statusCode, res.data);
            reject(res.data || { 
              detail: `登录失败 (${res.statusCode})`,
              message: res.data?.detail || '登录失败，请检查用户名和密码'
            });
          }
        },
        fail: (err) => {
          console.error('❌ 登录请求失败:', err);
          console.error('❌ 错误详情:', JSON.stringify(err, null, 2));
          
          // 获取系统信息
          const systemInfo = this.getSystemInfo();
          const isAndroid = systemInfo.platform === 'android';
          
          // 提供更详细的错误信息，特别是针对安卓
          let errorMessage = '登录失败';
          let errorDetail = '';
          
          if (err.errMsg) {
            console.error('错误信息:', err.errMsg);
            
            if (err.errMsg.includes('timeout') || err.errMsg.includes('超时')) {
              errorMessage = '请求超时';
              errorDetail = isAndroid
                ? '网络连接超时（安卓设备），请检查：\n1. 网络连接是否正常\n2. 是否在微信公众平台配置了合法域名\n3. 服务器响应是否正常\n\n建议：\n1. 检查微信公众平台域名配置\n2. 尝试切换网络（WiFi/移动数据）\n3. 清除小程序缓存'
                : '网络连接超时，请检查网络连接或稍后重试';
            } else if (err.errMsg.includes('fail') || err.errMsg.includes('失败')) {
              errorMessage = '网络请求失败';
              
              // 检查是否是域名问题
              if (err.errMsg.includes('domain') || err.errMsg.includes('域名') || err.errMsg.includes('不在以下 request 合法域名')) {
                errorDetail = '域名配置错误（这是最常见的原因），请检查：\n1. 登录微信公众平台\n2. 开发版：开发→开发管理→开发设置→服务器域名\n3. 正式版：设置→基本设置→服务器域名\n4. 在"request合法域名"中添加：oa.ruoshui-edu.cn\n5. 注意：只需要域名，不要加/api\n6. 保存后等待几分钟生效';
              } else if (err.errMsg.includes('ssl') || err.errMsg.includes('证书') || err.errMsg.includes('certificate') || err.errMsg.includes('ERR_CERT') || err.errMsg.includes('CERT_DATE')) {
                // SSL证书错误，特别是证书日期无效
                if (err.errMsg.includes('ERR_CERT_DATE_INVALID') || err.errMsg.includes('CERT_DATE')) {
                  errorDetail = '❌ SSL证书日期无效！\n\n这是微信8.0.64+版本更严格的证书验证导致的。\n\n可能的原因：\n1. SSL证书已过期\n2. SSL证书还未生效（开始日期在未来）\n3. 服务器系统时间不正确\n4. 证书链不完整\n\n解决步骤：\n1. 检查服务器SSL证书有效期\n2. 确保证书未过期且已生效\n3. 检查服务器系统时间是否正确\n4. 确保证书链完整（包含中间证书）\n5. 重新申请或更新SSL证书\n6. 重启服务器后重试';
                } else {
                  errorDetail = 'SSL证书错误，请检查：\n1. 服务器SSL证书是否有效\n2. 证书是否过期\n3. 证书链是否完整\n4. 是否支持TLS 1.2及以上版本\n5. 服务器系统时间是否正确';
                }
              } else if (err.errMsg.includes('connect') || err.errMsg.includes('连接') || err.errMsg.includes('network')) {
                errorDetail = isAndroid
                  ? '无法连接到服务器（安卓设备），请检查：\n1. 网络连接是否正常\n2. 服务器是否正常运行\n3. 是否在微信公众平台配置了合法域名\n4. 尝试切换网络（WiFi/移动数据）\n5. 清除小程序缓存'
                  : '无法连接到服务器，请检查网络连接';
              } else {
                errorDetail = isAndroid
                  ? '网络请求失败（安卓设备），请检查：\n1. 微信公众平台是否配置了合法域名（request合法域名）\n2. 域名是否正确：oa.ruoshui-edu.cn（不要加/api）\n3. 是否使用HTTPS协议\n4. 网络连接是否正常\n5. 尝试清除小程序缓存后重试'
                  : '网络请求失败，请检查网络连接和域名配置';
            }
            } else if (err.errMsg.includes('abort') || err.errMsg.includes('取消')) {
              errorMessage = '请求已取消';
              errorDetail = '请求被取消，请重试';
            } else {
              errorDetail = `网络错误: ${err.errMsg}`;
              if (isAndroid) {
                errorDetail += '\n\n（安卓设备）最可能的原因：\n1. 未在微信公众平台配置合法域名\n2. 域名配置不正确\n\n解决步骤：\n1. 登录微信公众平台\n2. 配置"request合法域名"为：oa.ruoshui-edu.cn\n3. 保存并等待生效\n4. 清除小程序缓存后重试';
              }
            }
          } else {
            // 没有错误信息的情况
            errorDetail = isAndroid
              ? '网络请求失败（安卓设备），最可能的原因：\n\n❌ 未在微信公众平台配置合法域名\n\n解决步骤：\n1. 登录微信公众平台（mp.weixin.qq.com）\n2. 开发版：开发→开发管理→开发设置→服务器域名\n3. 正式版：设置→基本设置→服务器域名\n4. 在"request合法域名"中添加：\n   oa.ruoshui-edu.cn\n5. 保存后等待几分钟生效\n6. 清除小程序缓存后重试'
              : '网络请求失败，请检查网络连接和域名配置';
          }
          
          reject({
            detail: errorDetail || errorMessage,
            message: errorMessage,
            errMsg: err.errMsg,
            platform: systemInfo.platform,
            system: systemInfo.system,
            SDKVersion: systemInfo.SDKVersion,
            originalError: err
          });
        }
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
      
      // 确保 token 已从本地存储恢复
      if (!this.globalData.token) {
        const token = wx.getStorageSync('token');
        if (token) {
          this.globalData.token = token;
        }
      }
      
      // 打印请求日志（生产环境可以减少日志输出）
      // 使用 try-catch 包裹，避免日志输出触发微信内部错误
      try {
        console.log('📤 请求:', method, url);
        if (this.globalData.token) {
          console.log('📤 Token: 已设置');
        }
      } catch (e) {
        // 静默处理日志错误
      }
      
      // 获取系统信息，针对不同平台和微信版本优化配置
      const systemInfo = this.getSystemInfo();
      const isAndroid = systemInfo.platform === 'android';
      
      // 解析微信版本号，处理版本兼容性
      const wechatVersion = systemInfo.version || '';
      const versionParts = wechatVersion.split('.').map(v => parseInt(v) || 0);
      const majorVersion = versionParts[0] || 0;
      const minorVersion = versionParts[1] || 0;
      const patchVersion = versionParts[2] || 0;
      
      // 微信8.0.64及更高版本可能需要特殊处理
      const isNewWechatVersion = majorVersion > 8 || 
                                 (majorVersion === 8 && minorVersion > 0) ||
                                 (majorVersion === 8 && minorVersion === 0 && patchVersion >= 64);
      
      // 构建请求配置
      const requestConfig = {
        url: `${this.globalData.apiBaseUrl}${url}`,
        method,
        data,
        header: {
          'Content-Type': 'application/json',
          'Authorization': this.globalData.token ? `Bearer ${this.globalData.token}` : ''
        },
        timeout: isAndroid ? 60000 : 30000, // 安卓使用更长的超时时间
        enableCache: false, // 禁用缓存，避免安卓缓存问题
      };
      
      // HTTP/2 配置：新版本微信（8.0.64+）在安卓上可能有HTTP/2问题
      if (isAndroid && isNewWechatVersion) {
        // 安卓 + 新版本微信，禁用HTTP/2
        requestConfig.enableHttp2 = false;
        console.log('⚠️ 安卓 + 新版本微信(8.0.64+)，禁用HTTP/2');
      } else if (isAndroid) {
        // 安卓旧版本，也禁用HTTP/2（更安全）
        requestConfig.enableHttp2 = false;
      } else {
        // iOS或其他平台，启用HTTP/2
        requestConfig.enableHttp2 = true;
      }
      
      // 确保使用HTTPS
      if (!requestConfig.url.startsWith('https://')) {
        console.warn('⚠️ 建议使用HTTPS协议');
      }
      
      console.log('📤 请求配置:', {
        url: requestConfig.url,
        method: requestConfig.method,
        platform: systemInfo.platform,
        timeout: requestConfig.timeout,
        enableHttp2: requestConfig.enableHttp2
      });
      
      wx.request({
        ...requestConfig,
        success: (res) => {
          // 打印响应日志
          console.log('✅ 响应:', res.statusCode, res.data);
          
          if (res.statusCode === 401) {
            console.warn('❌ 未授权，清除登录状态');
            this.logout();
            reject({ message: '未授权，请重新登录' });
          } else if (res.statusCode === 403) {
            console.warn('❌ 权限不足或未登录，清除登录状态');
            // 403 可能是权限不足，也可能是未登录（token无效）
            // 清除登录状态，让用户重新登录
            this.logout();
            reject({ message: '权限不足或登录已过期，请重新登录' });
          } else if (res.statusCode === 200 || res.statusCode === 201 || res.statusCode === 204) {
            // 确保返回的数据不是 null 或 undefined
            // 204 No Content 表示成功但没有响应体，返回空对象
            if (res.statusCode === 204) {
              resolve({});
              return;
            }
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
          
          // 获取系统信息
          const systemInfo = this.getSystemInfo();
          const isAndroid = systemInfo.platform === 'android';
          
          // 提供更详细的错误信息，特别是针对安卓
          let errorMessage = '网络请求失败';
          let errorDetail = '';
          
          if (err.errMsg) {
            console.error('错误信息:', err.errMsg);
            console.error('系统信息:', {
              platform: systemInfo.platform,
              system: systemInfo.system,
              version: systemInfo.version,
              SDKVersion: systemInfo.SDKVersion
            });
            
            if (err.errMsg.includes('timeout') || err.errMsg.includes('超时')) {
              errorMessage = '请求超时';
              errorDetail = isAndroid 
                ? '网络连接超时（安卓设备），请检查：\n1. 网络连接是否正常\n2. 是否在微信公众平台配置了合法域名\n3. 服务器响应是否正常'
                : '网络连接超时，请检查网络连接或稍后重试';
            } else if (err.errMsg.includes('fail') || err.errMsg.includes('失败')) {
              errorMessage = '网络请求失败';
              
              // 检查是否是域名或SSL问题
              if (err.errMsg.includes('domain') || err.errMsg.includes('域名') || err.errMsg.includes('不在以下 request 合法域名')) {
                errorDetail = '域名配置错误，请检查：\n1. 微信公众平台是否配置了合法域名\n2. 域名是否正确（只需要域名，不需要加/api）\n3. 是否使用HTTPS协议\n4. 开发版/体验版需要在"开发管理-开发设置"中配置\n5. 正式版需要在"设置-基本设置-服务器域名"中配置';
              } else if (err.errMsg.includes('ssl') || err.errMsg.includes('证书') || err.errMsg.includes('certificate')) {
                errorDetail = 'SSL证书错误，请检查：\n1. 服务器SSL证书是否有效\n2. 证书是否过期\n3. 证书链是否完整\n4. 是否支持TLS 1.2及以上版本';
              } else if (err.errMsg.includes('connect') || err.errMsg.includes('连接') || err.errMsg.includes('network')) {
                errorDetail = isAndroid
                  ? '无法连接到服务器（安卓设备），请检查：\n1. 网络连接是否正常\n2. 服务器是否正常运行\n3. 防火墙设置是否正确\n4. 是否在微信公众平台配置了合法域名\n5. 尝试切换网络（WiFi/移动数据）'
                  : '无法连接到服务器，请检查：\n1. 网络连接是否正常\n2. 服务器是否正常运行\n3. 防火墙设置是否正确';
              } else {
                errorDetail = isAndroid
                  ? '网络请求失败（安卓设备），请检查：\n1. 网络连接是否正常\n2. 服务器地址是否正确\n3. 微信公众平台是否配置了合法域名（request合法域名）\n4. 是否使用HTTPS协议\n5. 尝试清除小程序缓存后重试'
                  : '网络请求失败，请检查：\n1. 网络连接是否正常\n2. 服务器地址是否正确\n3. 微信公众平台是否配置了合法域名\n4. 是否使用HTTPS协议';
              }
            } else if (err.errMsg.includes('abort') || err.errMsg.includes('取消')) {
              errorMessage = '请求已取消';
              errorDetail = '请求被取消，请重试';
            } else {
              errorDetail = `网络错误: ${err.errMsg}`;
              if (isAndroid) {
                errorDetail += '\n\n（安卓设备）建议检查：\n1. 微信公众平台域名配置\n2. 网络权限设置\n3. 清除小程序缓存';
            }
          }
          } else {
            // 没有错误信息的情况
            errorDetail = isAndroid
              ? '网络请求失败（安卓设备），可能原因：\n1. 未在微信公众平台配置合法域名\n2. 网络连接问题\n3. 服务器响应异常\n\n建议：\n1. 检查微信公众平台域名配置\n2. 尝试切换网络\n3. 清除小程序缓存'
              : '网络请求失败，请检查网络连接';
          }
          
          reject({
            message: errorMessage,
            detail: errorDetail,
            errMsg: err.errMsg,
            platform: systemInfo.platform,
            system: systemInfo.system,
            SDKVersion: systemInfo.SDKVersion,
            originalError: err
          });
        }
      });
    });
  }
});



