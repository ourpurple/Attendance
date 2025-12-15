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
    // 使用东八区日期（UTC+8）
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const cst = new Date(utc + (8 * 3600000)); // 东八区 = UTC+8
    const year = cst.getFullYear();
    const month = String(cst.getMonth() + 1).padStart(2, '0');
    const day = String(cst.getDate()).padStart(2, '0');
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

      // 调试：打印原始数据
      console.log('Overview raw data:', overview);
      if (overview && overview.items) {
        overview.items.forEach(item => {
          if (item.has_leave) {
            console.log('Leave item raw:', {
              name: item.real_name,
              start: item.leave_start_date,
              end: item.leave_end_date,
              startType: typeof item.leave_start_date,
              endType: typeof item.leave_end_date,
              days: item.leave_days
            });
          }
        });
      }

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
        checkedIn.push({ ...this.buildPerson(item, 'checked'), checkin_time: item.checkin_time });
      } else {
        notChecked.push(this.buildPerson(item, 'notChecked'));
      }
    });

    // 已打卡人员按签到时间降序排列（最后签到的在前面/左上角）
    checkedIn.sort((a, b) => {
      const timeA = a.checkin_time ? new Date(a.checkin_time).getTime() : 0;
      const timeB = b.checkin_time ? new Date(b.checkin_time).getTime() : 0;
      return timeB - timeA;
    });

    if (!overview.is_workday) {
      // 休息日只显示加班中，且人数为0时不显示
      const categories = [];
      if (onOvertime.length > 0) {
        categories.push({
          key: 'onOvertime',
          title: '加班中',
          count: onOvertime.length,
          list: onOvertime,
          tone: 'warning'
        });
      }
      return categories;
    }

    // 工作日：请假中、未打卡、加班中人数为0时不显示，已打卡始终显示
    const categories = [];
    
    if (onLeave.length > 0) {
      categories.push({
        key: 'onLeave',
        title: '请假中',
        count: onLeave.length,
        list: onLeave,
        tone: 'info'
      });
    }
    
    if (notChecked.length > 0) {
      categories.push({
        key: 'notChecked',
        title: '未打卡',
        count: notChecked.length,
        list: notChecked,
        tone: 'danger'
      });
    }
    
    if (onOvertime.length > 0) {
      categories.push({
        key: 'onOvertime',
        title: '加班中',
        count: onOvertime.length,
        list: onOvertime,
        tone: 'warning'
      });
    }
    
    // 已打卡始终显示
    categories.push({
      key: 'checkedIn',
      title: '已打卡',
      count: checkedIn.length,
      list: checkedIn,
      tone: 'success'
    });

    return categories;
  },

  buildPerson(item, category) {
    const statusInfo = this.getStatusInfo(category, item);
    return {
      user_id: item.user_id,
      name: item.real_name,
      date: statusInfo.date,
      time: statusInfo.time,
      days: statusInfo.days,
      extra: statusInfo.extra, // 保留用于其他类别
      compact: category === 'notChecked' || category === 'checked'
    };
  },

  getStatusInfo(category, item) {
    switch (category) {
      case 'notChecked':
        return { date: '', time: '', days: '', extra: '' };
      case 'checked':
        return { date: '', time: '', days: '', extra: '' };
      case 'leave':
        if (item.leave_start_date) {
          const dateTimeInfo = this.formatLeaveDateTime(item.leave_start_date, item.leave_end_date);
          const days = item.leave_days !== undefined && item.leave_days !== null ? item.leave_days : 1;
          return {
            date: dateTimeInfo.date,
            time: dateTimeInfo.time,
            days: `${days}天`,
            extra: `${dateTimeInfo.date} ${dateTimeInfo.time} 共${days}天` // 保留用于兼容
          };
        }
        const leaveDays = item.leave_days ? `${item.leave_days}天` : '';
        return { date: '', time: '', days: leaveDays, extra: leaveDays || '请假' };
      case 'overtime':
        if (item.overtime_start_time) {
          const dateTimeInfo = this.formatOvertimeDateTime(item.overtime_start_time, item.overtime_end_time);
          const days = item.overtime_days !== undefined && item.overtime_days !== null ? item.overtime_days : 1;
          return {
            date: dateTimeInfo.date,
            time: dateTimeInfo.time,
            days: `${days}天`,
            extra: `${dateTimeInfo.date} ${dateTimeInfo.time} 共${days}天` // 保留用于兼容
          };
        }
        const overtimeDays = item.overtime_days ? `${item.overtime_days}天` : '';
        return { date: '', time: '', days: overtimeDays, extra: overtimeDays || '加班' };
      default:
        return { date: '', time: '', days: '', extra: '' };
    }
  },

  getStatusText(category, item) {
    // 保留此方法用于向后兼容
    const info = this.getStatusInfo(category, item);
    return info.extra;
  },

  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date)) return '';
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  formatLeaveDateTime(start, end) {
    if (!start) return { date: '', time: '' };
    
    // 调试：打印原始输入
    console.log('formatLeaveDateTime input:', { start, end, startType: typeof start, endType: typeof end });
    
    // 处理时区问题：确保日期字符串格式正确
    const normalizeDateStr = (dateStr) => {
      if (!dateStr) return '';
      
      console.log('normalizeDateStr input:', dateStr);
      
      // 如果包含 'T'，直接使用；否则添加 'T00:00:00'
      if (dateStr.includes('T')) {
        // 移除毫秒部分和时区信息，当作本地时间处理
        let normalized = dateStr.split('.')[0];
        // 如果包含时区信息（+08:00 或 Z），移除它
        if (normalized.includes('+') || normalized.includes('Z')) {
          normalized = normalized.split('+')[0].split('Z')[0];
        }
        console.log('normalized (with T):', normalized);
        return normalized;
      }
      // 如果不包含 'T'，可能是纯日期格式，添加默认时间
      const result = dateStr + 'T00:00:00';
      console.log('normalized (no T, added T00:00:00):', result);
      return result;
    };
    
    const normalizedStartStr = normalizeDateStr(start);
    const normalizedEndStr = normalizeDateStr(end || start);
    
    console.log('normalized strings:', { normalizedStartStr, normalizedEndStr });
    
    // 手动解析日期时间，避免时区转换问题
    const parseDateTime = (dateStr) => {
      if (!dateStr) return null;
      
      // 格式：YYYY-MM-DDTHH:mm:ss 或 YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DD
      let datePart = '';
      let timePart = '';
      
      if (dateStr.includes('T')) {
        const parts = dateStr.split('T');
        datePart = parts[0];
        timePart = parts[1] || '00:00:00';
      } else if (dateStr.includes(' ')) {
        const parts = dateStr.split(' ');
        datePart = parts[0];
        timePart = parts[1] || '00:00:00';
      } else {
        // 只有日期，没有时间
        datePart = dateStr;
        timePart = '00:00:00';
      }
      
      // 移除时区信息
      if (timePart.includes('+') || timePart.includes('Z')) {
        timePart = timePart.split('+')[0].split('Z')[0];
      }
      // 移除毫秒
      if (timePart.includes('.')) {
        timePart = timePart.split('.')[0];
      }
      
      const dateParts = datePart.split('-');
      const timeParts = timePart.split(':');
      
      if (dateParts.length !== 3) return null;
      if (timeParts.length < 2) return null;
      
      return {
        year: parseInt(dateParts[0]),
        month: parseInt(dateParts[1]),
        day: parseInt(dateParts[2]),
        hours: parseInt(timeParts[0] || '0'),
        minutes: parseInt(timeParts[1] || '0')
      };
    };
    
    const startParts = parseDateTime(normalizedStartStr);
    const endParts = parseDateTime(normalizedEndStr);
    
    console.log('formatLeaveDateTime parsed parts:', { startParts, endParts });
    
    if (!startParts || !endParts) {
      console.log('formatLeaveDateTime: parseDateTime failed, returning empty');
      return { date: '', time: '' };
    }
    
    // 使用解析的日期时间部分
    const startMonth = String(startParts.month).padStart(2, '0');
    const startDay = String(startParts.day).padStart(2, '0');
    const startHours = String(startParts.hours).padStart(2, '0');
    const startMinutes = String(startParts.minutes).padStart(2, '0');
    
    const endMonth = String(endParts.month).padStart(2, '0');
    const endDay = String(endParts.day).padStart(2, '0');
    const endHours = String(endParts.hours).padStart(2, '0');
    const endMinutes = String(endParts.minutes).padStart(2, '0');
    
    console.log('formatLeaveDateTime formatted:', {
      start: `${startMonth}月${startDay}日 ${startHours}:${startMinutes}`,
      end: `${endMonth}月${endDay}日 ${endHours}:${endMinutes}`
    });
    
    // 判断是否同一天
    const isSameDay = startParts.year === endParts.year && 
                      startParts.month === endParts.month && 
                      startParts.day === endParts.day;
    
    let dateText = '';
    let timeText = '';
    
    if (isSameDay) {
      // 一天以内：第一排显示日期，第二排显示时间
      dateText = `${startMonth}月${startDay}日`;
      timeText = `${startHours}:${startMinutes}-${endHours}:${endMinutes}`;
    } else {
      // 一天以上：第一排显示起始时间，第二排显示结束时间
      dateText = `${startMonth}月${startDay}日 ${startHours}:${startMinutes}`;
      timeText = `${endMonth}月${endDay}日 ${endHours}:${endMinutes}`;
    }
    
    console.log('formatLeaveDateTime final result:', { dateText, timeText });
    
    return { date: dateText, time: timeText };
  },

  formatOvertimeDateTime(start, end) {
    if (!start) return { date: '', time: '' };
    // 处理时区问题：确保日期字符串格式正确
    const normalizeDateStr = (dateStr) => {
      if (!dateStr) return '';
      // 如果包含 'T'，直接使用；否则添加 'T00:00:00'
      if (dateStr.includes('T')) {
        // 移除毫秒部分和时区信息，当作本地时间处理
        let normalized = dateStr.split('.')[0];
        // 如果包含时区信息（+08:00 或 Z），移除它
        if (normalized.includes('+') || normalized.includes('Z')) {
          normalized = normalized.split('+')[0].split('Z')[0];
        }
        return normalized;
      }
      return dateStr + 'T00:00:00';
    };
    
    const normalizedStartStr = normalizeDateStr(start);
    const normalizedEndStr = normalizeDateStr(end || start);
    
    // 手动解析日期时间，避免时区转换问题
    const parseDateTime = (dateStr) => {
      if (!dateStr) return null;
      
      // 格式：YYYY-MM-DDTHH:mm:ss 或 YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DD
      let datePart = '';
      let timePart = '';
      
      if (dateStr.includes('T')) {
        const parts = dateStr.split('T');
        datePart = parts[0];
        timePart = parts[1] || '00:00:00';
      } else if (dateStr.includes(' ')) {
        const parts = dateStr.split(' ');
        datePart = parts[0];
        timePart = parts[1] || '00:00:00';
      } else {
        // 只有日期，没有时间
        datePart = dateStr;
        timePart = '00:00:00';
      }
      
      // 移除时区信息
      if (timePart.includes('+') || timePart.includes('Z')) {
        timePart = timePart.split('+')[0].split('Z')[0];
      }
      // 移除毫秒
      if (timePart.includes('.')) {
        timePart = timePart.split('.')[0];
      }
      
      const dateParts = datePart.split('-');
      const timeParts = timePart.split(':');
      
      if (dateParts.length !== 3) return null;
      if (timeParts.length < 2) return null;
      
      return {
        year: parseInt(dateParts[0]),
        month: parseInt(dateParts[1]),
        day: parseInt(dateParts[2]),
        hours: parseInt(timeParts[0] || '0'),
        minutes: parseInt(timeParts[1] || '0')
      };
    };
    
    const startParts = parseDateTime(normalizedStartStr);
    const endParts = parseDateTime(normalizedEndStr);
    
    if (!startParts || !endParts) {
      return { date: '', time: '' };
    }
    
    // 使用解析的日期时间部分
    const startMonth = String(startParts.month).padStart(2, '0');
    const startDay = String(startParts.day).padStart(2, '0');
    const startHours = String(startParts.hours).padStart(2, '0');
    const startMinutes = String(startParts.minutes).padStart(2, '0');
    
    const endMonth = String(endParts.month).padStart(2, '0');
    const endDay = String(endParts.day).padStart(2, '0');
    const endHours = String(endParts.hours).padStart(2, '0');
    const endMinutes = String(endParts.minutes).padStart(2, '0');
    
    // 判断是否同一天
    const isSameDay = startParts.year === endParts.year && 
                      startParts.month === endParts.month && 
                      startParts.day === endParts.day;
    
    let dateText = '';
    let timeText = '';
    
    if (isSameDay) {
      // 一天以内：第一排显示日期，第二排显示时间
      dateText = `${startMonth}月${startDay}日`;
      timeText = `${startHours}:${startMinutes}-${endHours}:${endMinutes}`;
    } else {
      // 一天以上：第一排显示起始时间，第二排显示结束时间
      dateText = `${startMonth}月${startDay}日 ${startHours}:${startMinutes}`;
      timeText = `${endMonth}月${endDay}日 ${endHours}:${endMinutes}`;
    }
    
    return { date: dateText, time: timeText };
  },

  formatLeaveDate(start, end) {
    // 保留此方法用于向后兼容
    const dateTimeInfo = this.formatLeaveDateTime(start, end);
    return dateTimeInfo.date ? `${dateTimeInfo.date} ${dateTimeInfo.time}` : '';
  },

  formatOvertimeDate(start, end) {
    // 保留此方法用于向后兼容
    const dateTimeInfo = this.formatOvertimeDateTime(start, end);
    return dateTimeInfo.date ? `${dateTimeInfo.date} ${dateTimeInfo.time}` : '';
  },

  formatLeaveRange(start, end, leaveDays) {
    // 保留此方法用于向后兼容
    if (!start) return '请假';
    const dateInfo = this.formatLeaveDate(start, end);
    const days = leaveDays !== undefined && leaveDays !== null ? leaveDays : 1;
    return dateInfo ? `${dateInfo} 共${days}天` : `共${days}天`;
  },

  formatOvertimeRange(start, end, days) {
    // 保留此方法用于向后兼容
    if (!start) return days ? `${days}天` : '加班';
    const dateInfo = this.formatOvertimeDate(start, end);
    const totalDays = days !== undefined && days !== null ? days : 1;
    return dateInfo ? `${dateInfo} 共${totalDays}天` : `共${totalDays}天`;
  },

  formatFullDate(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}月${day}日`;
  }
});

