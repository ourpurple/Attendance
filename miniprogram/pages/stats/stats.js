// pages/stats/stats.js
const app = getApp();

Page({
  data: {
    selectedMonth: '',
    stats: null
  },

  onLoad() {
    // 设置默认月份为当前月
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.setData({ selectedMonth: month });
  },

  onShow() {
    if (!app.globalData.token) {
      wx.redirectTo({
        url: '/pages/login/login'
      });
      return;
    }
    
    this.loadStats();
  },

  // 月份选择改变
  onMonthChange(e) {
    this.setData({ selectedMonth: e.detail.value });
    this.loadStats();
  },

  // 加载统计数据
  async loadStats() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const { selectedMonth } = this.data;
      const [year, month] = selectedMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      const data = await app.request({
        url: `/statistics/my?start_date=${startDate}&end_date=${endDate}`
      });

      // 确保返回的数据是对象而不是 null
      const safeStats = data && typeof data === 'object' && data !== null ? data : {};
      
      // 调试日志
      console.log('统计数据:', safeStats);
      console.log('加班天数:', safeStats.overtime_days, typeof safeStats.overtime_days);
      
      // 确保所有数值字段都是正确的类型
      if (safeStats.overtime_days !== undefined && safeStats.overtime_days !== null) {
        safeStats.overtime_days = parseFloat(safeStats.overtime_days) || 0;
        // 格式化：如果是整数显示整数，否则显示一位小数
        safeStats.overtime_days_display = safeStats.overtime_days % 1 === 0 
          ? safeStats.overtime_days.toString() 
          : safeStats.overtime_days.toFixed(1);
      } else {
        safeStats.overtime_days = 0;
        safeStats.overtime_days_display = '0';
      }
      
      this.setData({ stats: safeStats });
    } catch (error) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      console.error('加载统计数据失败:', error);
    } finally {
      wx.hideLoading();
    }
  }
});

