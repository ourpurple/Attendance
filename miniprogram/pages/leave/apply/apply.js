// pages/leave/apply/apply.js
const app = getApp();

Page({
  data: {
    startDate: '',
    endDate: '',
    days: '',
    reason: ''
  },

  onLoad() {
    // 设置默认日期为今天
    const today = new Date().toISOString().split('T')[0];
    this.setData({
      startDate: today,
      endDate: today
    });
  },

  // 开始日期改变
  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
    this.calculateDays();
  },

  // 结束日期改变
  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
    this.calculateDays();
  },

  // 天数改变
  onDaysInput(e) {
    this.setData({ days: e.detail.value });
  },

  // 原因改变
  onReasonInput(e) {
    this.setData({ reason: e.detail.value });
  },

  // 计算天数
  calculateDays() {
    const { startDate, endDate } = this.data;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end >= start) {
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        this.setData({ days: diffDays.toString() });
      }
    }
  },

  // 提交申请
  async submitForm() {
    const { startDate, endDate, days, reason } = this.data;

    if (!startDate || !endDate || !days || !reason) {
      wx.showToast({
        title: '请填写所有必填项',
        icon: 'none'
      });
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      wx.showToast({
        title: '结束日期不能早于开始日期',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    try {
      await app.request({
        url: '/leave/',
        method: 'POST',
        data: {
          start_date: startDate + 'T00:00:00',
          end_date: endDate + 'T23:59:59',
          days: parseFloat(days),
          reason: reason
        }
      });

      wx.showToast({
        title: '提交成功',
        icon: 'success'
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (error) {
      wx.showToast({
        title: error.message || '提交失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  }
});

