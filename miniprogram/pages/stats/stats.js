// pages/stats/stats.js
const app = getApp();

function formatDayValue(value) {
  const numberValue = parseFloat(value) || 0;
  return numberValue % 1 === 0 ? numberValue.toString() : numberValue.toFixed(1);
}

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
      
      [
        'overtime_days',
        'year_passive_overtime_days',
        'comp_leave_remaining_days',
        'annual_leave_remaining_days'
      ].forEach((field) => {
        safeStats[field] = parseFloat(safeStats[field]) || 0;
        safeStats[`${field}_display`] = formatDayValue(safeStats[field]);
      });
      
      // 处理工作时长字段
      if (safeStats.work_hours !== undefined && safeStats.work_hours !== null) {
        safeStats.work_hours = parseFloat(safeStats.work_hours) || 0;
        // 格式化：显示一位小数
        safeStats.work_hours_display = safeStats.work_hours.toFixed(1);
      } else {
        safeStats.work_hours = 0;
        safeStats.work_hours_display = '0.0';
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

