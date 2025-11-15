// pages/overtime/apply/apply.js
const app = getApp();

Page({
  data: {
    overtimeType: '',
    overtimeTypeIndex: -1,
    overtimeTypeText: '',
    date: '',
    startTime: '',
    endTime: '',
    days: '',
    reason: '',
    showCustomTime: false,
    showQuickSelect: false,
    timePeriod: '',  // 选择的时段
    timePeriodOptions: []  // 时段选项列表
  },

  onLoad() {
    // 设置默认日期为今天
    const today = new Date().toISOString().split('T')[0];
    this.setData({ date: today });
  },

  // 加班类型改变
  onTypeChange(e) {
    const index = parseInt(e.detail.value);
    const types = ['half-day', 'full-day', 'custom'];
    const typeTexts = ['半天', '整天', '自定义时长'];
    const type = types[index];
    
    // 根据类型设置时段选项
    let timePeriodOptions = [];
    let defaultPeriod = '';
    
    if (type === 'half-day') {
      // 半天时段选项
      timePeriodOptions = [
        { value: 'morning', label: '上午 (09:00-12:00)' },
        { value: 'afternoon', label: '下午 (14:00-17:30)' },
        { value: 'evening', label: '晚上 (17:30-19:30)' }
      ];
      defaultPeriod = 'morning';
    } else if (type === 'full-day') {
      // 整天时段选项
      timePeriodOptions = [
        { value: 'day', label: '白天 (09:00-17:30)' },
        { value: 'night', label: '晚上 (17:30-22:00)' }
      ];
      defaultPeriod = 'day';
    }
    
    this.setData({
      overtimeType: type,
      overtimeTypeIndex: index,
      overtimeTypeText: typeTexts[index],
      showCustomTime: type === 'custom',
      showQuickSelect: type === 'half-day' || type === 'full-day',
      days: type === 'half-day' ? '0.5' : type === 'full-day' ? '1' : '',
      timePeriodOptions: timePeriodOptions,
      timePeriod: defaultPeriod
    });
  },

  // 日期改变
  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  // 开始时间改变
  onStartTimeChange(e) {
    this.setData({ startTime: e.detail.value });
    this.calculateDays();
  },

  // 结束时间改变
  onEndTimeChange(e) {
    this.setData({ endTime: e.detail.value });
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

  // 计算天数（自定义模式）
  calculateDays() {
    const { startTime, endTime } = this.data;
    if (startTime && endTime) {
      const start = new Date(`2000-01-01 ${startTime}`);
      const end = new Date(`2000-01-01 ${endTime}`);
      const diffHours = (end - start) / (1000 * 60 * 60);
      const days = diffHours / 8; // 按8小时一天计算
      this.setData({ days: days.toFixed(1) });
    }
  },

  // 选择快捷时段
  onTimePeriodChange(e) {
    const period = e.detail.value;
    this.setData({ timePeriod: period });
  },

  // 提交申请
  async submitForm() {
    const { overtimeType, date, startTime, endTime, days, reason, timePeriod } = this.data;

    if (!overtimeType || !date || !days || !reason) {
      wx.showToast({
        title: '请填写所有必填项',
        icon: 'none'
      });
      return;
    }

    if (overtimeType === 'custom' && (!startTime || !endTime)) {
      wx.showToast({
        title: '请选择开始和结束时间',
        icon: 'none'
      });
      return;
    }

    if ((overtimeType === 'half-day' || overtimeType === 'full-day') && !timePeriod) {
      wx.showToast({
        title: '请选择加班时段',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    try {
      let startDateTime, endDateTime, hours;
      
      if (overtimeType === 'custom') {
        startDateTime = `${date}T${startTime}:00`;
        endDateTime = `${date}T${endTime}:00`;
        // 计算小时数
        const start = new Date(startDateTime);
        const end = new Date(endDateTime);
        hours = (end - start) / (1000 * 60 * 60); // 转换为小时
      } else {
        // 快捷选择，根据时段设置时间和时长
        const timeRanges = {
          // 半天时段
          morning: { start: '09:00', end: '12:00', hours: 3 },      // 上午
          afternoon: { start: '14:00', end: '17:30', hours: 3.5 },  // 下午
          evening: { start: '17:30', end: '19:30', hours: 2 },      // 晚上
          // 整天时段
          day: { start: '09:00', end: '17:30', hours: 8.5 },        // 白天
          night: { start: '17:30', end: '22:00', hours: 4.5 }       // 晚上
        };
        
        const range = timeRanges[timePeriod];
        startDateTime = `${date}T${range.start}:00`;
        endDateTime = `${date}T${range.end}:00`;
        hours = range.hours;
      }

      await app.request({
        url: '/overtime/',
        method: 'POST',
        data: {
          start_time: startDateTime,
          end_time: endDateTime,
          hours: hours,
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

