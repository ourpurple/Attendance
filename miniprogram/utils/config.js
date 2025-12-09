/**
 * 小程序配置文件
 */

// API基础URL配置
const API_BASE_URL = {
  // 开发环境
  development: 'http://localhost:8000/api',
  // 生产环境
  production: 'https://oa.ruoshui-edu.cn/api',
  // 测试环境
  test: 'https://test.ruoshui-edu.cn/api'
};

// 当前环境
const ENV = 'development'; // development | production | test

// 导出配置
module.exports = {
  // API基础URL
  apiBaseUrl: API_BASE_URL[ENV],
  
  // 公司信息
  companyInfo: {
    fullName: '河南新盟科教有限公司',
    shortName: '新盟科教'
  },
  
  // 订阅消息模板ID
  subscribeTemplateIds: [
    'JzcNdxTsNr-OTqMjqzF4xx1GRZab-lMXXq6ux-vIdxM',  // 待审批通知
    '58inG1DfC2U_9Za0Csn4zxilWJP_kqAP5SejR6rAF4A'   // 审批结果通知
  ],
  
  // 请求配置
  request: {
    timeout: 30000,           // 默认超时时间（毫秒）
    androidTimeout: 60000,    // 安卓超时时间（毫秒）
    enableCache: false,       // 是否启用缓存
    enableHttp2: true,        // 是否启用HTTP/2（安卓可能需要禁用）
  },
  
  // 缓存配置
  cache: {
    systemInfoTimeout: 60000, // 系统信息缓存时间（毫秒）
  },
  
  // 调试配置
  debug: {
    enabled: ENV === 'development',
    logRequest: true,
    logResponse: true,
  }
};
