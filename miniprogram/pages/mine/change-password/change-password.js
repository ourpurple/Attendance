// pages/mine/change-password/change-password.js
const app = getApp();

Page({
  data: {
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  },

  // 原密码输入
  onOldPasswordInput(e) {
    this.setData({ oldPassword: e.detail.value });
  },

  // 新密码输入
  onNewPasswordInput(e) {
    this.setData({ newPassword: e.detail.value });
  },

  // 确认密码输入
  onConfirmPasswordInput(e) {
    this.setData({ confirmPassword: e.detail.value });
  },

  // 输入框获得焦点
  onInputFocus(e) {
    // 可以添加焦点时的处理逻辑
  },

  // 输入框失去焦点
  onInputBlur(e) {
    // 可以添加失焦时的处理逻辑
  },

  // 提交修改
  async submitForm() {
    const { oldPassword, newPassword, confirmPassword } = this.data;

    if (!oldPassword || !newPassword || !confirmPassword) {
      wx.showToast({
        title: '请填写所有字段',
        icon: 'none'
      });
      return;
    }

    if (newPassword.length < 6) {
      wx.showToast({
        title: '新密码至少6位',
        icon: 'none'
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      wx.showToast({
        title: '两次密码不一致',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '修改中...' });

    try {
      await app.request({
        url: '/users/me/change-password',
        method: 'POST',
        data: {
          old_password: oldPassword,
          new_password: newPassword
        }
      });

      wx.showToast({
        title: '修改成功',
        icon: 'success'
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (error) {
      wx.showToast({
        title: error.message || '修改失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  }
});

