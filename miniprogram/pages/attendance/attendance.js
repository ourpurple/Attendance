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
        try {
        const date = new Date(dateStr);
          // 手动格式化，避免安卓微信显示时区信息
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${hours}:${minutes}`;
        } catch (error) {
          console.error('格式化时间失败:', error, dateStr);
          return null;
        }
      };

      const formatDate = (dateStr) => {
        try {
        const date = new Date(dateStr);
          // 手动格式化日期为中文格式，避免安卓微信显示英文
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const day = date.getDate();
          const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
          const weekday = weekdays[date.getDay()];
          return `${year}年${month}月${day}日 ${weekday}`;
        } catch (error) {
          console.error('格式化日期失败:', error, dateStr);
          return dateStr;
        }
      };

      // 确保 data 是数组
      const safeData = Array.isArray(data) ? data : [];
      
      // 格式化打卡状态
      const formatCheckinStatus = (status) => {
        if (!status || status === 'normal') {
          return { text: '正常打卡', class: 'checkin-status-normal' };
        } else if (status === 'city_business') {
          return { text: '市区办事', class: 'checkin-status-business' };
        } else if (status === 'business_trip') {
          return { text: '出差', class: 'checkin-status-business' };
        }
        return { text: '', class: '' };
      };

      // 格式化签退状态
      const formatCheckoutStatus = (att) => {
        if (!att.checkout_time) {
          return { text: '未签退', class: 'checkout-status-absent' };
        } else if (att.is_early_leave) {
          return { text: '早退', class: 'checkout-status-early' };
        } else {
          return { text: '正常签退', class: 'checkout-status-normal' };
        }
      };
      
      const attendanceList = safeData.map(att => {
        // 确保 att 不是 null
        if (!att || typeof att !== 'object') {
          return null;
        }
        const statusInfo = formatCheckinStatus(att.checkin_status);
        const checkoutStatusInfo = formatCheckoutStatus(att);
        return {
          id: att.id,
          date: formatDate(att.date),
          checkinTime: formatTime(att.checkin_time),
          checkoutTime: formatTime(att.checkout_time),
          workHours: att.work_hours ? att.work_hours.toFixed(1) : null,
          isLate: att.is_late,
          isEarlyLeave: att.is_early_leave,
          checkinLocation: att.checkin_location || null,
          checkoutLocation: att.checkout_location || null,
          checkinStatusText: att.checkin_time ? statusInfo.text : '',
          checkinStatusClass: att.checkin_time ? statusInfo.class : '',
          checkoutStatusText: checkoutStatusInfo.text,
          checkoutStatusClass: checkoutStatusInfo.class
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

