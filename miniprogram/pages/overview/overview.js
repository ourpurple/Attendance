const app = getApp();

Page({
  data: {
    targetDate: '',
    today: '',
    isWorkday: true,
    workdayText: '',
    categories: [],
    loading: false
  },

  onLoad() {
    const today = this.getToday();
    this.setData({
      targetDate: today,
      today
    });
    this.loadOverview();
  },

  onShow() {
    // 每次显示页面时重新加载数据
    this.loadOverview();
  },

  getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  handleDateChange(e) {
    const value = e.detail.value;
    this.setData({ targetDate: value }, () => {
      this.loadOverview();
    });
  },

  async loadOverview() {
    try {
      this.setData({ loading: true });
      const overview = await app.request({
        url: `/attendance/overview?target_date=${this.data.targetDate}`
      });

      const result = this.formatOverview(overview || {});
      this.setData({
        isWorkday: !!overview.is_workday,
        workdayText: overview.workday_reason || (overview.is_workday ? '正常工作日' : '休息日'),
        categories: result
      });
    } catch (error) {
      console.error('加载出勤概览失败:', error);
      
      // 检查是否是权限问题
      if (error.message && (error.message.includes('权限') || error.message.includes('403') || error.message.includes('未授权'))) {
        wx.showModal({
          title: '权限不足',
          content: '您暂无权限查看出勤情况',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
        return;
      }
      
      wx.showToast({
        title: error.message || '加载失败，请稍后重试',
        icon: 'none',
        duration: 2000
      });
      this.setData({ categories: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatOverview(overview) {
    const items = Array.isArray(overview.items) ? overview.items : [];
    const notChecked = [];
    const checkedIn = [];
    const onLeave = [];
    const onOvertime = [];

    items.forEach(item => {
      if (!item) return;
      if (item.has_leave) {
        onLeave.push(this.buildPerson(item, 'leave'));
        return;
      }
      if (item.has_overtime) {
        onOvertime.push(this.buildPerson(item, 'overtime'));
        return;
      }
      if (item.checkin_time) {
        checkedIn.push(this.buildPerson(item, 'checked'));
      } else {
        notChecked.push(this.buildPerson(item, 'notChecked'));
      }
    });

    if (!overview.is_workday) {
      return [
        {
          key: 'onOvertime',
          title: '加班中',
          count: onOvertime.length,
          list: onOvertime,
          tone: 'warning'
        }
      ];
    }

    return [
      {
        key: 'onLeave',
        title: '请假中',
        count: onLeave.length,
        list: onLeave,
        tone: 'info'
      },
      {
        key: 'notChecked',
        title: '未打卡',
        count: notChecked.length,
        list: notChecked,
        tone: 'danger'
      },
      {
        key: 'onOvertime',
        title: '加班中',
        count: onOvertime.length,
        list: onOvertime,
        tone: 'warning'
      },
      {
        key: 'checkedIn',
        title: '已打卡',
        count: checkedIn.length,
        list: checkedIn,
        tone: 'success'
      }
    ];
  },

  buildPerson(item, category) {
    const extra = this.getStatusText(category, item);
    return {
      user_id: item.user_id,
      name: item.real_name,
      extra,
      compact: category === 'notChecked' || category === 'checked'
    };
  },

  getStatusText(category, item) {
    switch (category) {
      case 'notChecked':
        return '';
      case 'checked':
        return '';
      case 'leave':
        if (item.leave_start_date) {
          return this.formatLeaveRange(item.leave_start_date, item.leave_end_date);
        }
        return item.leave_days ? `${item.leave_days}天` : '请假';
      case 'overtime':
        if (item.overtime_start_time) {
          return this.formatOvertimeRange(item.overtime_start_time, item.overtime_end_time, item.overtime_days);
        }
        return item.overtime_days ? `${item.overtime_days}天` : '加班';
      default:
        return '';
    }
  },

  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date)) return '';
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  formatLeaveRange(start, end) {
    if (!start) return '请假';
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date(start);
    if (isNaN(startDate) || isNaN(endDate)) {
      return end && end !== start ? `${start} - ${end}` : `${start}`;
    }
    const days = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const startText = this.formatFullDate(startDate);
    if (days <= 1) {
      return `${startText} 共1天`;
    }
    const endText = this.formatFullDate(endDate);
    return `${startText} - ${endText} 共${days}天`;
  },

  formatOvertimeRange(start, end, days) {
    if (!start) return days ? `${days}天` : '加班';
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date(start);
    if (isNaN(startDate) || isNaN(endDate)) {
      return days ? `${days}天` : '加班';
    }
    const totalDays = days ? parseFloat(days) : Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const startText = this.formatFullDate(startDate);
    if (totalDays <= 1) {
      return `${startText} 共${totalDays || 1}天`;
    }
    const endText = this.formatFullDate(endDate);
    return `${startText} - ${endText} 共${totalDays}天`;
  },

  formatFullDate(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}月${day}日`;
  }
});

