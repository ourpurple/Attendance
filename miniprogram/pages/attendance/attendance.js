// pages/attendance/attendance.js
const app = getApp();

Page({
  data: {
    selectedMonth: '',
    attendanceList: []
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
    
    // 确保数据已初始化，避免渲染时出错
    this.setData({
      attendanceList: this.data.attendanceList || []
    });
    
    this.loadAttendance();
  },

  // 月份选择改变
  onMonthChange(e) {
    this.setData({ selectedMonth: e.detail.value });
    this.loadAttendance();
  },

  // 加载考勤记录
  async loadAttendance() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const { selectedMonth } = this.data;
      const [year, month] = selectedMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      const data = await app.request({
        url: `/attendance/my?start_date=${startDate}&end_date=${endDate}`
      });

      const formatTime = (dateStr) => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        return date.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
      };

      const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'short'
        });
      };

      // 确保 data 是数组
      const safeData = Array.isArray(data) ? data : [];
      
      const attendanceList = safeData.map(att => {
        // 确保 att 不是 null
        if (!att || typeof att !== 'object') {
          return null;
        }
        return {
          id: att.id,
          date: formatDate(att.date),
          checkinTime: formatTime(att.checkin_time),
          checkoutTime: formatTime(att.checkout_time),
          workHours: att.work_hours ? att.work_hours.toFixed(1) : null,
          isLate: att.is_late,
          isEarlyLeave: att.is_early_leave,
          location: att.location || att.address || ''
        };
      }).filter(item => item !== null);

      this.setData({ attendanceList });
    } catch (error) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      console.error('加载考勤记录失败:', error);
    } finally {
      wx.hideLoading();
    }
  }
});

