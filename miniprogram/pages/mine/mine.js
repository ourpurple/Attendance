// pages/mine/mine.js
const app = getApp();

Page({
  data: {
    userInfo: null
  },

  onShow() {
    if (!app.globalData.token) {
      wx.redirectTo({
        url: '/pages/login/login'
      });
      return;
    }
    
    this.setData({ userInfo: app.globalData.userInfo });
  },

  // 修改密码
  changePassword() {
    wx.navigateTo({
      url: '/pages/mine/change-password/change-password'
    });
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.logout();
        }
      }
    });
  },

  // 获取角色名称
  getRoleName(role) {
    const roleMap = {
      'admin': '管理员',
      'general_manager': '总经理',
      'vice_president': '副总',
      'department_head': '部门主任',
      'employee': '员工'
    };
    return roleMap[role] || role;
  }
});

