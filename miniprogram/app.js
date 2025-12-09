/**
 * 小程序入口文件（重构版）
 * 使用模块化设计，减少代码量
 */

const config = require('./utils/config.js');
const auth = require('./utils/auth.js');
const subscribe = require('./utils/subscribe.js');
const system = require('./utils/system.js');
const request = require('./utils/request.js');

App({
  // 全局数据
  globalData: {
    userInfo: null,
    token: null,
    apiBaseUrl: config.apiBaseUrl,
    subscribeTemplateIds: config.subscribeTemplateIds
  },
  
  // 公司信息
  companyInfo: config.companyInfo,
  
  /**
   * 小程序启动
   */
  onLaunch() {
    // 设置全局错误处理
    system.setupErrorHandler();
    
    // 初始化认证状态
    auth.initAuth();
  },
  
  /**
   * 获取系统信息
   */
  getSystemInfo() {
    return system.getSystemInfo();
  },
  
  /**
   * 检查授权状态
   */
  getSubscribeMessageAuthStatus() {
    return subscribe.getAuthStatus();
  },
  
  /**
   * 检查是否所有模板都已授权
   */
  isAllSubscribeMessageAuthorized() {
    return subscribe.isAllAuthorized();
  },
  
  /**
   * 请求订阅消息授权
   */
  requestSubscribeMessage(extraTemplateIds = [], options = {}) {
    return subscribe.requestSubscribeMessage(extraTemplateIds, options);
  },
  
  /**
   * 获取微信登录code
   */
  getWechatCode() {
    return auth.getWechatCode();
  },
  
  /**
   * 微信登录
   */
  wechatLogin(code) {
    return auth.wechatLogin(code);
  },
  
  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    return auth.checkLoginStatus();
  },
  
  /**
   * 登录
   */
  login(username, password, wechatCode = null) {
    return auth.login(username, password, wechatCode);
  },
  
  /**
   * 登出
   */
  logout() {
    auth.logout();
  },
  
  /**
   * API请求封装
   */
  request(options) {
    return request.request(options);
  }
});
