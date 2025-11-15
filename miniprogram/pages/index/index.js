// pages/index/index.js
const app = getApp();

Page({
  data: {
    currentTime: '00:00:00',
    currentDate: '',
    checkinStatus: '未打卡',
    checkoutStatus: '未打卡',
    checkinDisabled: false,
    checkoutDisabled: true,
    location: '',
    pendingCount: 0,
    recentAttendance: [],
    hasApprovalPermission: false
  },

  onLoad() {
    this.updateClock();
    this.clockTimer = setInterval(() => {
      this.updateClock();
    }, 1000);
  },

  onShow() {
    // 检查登录状态
    if (!app.globalData.token) {
      // 先检查本地 token
      const token = wx.getStorageSync('token');
      if (token) {
        app.globalData.token = token;
        // 验证 token 是否有效
        app.checkLoginStatus().then((isValid) => {
          if (!isValid) {
            // token 无效，跳转到登录页
            wx.redirectTo({
              url: '/pages/login/login'
            });
          }
        });
      } else {
        // 没有 token，直接跳转到登录页
        wx.redirectTo({
          url: '/pages/login/login'
        });
      }
      return;
    }
    
    // 检查审批权限
    this.checkApprovalPermission();
    
    // 确保数据已初始化，避免渲染时出错
    this.setData({
      recentAttendance: this.data.recentAttendance || [],
      pendingCount: this.data.pendingCount || 0
    });
    
    this.loadTodayAttendance();
    this.loadRecentAttendance();
    this.loadPendingCount();
    // 检查工作日并设置按钮状态
    this.checkAndSetAttendanceButtons();
  },
  
  // 检查审批权限
  checkApprovalPermission() {
    const userInfo = app.globalData.userInfo;
    if (userInfo) {
      const hasPermission = ['admin', 'general_manager', 'vice_president', 'department_head'].includes(userInfo.role);
      this.setData({ hasApprovalPermission: hasPermission });
    }
  },

  onUnload() {
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }
  },

  // 更新时钟
  updateClock() {
    const now = new Date();
    
    // 手动格式化时间，确保24小时制（00-23）
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const time = `${hours}:${minutes}:${seconds}`;
    
    const date = now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    this.setData({ currentTime: time, currentDate: date });
  },

  // 获取位置（优化版，支持重试机制）
  async getLocation(retryCount = 0) {
    return new Promise((resolve, reject) => {
      const options = {
        type: 'gcj02',
        altitude: false,
        isHighAccuracy: retryCount === 0,  // 第一次启用高精度
        highAccuracyExpireTime: retryCount === 0 ? 20000 : 10000  // 超时时间
      };

      wx.getLocation({
        ...options,
        success: async (res) => {
          try {
            const { latitude, longitude, accuracy } = res;
            
            // 验证坐标有效性
            if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
              throw new Error('获取的位置坐标无效');
            }
            
            // 调用地理编码API获取地址文本（不阻塞，失败时使用坐标）
            let address = null;
            try {
              const geocodeRes = await app.request({
                url: `/attendance/geocode/reverse?latitude=${latitude}&longitude=${longitude}`
              });
              address = geocodeRes.address;
            } catch (geocodeError) {
              console.warn('地理编码失败，使用坐标:', geocodeError);
              // 地理编码失败不影响打卡，使用坐标
            }
            
            const location = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            
            resolve({
              location,  // 保留坐标字符串用于兼容
              address: address || location,  // 地址文本，失败时使用坐标
              latitude,
              longitude,
              accuracy: accuracy || null  // 定位精度（米）
            });
          } catch (error) {
            reject(new Error('处理位置信息失败: ' + error.message));
          }
        },
        fail: (err) => {
          let errorMessage = '无法获取位置信息';
          let shouldRetry = false;
          
          if (err.errMsg) {
            if (err.errMsg.includes('auth deny') || err.errMsg.includes('permission')) {
              errorMessage = '定位权限被拒绝\n\n解决方法：\n1. 点击右上角"..."菜单\n2. 选择"设置"\n3. 开启"位置信息"权限\n4. 重新打开小程序';
            } else if (err.errMsg.includes('timeout') || err.errMsg.includes('超时')) {
              if (retryCount === 0) {
                shouldRetry = true;
                errorMessage = '获取位置超时，正在重试...';
              } else {
                errorMessage = '获取位置超时\n\n解决方法：\n1. 检查网络连接\n2. 移动到信号较好的位置\n3. 确保GPS已开启\n4. 稍后重试';
              }
            } else if (err.errMsg.includes('unavailable') || err.errMsg.includes('不可用')) {
              if (retryCount === 0) {
                shouldRetry = true;
                errorMessage = 'GPS信号弱，正在尝试使用网络定位...';
              } else {
                errorMessage = '位置信息不可用\n\n解决方法：\n1. 检查GPS是否开启\n2. 移动到信号较好的位置\n3. 确保网络连接正常';
              }
            }
          }
          
          // 如果应该重试且未超过重试次数
          if (shouldRetry && retryCount < 1) {
            console.log('定位失败，尝试降低精度重试...');
            // 等待1秒后重试
            setTimeout(() => {
              this.getLocation(retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, 1000);
          } else {
            wx.showModal({
              title: '定位失败',
              content: errorMessage,
              showCancel: false
            });
            reject(err);
          }
        }
      });
    });
  },

  // 检查是否为工作日（调用后端API）
  async checkWorkday(date = null) {
    try {
      // 如果没有指定日期，使用今天
      if (!date) {
        const today = new Date();
        date = today.toISOString().split('T')[0];
      }
      
      // 调用后端API检查（无需登录）
      const workdayCheck = await app.request({
        url: `/holidays/check/${date}`
      });
      
      return workdayCheck;
    } catch (error) {
      console.error('检查工作日失败:', error);
      // 出错时回退到本地判断
      return this.localWorkdayCheck(date);
    }
  },

  // 本地工作日判断（后备方案）
  localWorkdayCheck(dateStr) {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      return {
        date: dateStr,
        is_workday: true,
        reason: '正常工作日',
        holiday_name: null
      };
    } else {
      return {
        date: dateStr,
        is_workday: false,
        reason: dayNames[dayOfWeek],
        holiday_name: null
      };
    }
  },

  // 检查并设置打卡按钮状态
  async checkAndSetAttendanceButtons() {
    try {
      // 检查今天是否为工作日
      const workdayCheck = await this.checkWorkday();
      
      if (!workdayCheck.is_workday) {
        // 非工作日，禁用打卡按钮
        this.setData({
          checkinDisabled: true,
          checkoutDisabled: true
        });
        
        // 显示提示信息
        let message = '';
        if (workdayCheck.holiday_name) {
          message = `今天是${workdayCheck.holiday_name}，无需打卡`;
        } else if (workdayCheck.reason === '周末') {
          const today = new Date();
          const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
          const dayName = dayNames[today.getDay()];
          message = `今天是${dayName}，非工作日无需打卡`;
        } else {
          message = `${workdayCheck.reason}，无需打卡`;
        }
        this.setData({ location: message });
      } else {
        // 工作日，不在这里设置按钮状态，让 loadTodayAttendance 来设置
        // 但如果是调休工作日，显示提示
        if (workdayCheck.reason === '调休工作日') {
          const message = `今天是${workdayCheck.holiday_name || '调休工作日'}`;
          this.setData({ location: message });
        }
        // 如果是正常工作日，清空位置提示（等待打卡时显示位置）
        else if (workdayCheck.reason === '正常工作日') {
          // 不清空，让 loadTodayAttendance 或打卡时设置
        }
      }
    } catch (error) {
      console.error('检查工作日状态失败:', error);
    }
  },

  // 上班打卡
  async checkin() {
    // 检查是否为工作日
    const workdayCheck = await this.checkWorkday();
    if (!workdayCheck.is_workday) {
      const message = workdayCheck.holiday_name 
        ? `今天是${workdayCheck.holiday_name}，无需打卡！` 
        : '今天是休息日，无需打卡！';
      wx.showToast({
        title: message,
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    wx.showLoading({ title: '获取位置中...' });

    try {
      const locationData = await this.getLocation();
      const displayLocation = locationData.address || locationData.location;
      this.setData({ location: displayLocation });
      
      wx.showLoading({ title: '打卡中...' });

      await app.request({
        url: '/attendance/checkin',
        method: 'POST',
        data: locationData
      });

      wx.showToast({
        title: '上班打卡成功',
        icon: 'success',
        duration: 2000
      });

      this.loadTodayAttendance();
    } catch (error) {
      wx.showModal({
        title: '打卡失败',
        content: error.message || '请稍后重试',
        showCancel: false
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 下班打卡
  async checkout() {
    // 检查是否为工作日
    const workdayCheck = await this.checkWorkday();
    if (!workdayCheck.is_workday) {
      const message = workdayCheck.holiday_name 
        ? `今天是${workdayCheck.holiday_name}，无需打卡！` 
        : '今天是休息日，无需打卡！';
      wx.showToast({
        title: message,
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    wx.showLoading({ title: '获取位置中...' });

    try {
      const locationData = await this.getLocation();
      const displayLocation = locationData.address || locationData.location;
      this.setData({ location: displayLocation });
      
      wx.showLoading({ title: '打卡中...' });

      await app.request({
        url: '/attendance/checkout',
        method: 'POST',
        data: locationData
      });

      wx.showToast({
        title: '下班打卡成功',
        icon: 'success',
        duration: 2000
      });

      this.loadTodayAttendance();
    } catch (error) {
      wx.showModal({
        title: '打卡失败',
        content: error.message || '请稍后重试',
        showCancel: false
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 加载今日打卡状态
  async loadTodayAttendance() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await app.request({
        url: `/attendance/my?start_date=${today}&end_date=${today}`
      });

      // 确保 data 是数组
      const safeData = Array.isArray(data) ? data : [];

      if (safeData.length > 0) {
        const formatTime = (dateStr) => {
          if (!dateStr) return '未打卡';
          const date = new Date(dateStr);
          return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
        };

        const att = safeData[0];
        // 检查是否为工作日（非工作日时保持禁用状态）
        const workdayCheck = await this.checkWorkday();
        const isWorkday = workdayCheck.is_workday;
        
        this.setData({
          checkinStatus: formatTime(att.checkin_time),
          checkoutStatus: formatTime(att.checkout_time),
          // 如果是工作日，根据打卡状态设置按钮；如果不是工作日，保持禁用
          checkinDisabled: !isWorkday || !!att.checkin_time,
          checkoutDisabled: !isWorkday || !att.checkin_time || !!att.checkout_time
        });
      } else {
        // 没有记录，检查是否为工作日
        const workdayCheck = await this.checkWorkday();
        const isWorkday = workdayCheck.is_workday;
        
        // 只有在工作日时才重置为未打卡状态
        this.setData({
          checkinStatus: '未打卡',
          checkoutStatus: '未打卡',
          checkinDisabled: !isWorkday,  // 非工作日禁用
          checkoutDisabled: !isWorkday || true  // 非工作日或未上班时禁用
        });
      }
    } catch (error) {
      console.error('加载今日打卡失败:', error);
    }
  },

  // 加载最近考勤
  async loadRecentAttendance() {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const data = await app.request({
        url: `/attendance/my?start_date=${startDate}&end_date=${endDate}&limit=5`
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

      // 确保 data 是数组
      const safeData = Array.isArray(data) ? data : [];
      
      const recentAttendance = safeData.map(att => {
        // 确保 att 不是 null
        if (!att || typeof att !== 'object') {
          return null;
        }
        const date = new Date(att.date);
        return {
          id: att.id,
          day: date.getDate(),
          month: date.getMonth() + 1,
          checkinTime: formatTime(att.checkin_time),
          checkoutTime: formatTime(att.checkout_time),
          isLate: att.is_late,
          isEarlyLeave: att.is_early_leave
        };
      }).filter(item => item !== null);

      this.setData({ recentAttendance });
    } catch (error) {
      console.error('加载最近考勤失败:', error);
    }
  },

  // 加载待审批数量
  async loadPendingCount() {
    if (!this.data.hasApprovalPermission) {
      return;
    }
    
    try {
      const [leaves, overtimes] = await Promise.all([
        app.request({ url: '/leave/pending' }),
        app.request({ url: '/overtime/pending' })
      ]);
      
      const leaveCount = Array.isArray(leaves) ? leaves.length : 0;
      const overtimeCount = Array.isArray(overtimes) ? overtimes.length : 0;
      const count = leaveCount + overtimeCount;
      this.setData({ pendingCount: count });
    } catch (error) {
      console.error('加载待审批数量失败:', error);
      this.setData({ pendingCount: 0 });
    }
  },

  // 导航到其他页面
  goToAttendance() {
    wx.switchTab({ url: '/pages/attendance/attendance' });
  },

  goToLeave() {
    wx.navigateTo({ url: '/pages/leave/leave' });
  },

  goToOvertime() {
    wx.navigateTo({ url: '/pages/overtime/overtime' });
  },

  goToApproval() {
    wx.switchTab({ url: '/pages/approval/approval' });
  },

  goToStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  }
});



