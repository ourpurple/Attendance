/**
 * 订阅消息模块
 * 处理微信订阅消息授权
 */

const config = require('./config.js');

/**
 * 获取授权状态
 * @returns {Object|null}
 */
function getAuthStatus() {
  try {
    return wx.getStorageSync('subscribe_message_auth_status') || null;
  } catch (e) {
    console.warn('获取授权状态失败:', e);
    return null;
  }
}

/**
 * 保存授权状态
 * @param {Object} status - 授权状态
 */
function saveAuthStatus(status) {
  try {
    wx.setStorageSync('subscribe_message_auth_status', status);
  } catch (e) {
    console.warn('保存授权状态失败:', e);
  }
}

/**
 * 检查是否所有模板都已授权
 * @returns {boolean}
 */
function isAllAuthorized() {
  const status = getAuthStatus();
  if (!status) return false;
  
  const expectedCount = config.subscribeTemplateIds?.length || 0;
  return status.allAccepted && status.acceptedCount === expectedCount;
}

/**
 * 显示授权说明
 * @param {Object} options - 选项
 * @returns {Promise<boolean>}
 */
function showAuthTip(options = {}) {
  return new Promise((resolve) => {
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
      success: (res) => {
        resolve(res.confirm);
      }
    });
  });
}

/**
 * 显示授权结果提示
 * @param {Object} result - 授权结果
 * @param {Array} templateIds - 模板ID列表
 */
function showAuthResult(result, templateIds) {
  const { accepted, rejected, total } = result;
  const expectedCount = templateIds.length;
  
  // 延迟显示，确保授权弹窗已关闭
  setTimeout(() => {
    // 全部授权成功
    if (accepted === expectedCount && expectedCount > 0) {
      wx.showToast({
        title: `授权成功（${accepted}/${expectedCount}）`,
        icon: 'success',
        duration: 2000
      });
    }
    // 全部拒绝
    else if (rejected === expectedCount) {
      wx.showModal({
        title: '授权提示',
        content: '您拒绝了所有订阅消息授权，将无法收到重要的审批通知。\n\n建议允许授权，以便及时了解审批状态。',
        showCancel: false,
        confirmText: '知道了'
      });
    }
    // 部分授权
    else if (accepted > 0 && rejected > 0) {
      const approvalAccepted = result.acceptedIds.includes(templateIds[0]);
      const resultAccepted = result.acceptedIds.includes(templateIds[1]);
      
      let detailMsg = `您已授权 ${accepted} 个模板，拒绝了 ${rejected} 个模板。\n\n`;
      
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
        success: (res) => {
          if (res.confirm) {
            // 清除状态并重新授权
            wx.removeStorageSync('subscribe_message_authorized');
            wx.removeStorageSync('subscribe_message_auth_status');
            setTimeout(() => {
              requestSubscribeMessage([], { showTip: true });
            }, 500);
          }
        }
      });
    }
  }, 500);
}

/**
 * 执行订阅消息授权请求
 * @param {Array} templateIds - 模板ID列表
 * @returns {Promise}
 */
function doRequestSubscribe(templateIds) {
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: templateIds,
      success: (res) => {
        // 解析授权结果
        const allIds = Object.keys(res);
        const acceptedIds = allIds.filter(id => res[id] === 'accept');
        const rejectedIds = allIds.filter(id => res[id] === 'reject');
        const banIds = allIds.filter(id => res[id] === 'ban');
        
        const result = {
          success: true,
          res,
          accepted: acceptedIds.length,
          rejected: rejectedIds.length + banIds.length,
          ban: banIds.length,
          total: allIds.length,
          allAccepted: acceptedIds.length === allIds.length && allIds.length > 0,
          allRejected: (rejectedIds.length + banIds.length) === allIds.length,
          partialAccepted: acceptedIds.length > 0 && (rejectedIds.length + banIds.length) > 0,
          acceptedIds,
          rejectedIds: rejectedIds.concat(banIds)
        };
        
        // 保存授权状态
        saveAuthStatus({
          allAccepted: result.allAccepted,
          acceptedCount: result.accepted,
          rejectedCount: result.rejected,
          timestamp: Date.now()
        });
        
        resolve(result);
      },
      fail: (err) => {
        console.warn('请求订阅消息授权失败:', err);
        resolve({ success: false, err });
      }
    });
  });
}

/**
 * 请求订阅消息授权
 * @param {Array} extraTemplateIds - 额外的模板ID
 * @param {Object} options - 选项
 * @returns {Promise}
 */
async function requestSubscribeMessage(extraTemplateIds = [], options = {}) {
  // 获取模板ID
  const templateIds = extraTemplateIds.length > 0 
    ? extraTemplateIds 
    : config.subscribeTemplateIds;
  
  // 检查模板ID
  if (!templateIds || templateIds.length === 0) {
    return { skipped: true, reason: 'no_template_ids' };
  }
  
  // 去重
  const uniqueIds = [...new Set(templateIds)];
  
  // 检查是否支持订阅消息
  if (typeof wx.requestSubscribeMessage !== 'function') {
    return { skipped: true, reason: 'not_supported' };
  }
  
  // 显示授权说明
  if (options.showTip) {
    const shouldContinue = await showAuthTip(options);
    if (!shouldContinue) {
      return { skipped: true, reason: 'user_cancelled' };
    }
    
    // 等待modal关闭
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // 执行授权
  const result = await doRequestSubscribe(uniqueIds);
  
  // 显示结果
  if (result.success) {
    showAuthResult(result, uniqueIds);
  }
  
  return result;
}

/**
 * 检查并请求授权（如果需要）
 * @param {Object} options - 选项
 * @returns {Promise}
 */
async function checkAndRequestAuth(options = {}) {
  // 检查是否已授权
  if (isAllAuthorized()) {
    return { skipped: true, reason: 'already_authorized' };
  }
  
  // 请求授权
  return await requestSubscribeMessage([], options);
}

module.exports = {
  getAuthStatus,
  saveAuthStatus,
  isAllAuthorized,
  requestSubscribeMessage,
  checkAndRequestAuth
};
