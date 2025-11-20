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
    locationColor: '#8E8E93',  // 位置信息文字颜色
    pendingCount: 0,
    leavePendingCount: 0,  // 未完成的请假申请数量
    overtimePendingCount: 0,  // 未完成的加班申请数量
    recentAttendance: [],
    hasApprovalPermission: false,
    hasOverviewPermission: false,
    isWorkday: true,  // 是否为工作日，用于控制打卡状态区域的显示
    showClockStatus: true,  // 是否显示打卡状态区域
    todayAttendance: null,  // 今日打卡记录
    checkinStatusList: [
      { name: '正常签到', code: 'normal' },
      { name: '市区办事', code: 'city_business' },
      { name: '出差', code: 'business_trip' }
    ],
    checkinStatusIndex: 0,  // 当前选中的状态索引
    showStatusSelector: false  // 是否显示状态选择器
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
        // 验证 token 是否有效，并获取用户信息
        app.checkLoginStatus().then((isValid) => {
          if (!isValid) {
            // token 无效，跳转到登录页
            wx.redirectTo({
              url: '/pages/login/login'
            });
          } else {
            // token 有效，用户信息已加载，检查权限并加载数据
            this.checkApprovalPermission();
            this.checkOverviewPermission();
            this.loadData();
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
    
    // 如果有 token 但没有用户信息，先获取用户信息
    if (!app.globalData.userInfo) {
      app.checkLoginStatus().then((isValid) => {
        if (isValid) {
          // 用户信息已加载，检查权限并加载数据
          this.checkApprovalPermission();
          this.checkOverviewPermission();
          this.loadData();
        } else {
          // token 无效，跳转到登录页
          wx.redirectTo({
            url: '/pages/login/login'
          });
        }
      });
      return;
    }
    
    // 用户信息已存在，直接检查权限并加载数据
    this.checkApprovalPermission();
    this.checkOverviewPermission();
    this.loadData();
  },
  
  // 加载页面数据（提取为独立方法，便于复用）
  loadData() {
    // 确保数据已初始化，避免渲染时出错
    this.setData({
      recentAttendance: this.data.recentAttendance || [],
      pendingCount: this.data.pendingCount || 0
    });
    
    this.loadTodayAttendance();
    this.loadRecentAttendance();
    this.loadPendingCount();
    this.loadMyPendingCounts();  // 加载我的未完成申请数量
    this.loadCheckinStatuses();  // 加载打卡状态列表
    // 检查工作日并设置按钮状态
    this.checkAndSetAttendanceButtons();
  },

  // 加载打卡状态列表
  async loadCheckinStatuses() {
    try {
      const statuses = await app.request({
        url: '/attendance/checkin-statuses'
      });
      if (statuses && statuses.length > 0) {
        // 过滤掉id为0的默认虚拟数据
        const realStatuses = statuses.filter(s => s.id !== 0);
        if (realStatuses.length > 0) {
          this.setData({
            checkinStatusList: realStatuses.map(s => ({
              name: s.name,
              code: s.code
            })),
            checkinStatusIndex: 0  // 重置为第一个
          });
        }
      }
    } catch (error) {
      console.warn('加载打卡状态列表失败:', error);
      // 使用默认状态
    }
  },

  // 状态选择器变化事件
  onStatusChange(e) {
    this.setData({
      checkinStatusIndex: parseInt(e.detail.value)
    });
  },
  
  // 检查审批权限
  checkApprovalPermission() {
    const userInfo = app.globalData.userInfo;
    if (userInfo) {
      const hasPermission = ['admin', 'general_manager', 'vice_president', 'department_head'].includes(userInfo.role);
      this.setData({ hasApprovalPermission: hasPermission });
    }
  },

  async checkOverviewPermission() {
    try {
      const res = await app.request({
        url: '/attendance-viewers/check-permission'
      });
      const hasPermission = !!(res && (res.has_permission || res.hasPermission));
      this.setData({ hasOverviewPermission: hasPermission });
    } catch (error) {
      console.error('检查出勤查看权限失败:', error);
      this.setData({ hasOverviewPermission: false });
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
    
    // 手动格式化日期为中文格式，避免安卓微信显示英文
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekday = weekdays[now.getDay()];
    const date = `${year}年${month}月${day}日 ${weekday}`;

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
              location,  // 保留坐标字符串用于兼容（必需字段）
              address: address || location,  // 地址文本，失败时使用坐标
              latitude: latitude,  // 纬度（可选）
              longitude: longitude  // 经度（可选）
              // 注意：不发送accuracy字段，因为后端schema中没有定义
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

  // 获取东八区（UTC+8）的当前日期字符串（YYYY-MM-DD格式）
  getCSTDate(date = null) {
    if (!date) {
      const now = new Date();
      // 获取东八区时间（UTC+8）
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const cst = new Date(utc + (8 * 3600000)); // 东八区 = UTC+8
      const year = cst.getFullYear();
      const month = String(cst.getMonth() + 1).padStart(2, '0');
      const day = String(cst.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return date;
  },

  // 检查是否为工作日（调用后端API）
  async checkWorkday(date = null) {
    try {
      // 如果没有指定日期，使用今天（东八区）
      if (!date) {
        date = this.getCSTDate();
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
      // 先获取今日打卡状态，以确定按钮是否应该禁用
      let todayAttendance = null;
      try {
        // 使用东八区获取今天的日期
        const today = this.getCSTDate();
        
        // 获取最近7天的数据，然后在前端过滤今天的记录（与H5保持一致，避免时区问题）
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const cst = new Date(utc + (8 * 3600000)); // 东八区 = UTC+8
        const sevenDaysAgo = new Date(cst.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startYear = sevenDaysAgo.getFullYear();
        const startMonth = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
        const startDay = String(sevenDaysAgo.getDate()).padStart(2, '0');
        const startDate = `${startYear}-${startMonth}-${startDay}`;
        
        const attendances = await app.request({
          url: `/attendance/my?start_date=${startDate}&end_date=${today}&limit=10`
        });
        
        // 在前端过滤今天的记录，避免时区问题（与H5保持一致）
        if (attendances && attendances.length > 0) {
          const todayDateStr = today;
          for (const att of attendances) {
            if (att.date) {
              // 解析日期字段
              let attDateStr = '';
              if (typeof att.date === 'string') {
                attDateStr = att.date.split('T')[0];
              } else {
                const d = new Date(att.date);
                if (!isNaN(d.getTime())) {
                  attDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                }
              }
              if (attDateStr === todayDateStr) {
                todayAttendance = att;
                break;
              }
            }
          }
        }
      } catch (error) {
        console.error('获取今日打卡状态失败:', error);
      }
      
      // 检查今天是否为工作日
      let workdayCheck = await this.checkWorkday();
      
      // 确保 workdayCheck 存在且 is_workday 是布尔值
      if (!workdayCheck || workdayCheck.is_workday === undefined) {
        console.error('工作日检查结果异常:', workdayCheck);
        // 如果API返回异常，使用本地判断
        workdayCheck = this.localWorkdayCheck(this.getCSTDate());
      }
      
      if (!workdayCheck.is_workday) {
        // 非工作日，隐藏打卡状态区域，禁用打卡按钮
        let reasonText = '';
        const reason = workdayCheck.reason || '休息日';
        const holidayName = workdayCheck.holiday_name ? `（${workdayCheck.holiday_name}）` : '';
        
        if (reason === '周末') {
          reasonText = `今日${reason}，无需打卡`;
        } else if (reason === '公司节假日') {
          reasonText = `今日公司节假日${holidayName}，无需打卡`;
        } else if (reason === '法定节假日') {
          reasonText = `今日法定节假日${holidayName}，无需打卡`;
        } else {
          reasonText = `今日${reason}，无需打卡${holidayName}`;
        }
        
        this.setData({
          isWorkday: false,
          showClockStatus: false,  // 隐藏打卡状态区域
          checkinDisabled: true,
          checkoutDisabled: true,
          location: reasonText,
          locationColor: '#ff9500'  // 橙色（与H5保持一致）
        });
      } else {
        // 工作日（包括调休工作日）- 获取打卡策略时间范围
        const isMakeupWorkday = workdayCheck.reason === '调休工作日';
        const holidayName = workdayCheck.holiday_name ? `（${workdayCheck.holiday_name}）` : '';
        
        let checkinStartTime = '08:00';
        let checkinEndTime = '11:30';
        let checkoutStartTime = '17:20';
        let checkoutEndTime = '20:00';
        
        try {
          const policies = await app.request({
            url: '/attendance/policies'
          });
          if (policies && policies.length > 0) {
            const policy = policies.find(p => p.is_active) || policies[0];
            if (policy) {
              checkinStartTime = policy.checkin_start_time || checkinStartTime;
              checkinEndTime = policy.checkin_end_time || checkinEndTime;
              checkoutStartTime = policy.checkout_start_time || checkoutStartTime;
              checkoutEndTime = policy.checkout_end_time || checkoutEndTime;
            }
          }
        } catch (error) {
          console.warn('获取打卡策略失败，使用默认时间:', error);
        }
        
        // 更严格地检查时间字段是否存在且有效（与H5保持一致）
        const hasCheckin = todayAttendance && todayAttendance.checkin_time && 
                          todayAttendance.checkin_time !== null && 
                          todayAttendance.checkin_time !== '';
        const hasCheckout = todayAttendance && todayAttendance.checkout_time && 
                           todayAttendance.checkout_time !== null && 
                           todayAttendance.checkout_time !== '';
        
        // 判断是否在打卡时间内
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = currentHour * 60 + currentMinute; // 转换为分钟数
        
        // 解析打卡时间范围
        const parseTime = (timeStr) => {
          const [h, m] = timeStr.split(':').map(Number);
          return h * 60 + m;
        };
        
        const checkinStart = parseTime(checkinStartTime);
        const checkinEnd = parseTime(checkinEndTime);
        const checkoutStart = parseTime(checkoutStartTime);
        const checkoutEnd = parseTime(checkoutEndTime);
        
        // 判断是否在打卡时间内
        const isInCheckinTime = currentTime >= checkinStart && currentTime <= checkinEnd;
        const isInCheckoutTime = currentTime >= checkoutStart && currentTime <= checkoutEnd;
        const isInPunchTime = isInCheckinTime || isInCheckoutTime;
        
        // 如果已打卡或是在打卡时间内且未打卡，显示打卡状态区域
        const showClockStatus = hasCheckin || hasCheckout || (isInPunchTime && !hasCheckin);
        
        // 检查请假状态
        let leaveStatusInfo = null;
        try {
          leaveStatusInfo = await app.request({
            url: '/attendance/leave-status'
          });
        } catch (error) {
          console.warn('获取请假状态失败:', error);
        }
        
        let locationText = '';
        let locationColor = '#8E8E93';  // 默认灰色
        // 如果是调休工作日且未打卡，优先显示调休工作日提示
        if (isMakeupWorkday && !hasCheckin && !hasCheckout) {
          locationText = `调休工作日${holidayName}，请正常打卡`;
          locationColor = '#007aff';  // 蓝色
        } else if (hasCheckin && hasCheckout) {
          // 已下班打卡，显示完成提示
          locationText = '今天打卡完成，工作辛苦了！';
          locationColor = '#34c759';  // 绿色
        } else if (hasCheckin && !hasCheckout) {
          // 已上班打卡但未下班打卡，显示签退时间范围或请假信息
          if (leaveStatusInfo) {
            if (leaveStatusInfo.full_day_leave) {
              locationText = '今天全天请假';
              locationColor = '#ff9500';  // 橙色
            } else if (leaveStatusInfo.afternoon_leave) {
              locationText = '下午请假，无需签退';
              locationColor = '#ff9500';  // 橙色
            } else {
              locationText = `签退时间：${checkoutStartTime}-${checkoutEndTime}`;
              locationColor = '#999';  // 灰色
            }
          } else {
            locationText = `签退时间：${checkoutStartTime}-${checkoutEndTime}`;
            locationColor = '#999';  // 灰色
          }
        } else if (leaveStatusInfo) {
          // 显示请假状态提示
          if (leaveStatusInfo.full_day_leave) {
            locationText = '今天全天请假，无需打卡';
            locationColor = '#ff9500';  // 橙色
          } else if (leaveStatusInfo.morning_leave) {
            locationText = '上午请假，可在14:10前签到';
            locationColor = '#ff9500';  // 橙色
          } else if (leaveStatusInfo.afternoon_leave) {
            locationText = '下午请假，上午正常签到';
            locationColor = '#ff9500';  // 橙色
          } else if (isInCheckinTime) {
            const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
            locationText = `${workdayText}，请及时签到（${checkinStartTime}-${checkinEndTime}）`;
            locationColor = '#007aff';  // 蓝色
          } else if (isInCheckoutTime) {
            const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
            locationText = `${workdayText}，请及时签退（${checkoutStartTime}-${checkoutEndTime}）`;
            locationColor = '#007aff';  // 蓝色
          } else if (currentTime < checkinStart) {
            const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
            locationText = `${workdayText}，签到时间：${checkinStartTime}-${checkinEndTime}`;
            locationColor = '#999';  // 灰色
          } else if (currentTime > checkinEnd && currentTime < checkoutStart) {
            const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
            locationText = `${workdayText}，签退时间：${checkoutStartTime}-${checkoutEndTime}`;
            locationColor = '#999';  // 灰色
          } else {
            const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
            locationText = `${workdayText}，已过打卡时间`;
            locationColor = '#999';  // 灰色
          }
        } else if (isInCheckinTime) {
          const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
          locationText = `${workdayText}，请及时签到（${checkinStartTime}-${checkinEndTime}）`;
          locationColor = '#007aff';  // 蓝色
        } else if (isInCheckoutTime) {
          const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
          locationText = `${workdayText}，请及时签退（${checkoutStartTime}-${checkoutEndTime}）`;
          locationColor = '#007aff';  // 蓝色
        } else if (currentTime < checkinStart) {
          const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
          locationText = `${workdayText}，签到时间：${checkinStartTime}-${checkinEndTime}`;
          locationColor = '#999';  // 灰色
        } else if (currentTime > checkinEnd && currentTime < checkoutStart) {
          const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
          locationText = `${workdayText}，签退时间：${checkoutStartTime}-${checkoutEndTime}`;
          locationColor = '#999';  // 灰色
        } else {
          const workdayText = isMakeupWorkday ? '调休工作日' : '工作日';
          locationText = `${workdayText}，已过打卡时间`;
          locationColor = '#999';  // 灰色
        }
        
        // 设置按钮状态
        let checkinDisabled = false;
        let checkoutDisabled = true; // 未上班时，下班按钮禁用
        
        if (!hasCheckin && !hasCheckout) {
          // 未打卡，根据打卡时间判断按钮状态
          checkinDisabled = !isInCheckinTime; // 不在签到时间内，禁用上班打卡按钮
        } else if (hasCheckin) {
          // 已上班打卡
          checkinDisabled = true; // 已打卡，禁用上班打卡按钮
          checkoutDisabled = hasCheckout; // 已下班打卡则禁用，否则可用
        }
        
        // 显示状态选择器（如果未打卡且在打卡时间内）
        const showStatusSelector = !hasCheckin && isInPunchTime && !leaveStatusInfo?.full_day_leave;
        
        this.setData({
          isWorkday: true,
          showClockStatus: showClockStatus,  // 根据状态显示/隐藏打卡状态区域
          checkinDisabled: checkinDisabled,
          checkoutDisabled: checkoutDisabled,
          location: locationText,
          locationColor: locationColor,  // 设置文字颜色
          showStatusSelector: showStatusSelector,  // 显示/隐藏状态选择器
          todayAttendance: todayAttendance  // 保存今日打卡记录，供其他函数使用
        });
      }
    } catch (error) {
      console.error('检查工作日状态失败:', error);
    }
  },

  // 上班打卡
  async checkin() {
    // 如果按钮已禁用（已打卡），直接返回
    if (this.data.checkinDisabled) {
      wx.showToast({
        title: '今天已经打过上班卡',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
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
    
    // 检查请假状态
    try {
      const leaveStatus = await app.request({
        url: '/attendance/leave-status'
      });
      if (leaveStatus.full_day_leave) {
        wx.showToast({
          title: '今天全天请假，无需打卡',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      if (leaveStatus.morning_leave) {
        // 检查是否在14:10前
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = currentHour * 60 + currentMinute;
        const deadline = 14 * 60 + 10;  // 14:10
        
        if (currentTime > deadline) {
          wx.showToast({
            title: '上午请假，签到时间已过（14:10后不可签到）',
            icon: 'none',
            duration: 2000
          });
          return;
        }
        // 在14:10前，显示确认对话框
        const res = await wx.showModal({
          title: '提示',
          content: '您今天上午请假，可以在14:10前签到。\n\n确定要继续打卡吗？',
          confirmText: '确定打卡',
          cancelText: '取消',
          confirmColor: '#ff9500'
        });
        if (!res.confirm) {
          return;  // 用户取消，不执行打卡
        }
      }
    } catch (error) {
      console.warn('检查请假状态失败:', error);
      // 如果检查失败，继续执行打卡（不影响正常流程）
    }
    
    // 检查是否会迟到（只有在非上午请假的情况下才检查）
    try {
      const leaveStatus = await app.request({
        url: '/attendance/leave-status'
      }).catch(() => ({ morning_leave: false }));
      if (!leaveStatus.morning_leave) {
        const lateCheck = await app.request({
          url: '/attendance/check-late'
        });
        if (lateCheck.will_be_late) {
          // 手动格式化时间，避免安卓微信显示时区信息
          let currentTime = lateCheck.current_time;
          if (!currentTime) {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            currentTime = `${hours}:${minutes}`;
          }
          const workStartTime = lateCheck.work_start_time || '09:00';
          const res = await wx.showModal({
            title: '迟到提醒',
            content: `当前时间 ${currentTime}，已超过上班时间 ${workStartTime}，打卡后将记录为迟到。\n\n确定要继续打卡吗？`,
            confirmText: '确定打卡',
            cancelText: '取消',
            confirmColor: '#ff9500'
          });
          if (!res.confirm) {
            return;  // 用户取消，不执行打卡
          }
        }
      }
    } catch (error) {
      console.warn('检查迟到状态失败:', error);
      // 如果检查失败，继续执行打卡（不影响正常流程）
    }
    
    wx.showLoading({ title: '获取位置中...' });

    try {
      const locationData = await this.getLocation();
      
      // 获取选中的打卡状态
      const selectedStatus = this.data.checkinStatusList[this.data.checkinStatusIndex];
      locationData.checkin_status = selectedStatus ? selectedStatus.code : 'normal';
      
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

      // 重新加载页面数据
      await this.loadTodayAttendance();
      await this.loadRecentAttendance();
      await this.loadPendingCount();
      
      // 刷新页面以确保所有数据都是最新的
      setTimeout(() => {
        this.onShow();
      }, 500);
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
    // 如果按钮已禁用（已打卡），直接返回
    if (this.data.checkoutDisabled) {
      wx.showToast({
        title: '今天已经打过下班卡',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 检查请假状态
    try {
      const leaveStatus = await app.request({
        url: '/attendance/leave-status'
      });
      if (leaveStatus.afternoon_leave) {
        wx.showToast({
          title: '下午请假，无需签退',
          icon: 'none',
          duration: 2000
        });
        return;
      }
    } catch (error) {
      console.warn('检查请假状态失败:', error);
      // 如果检查失败，继续执行打卡（不影响正常流程）
    }
    
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
    
    // 检查是否会早退
    try {
      const earlyLeaveCheck = await app.request({
        url: '/attendance/check-early-leave'
      });
      if (earlyLeaveCheck.will_be_early_leave) {
        // 手动格式化时间，避免安卓微信显示时区信息
        let currentTime = earlyLeaveCheck.current_time;
        if (!currentTime) {
          const now = new Date();
          const hours = String(now.getHours()).padStart(2, '0');
          const minutes = String(now.getMinutes()).padStart(2, '0');
          currentTime = `${hours}:${minutes}`;
        }
        const workEndTime = earlyLeaveCheck.work_end_time || '18:00';
        const res = await wx.showModal({
          title: '早退提醒',
          content: `当前时间 ${currentTime}，早于下班时间 ${workEndTime}，打卡后将记录为早退。\n\n确定要继续打卡吗？`,
          confirmText: '确定打卡',
          cancelText: '取消',
          confirmColor: '#ff9500'
        });
        if (!res.confirm) {
          return;  // 用户取消，不执行打卡
        }
      }
    } catch (error) {
      console.warn('检查早退状态失败:', error);
      // 如果检查失败，继续执行打卡（不影响正常流程）
    }
    
    wx.showLoading({ title: '获取位置中...' });

    try {
      const locationData = await this.getLocation();
      
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

      // 重新加载页面数据
      await this.loadTodayAttendance();
      await this.loadRecentAttendance();
      await this.loadPendingCount();
      
      // 刷新页面以确保所有数据都是最新的
      setTimeout(() => {
        this.onShow();
      }, 500);
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
      // 使用东八区获取今天的日期
      const today = this.getCSTDate();
      const data = await app.request({
        url: `/attendance/my?start_date=${today}&end_date=${today}`
      });

      // 确保 data 是数组
      const safeData = Array.isArray(data) ? data : [];

      // 检查是否为工作日
      const workdayCheck = await this.checkWorkday();
      const isWorkday = workdayCheck.is_workday;

      if (safeData.length > 0) {
        const formatTime = (dateStr) => {
          if (!dateStr) return '未打卡';
          try {
            const date = new Date(dateStr);
            // 手动格式化，避免安卓微信显示时区信息
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${hours}:${minutes}:${seconds}`;
          } catch (error) {
            console.error('格式化时间失败:', error, dateStr);
            return '未打卡';
          }
        };

        const att = safeData[0];
        
        const hasCheckin = !!att.checkin_time;
        const hasCheckout = !!att.checkout_time;
        
        // 根据打卡状态显示相应信息
        let locationText = '';
        let locationColor = '#8E8E93';  // 默认灰色
        if (hasCheckin && hasCheckout) {
          // 已下班打卡，显示完成提示
          locationText = '今天打卡完成，工作辛苦了！';
          locationColor = '#34c759';  // 绿色
        } else if (hasCheckin && !hasCheckout) {
          // 已上班打卡但未下班打卡，需要获取签退时间范围或请假信息
          // 获取打卡策略时间范围
          let checkoutStartTime = '17:20';
          let checkoutEndTime = '20:00';
          try {
            const policies = await app.request({
              url: '/attendance/policies'
            });
            if (policies && policies.length > 0) {
              const policy = policies.find(p => p.is_active) || policies[0];
              if (policy) {
                checkoutStartTime = policy.checkout_start_time || checkoutStartTime;
                checkoutEndTime = policy.checkout_end_time || checkoutEndTime;
              }
            }
          } catch (error) {
            console.warn('获取打卡策略失败，使用默认时间:', error);
          }
          
          // 检查请假状态
          let leaveStatusInfo = null;
          try {
            leaveStatusInfo = await app.request({
              url: '/attendance/leave-status'
            });
          } catch (error) {
            console.warn('获取请假状态失败:', error);
          }
          
          if (leaveStatusInfo) {
            if (leaveStatusInfo.full_day_leave) {
              locationText = '今天全天请假';
              locationColor = '#ff9500';  // 橙色
            } else if (leaveStatusInfo.afternoon_leave) {
              locationText = '下午请假，无需签退';
              locationColor = '#ff9500';  // 橙色
            } else {
              locationText = `签退时间：${checkoutStartTime}-${checkoutEndTime}`;
              locationColor = '#999';  // 灰色
            }
          } else {
            locationText = `签退时间：${checkoutStartTime}-${checkoutEndTime}`;
            locationColor = '#999';  // 灰色
          }
        }
        
        this.setData({
          isWorkday: isWorkday,  // 更新工作日状态
          todayAttendance: att,  // 保存今日打卡记录
          showClockStatus: true,  // 已打卡，显示打卡状态区域
          checkinStatus: formatTime(att.checkin_time),
          checkoutStatus: formatTime(att.checkout_time),
          // 如果是工作日，根据打卡状态设置按钮；如果不是工作日，保持禁用
          checkinDisabled: !isWorkday || hasCheckin,
          checkoutDisabled: !isWorkday || !hasCheckin || hasCheckout,
          location: locationText,
          locationColor: locationColor  // 设置文字颜色
        });
      } else {
        // 没有记录，检查是否为工作日
        // 只有在工作日时才重置为未打卡状态
        this.setData({
          isWorkday: isWorkday,  // 更新工作日状态
          todayAttendance: null,  // 没有打卡记录
          checkinStatus: '未打卡',
          checkoutStatus: '未打卡',
          checkinDisabled: !isWorkday,  // 非工作日禁用
          checkoutDisabled: !isWorkday || true  // 非工作日或未上班时禁用
        });
        
        // 工作日且未打卡，判断是否在打卡时间内
        if (isWorkday) {
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();
          const currentTime = currentHour * 60 + currentMinute; // 转换为分钟数
          
          // 默认打卡时间范围
          const checkinStart = 8 * 60;   // 08:00
          const checkinEnd = 10 * 60;    // 10:00
          const checkoutStart = 17 * 60; // 17:00
          const checkoutEnd = 20 * 60;   // 20:00
          
          // 判断是否在打卡时间内
          const isInCheckinTime = currentTime >= checkinStart && currentTime <= checkinEnd;
          const isInCheckoutTime = currentTime >= checkoutStart && currentTime <= checkoutEnd;
          const isInPunchTime = isInCheckinTime || isInCheckoutTime;
          
          // 如果不在打卡时间内，隐藏打卡状态区域，并禁用上班打卡按钮
          this.setData({
            showClockStatus: isInPunchTime,  // 只在打卡时间内显示
            checkinDisabled: !isInPunchTime,  // 不在打卡时间内，禁用上班打卡按钮
            location: isInPunchTime ? '工作日，请及时打卡。' : '工作日，尚未开始打卡。',
            locationColor: isInPunchTime ? '#007aff' : '#999'  // 在打卡时间内显示蓝色，否则灰色
          });
        }
      }
    } catch (error) {
      console.error('加载今日打卡失败:', error);
    }
  },

  // 加载最近考勤（只显示最新的3天）
  async loadRecentAttendance() {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const data = await app.request({
        url: `/attendance/my?start_date=${startDate}&end_date=${endDate}&limit=10`
      });

      const formatTime = (dateStr) => {
        if (!dateStr) return null;
        try {
          const date = new Date(dateStr);
          // 手动格式化，避免安卓微信显示时区信息
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${hours}:${minutes}:${seconds}`;
        } catch (error) {
          console.error('格式化时间失败:', error, dateStr);
          return null;
        }
      };

      // 确保 data 是数组
      const safeData = Array.isArray(data) ? data : [];
      
      // 按日期排序（最新的在前），然后只取前3条
      const sortedData = safeData
        .filter(att => att && typeof att === 'object' && att.date)
        .sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          return dateB - dateA; // 降序，最新的在前
        })
        .slice(0, 3); // 只取最新的3条
      
      const recentAttendance = sortedData.map(att => {
        const date = new Date(att.date);
        return {
          id: att.id,
          day: date.getDate(),
          month: date.getMonth() + 1,
          checkinTime: formatTime(att.checkin_time),
          checkoutTime: formatTime(att.checkout_time),
          isLate: att.is_late,
          isEarlyLeave: att.is_early_leave,
          checkinLocation: att.checkin_location || null,
          checkoutLocation: att.checkout_location || null
        };
      });

      this.setData({ recentAttendance });
    } catch (error) {
      console.error('加载最近考勤失败:', error);
    }
  },

  // 加载我的未完成申请数量（请假和加班）
  async loadMyPendingCounts() {
    try {
      // 获取我的请假申请和加班申请
      const [leaves, overtimes] = await Promise.all([
        app.request({ url: '/leave/my' }).catch(() => []),
        app.request({ url: '/overtime/my' }).catch(() => [])
      ]);
      
      // 统计未完成的请假申请（pending, dept_approved, vp_approved）
      const leavePendingCount = Array.isArray(leaves) 
        ? leaves.filter(leave => ['pending', 'dept_approved', 'vp_approved'].includes(leave.status)).length 
        : 0;
      
      // 统计未完成的加班申请（pending）
      const overtimePendingCount = Array.isArray(overtimes)
        ? overtimes.filter(ot => ot.status === 'pending').length
        : 0;
      
      this.setData({
        leavePendingCount: leavePendingCount,
        overtimePendingCount: overtimePendingCount
      });
    } catch (error) {
      console.error('加载未完成申请数量失败:', error);
      this.setData({
        leavePendingCount: 0,
        overtimePendingCount: 0
      });
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
  },

  goToOverview() {
    if (!this.data.hasOverviewPermission) {
      wx.showToast({
        title: '暂无权限查看',
        icon: 'none'
      });
      return;
    }
    wx.navigateTo({ url: '/pages/overview/overview' });
  }
});



