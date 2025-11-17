// pages/approval/approval.js
const app = getApp();

Page({
  data: {
    currentTab: 'leave',
    leaveList: [],
    overtimeList: [],
    leaveCount: 0,
    overtimeCount: 0,
    hasApprovalPermission: false,
    showDetailModal: false,
    detailTitle: '',
    detailData: null,
    detailType: '' // 'leave' or 'overtime'
  },

  onLoad() {
    // onLoad 时先不检查权限，等 onShow 时再检查（确保用户信息已加载）
  },

  onShow() {
    if (!app.globalData.token) {
      // 先检查本地 token
      const token = wx.getStorageSync('token');
      if (token) {
        app.globalData.token = token;
        // 验证 token 并获取用户信息
        app.checkLoginStatus().then((isValid) => {
          if (!isValid) {
            wx.redirectTo({
              url: '/pages/login/login'
            });
          } else {
            // 用户信息已加载，检查权限并加载数据
            this.checkAndLoadData();
          }
        });
      } else {
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
          this.checkAndLoadData();
        } else {
          wx.redirectTo({
            url: '/pages/login/login'
          });
        }
      });
      return;
    }
    
    // 用户信息已存在，直接检查权限并加载数据
    this.checkAndLoadData();
  },
  
  // 检查权限并加载数据
  checkAndLoadData() {
    // 先检查权限
    const hasPermission = this.checkApprovalPermission();
    
    // 确保数据已初始化，避免渲染时出错
    this.setData({
      leaveList: this.data.leaveList || [],
      overtimeList: this.data.overtimeList || [],
      leaveCount: this.data.leaveCount || 0,
      overtimeCount: this.data.overtimeCount || 0
    });
    
    // 如果有权限，加载数据
    if (hasPermission) {
      this.loadPendingCount();
      this.loadPendingLeaves();
    }
  },

  // 检查审批权限，返回是否有权限
  checkApprovalPermission() {
    const userInfo = app.globalData.userInfo;
    if (userInfo) {
      const hasPermission = ['admin', 'general_manager', 'vice_president', 'department_head'].includes(userInfo.role);
      this.setData({ hasApprovalPermission: hasPermission });
      
      if (!hasPermission) {
        wx.showToast({
          title: '您没有审批权限',
          icon: 'none'
        });
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/index/index'
          });
        }, 1500);
      }
      
      return hasPermission;
    } else {
      // 用户信息不存在，暂时设置为 false
      this.setData({ hasApprovalPermission: false });
      return false;
    }
  },

  // 切换标签
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    
    if (tab === 'leave') {
      this.loadPendingLeaves();
    } else {
      this.loadPendingOvertimes();
    }
  },

  // 加载待审批数量
  async loadPendingCount() {
    try {
      const [leaves, overtimes] = await Promise.all([
        app.request({ url: '/leave/pending' }),
        app.request({ url: '/overtime/pending' })
      ]);
      
      this.setData({
        leaveCount: Array.isArray(leaves) ? leaves.length : 0,
        overtimeCount: Array.isArray(overtimes) ? overtimes.length : 0
      });
    } catch (error) {
      console.error('加载待审批数量失败:', error);
      this.setData({
        leaveCount: 0,
        overtimeCount: 0
      });
    }
  },

  // 加载待审批请假
  async loadPendingLeaves() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const data = await app.request({
        url: '/leave/pending'
      });

      const formatDate = (dateStr) => {
        try {
          const date = new Date(dateStr);
          // 手动格式化日期为中文格式，避免安卓微信显示英文
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const day = date.getDate();
          return `${year}年${month}月${day}日`;
        } catch (error) {
          console.error('格式化日期失败:', error, dateStr);
          return dateStr;
        }
      };

      // 格式化时间范围（智能省略重复的年份和日期）
      const formatTimeRange = (startStr, endStr) => {
        if (!startStr || !endStr) return '';
        try {
          // 处理时区问题：确保日期字符串格式正确
          const normalizeDateStr = (dateStr) => {
            if (!dateStr) return '';
            // 如果包含 'T'，直接使用；否则添加 'T00:00:00'
            if (dateStr.includes('T')) {
              return dateStr.split('.')[0]; // 移除毫秒部分
            }
            return dateStr + 'T00:00:00';
          };
          
          const normalizedStartStr = normalizeDateStr(startStr);
          const normalizedEndStr = normalizeDateStr(endStr);
          
          const startDate = new Date(normalizedStartStr);
          const endDate = new Date(normalizedEndStr);
          
          const startYear = startDate.getFullYear();
          const startMonth = startDate.getMonth() + 1;
          const startDay = startDate.getDate();
          const startHours = String(startDate.getHours()).padStart(2, '0');
          const startMinutes = String(startDate.getMinutes()).padStart(2, '0');
          
          const endYear = endDate.getFullYear();
          const endMonth = endDate.getMonth() + 1;
          const endDay = endDate.getDate();
          const endHours = String(endDate.getHours()).padStart(2, '0');
          const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
          
          let startPart = `${startYear}/${String(startMonth).padStart(2, '0')}/${String(startDay).padStart(2, '0')} ${startHours}:${startMinutes}`;
          let endPart = '';
          
          // 如果年份相同
          if (startYear === endYear) {
            // 如果日期也相同
            if (startMonth === endMonth && startDay === endDay) {
              // 只显示时间
              endPart = `${endHours}:${endMinutes}`;
            } else {
              // 只省略年份
              endPart = `${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')} ${endHours}:${endMinutes}`;
            }
          } else {
            // 年份不同，显示完整日期时间
            endPart = `${endYear}/${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')} ${endHours}:${endMinutes}`;
          }
          
          return `${startPart} ~ ${endPart}`;
        } catch (error) {
          console.error('格式化时间范围失败:', error, startStr, endStr);
          return `${formatDate(startStr)} ~ ${formatDate(endStr)}`;
        }
      };

      const getStatusName = (status) => {
        const statusMap = {
          'pending': '待审批',
          'dept_approved': '部门已批',
          'vp_approved': '副总已批'
        };
        return statusMap[status] || status;
      };

      // 确保 data 是数组
      const safeData = Array.isArray(data) ? data : [];
      
      const leaveList = safeData.map(leave => {
        // 确保 leave 不是 null
        if (!leave || typeof leave !== 'object') {
          return null;
        }
        return {
          ...leave,
          leave_type_name: leave.leave_type_name || '普通请假',
          timeRange: formatTimeRange(leave.start_date, leave.end_date), // 使用智能格式化时间范围
          startDate: formatDate(leave.start_date),
          endDate: formatDate(leave.end_date),
          statusName: getStatusName(leave.status)
        };
      }).filter(item => item !== null);

      this.setData({ 
        leaveList,
        leaveCount: safeData.length
      });
    } catch (error) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      console.error('加载待审批请假失败:', error);
    } finally {
      wx.hideLoading();
    }
  },

  // 加载待审批加班
  async loadPendingOvertimes() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const data = await app.request({
        url: '/overtime/pending'
      });

      const formatDateTime = (dateStr) => {
        if (!dateStr) return '';
        try {
          const date = new Date(dateStr);
          // 手动格式化日期时间为中文格式，避免安卓微信显示英文
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const day = date.getDate();
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${year}年${month}月${day}日 ${hours}:${minutes}`;
        } catch (error) {
          console.error('格式化日期时间失败:', error, dateStr);
          return dateStr;
        }
      };

      // 格式化时间范围（智能省略重复的年份和日期）
      const formatTimeRange = (startStr, endStr) => {
        if (!startStr || !endStr) return '';
        try {
          // 处理时区问题：确保日期字符串格式正确
          const normalizeDateStr = (dateStr) => {
            if (!dateStr) return '';
            // 如果包含 'T'，直接使用；否则添加 'T00:00:00'
            if (dateStr.includes('T')) {
              return dateStr.split('.')[0]; // 移除毫秒部分
            }
            return dateStr + 'T00:00:00';
          };
          
          const normalizedStartStr = normalizeDateStr(startStr);
          const normalizedEndStr = normalizeDateStr(endStr);
          
          const startDate = new Date(normalizedStartStr);
          const endDate = new Date(normalizedEndStr);
          
          // 使用本地方法获取日期组件
          const startYear = startDate.getFullYear();
          const startMonth = startDate.getMonth() + 1;
          const startDay = startDate.getDate();
          const startHours = String(startDate.getHours()).padStart(2, '0');
          const startMinutes = String(startDate.getMinutes()).padStart(2, '0');
          
          const endYear = endDate.getFullYear();
          const endMonth = endDate.getMonth() + 1;
          const endDay = endDate.getDate();
          const endHours = String(endDate.getHours()).padStart(2, '0');
          const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
          
          let startPart = `${startYear}/${String(startMonth).padStart(2, '0')}/${String(startDay).padStart(2, '0')} ${startHours}:${startMinutes}`;
          let endPart = '';
          
          // 如果年份相同
          if (startYear === endYear) {
            // 如果日期也相同
            if (startMonth === endMonth && startDay === endDay) {
              // 只显示时间
              endPart = `${endHours}:${endMinutes}`;
            } else {
              // 只省略年份
              endPart = `${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')} ${endHours}:${endMinutes}`;
            }
          } else {
            // 年份不同，显示完整日期时间
            endPart = `${endYear}/${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')} ${endHours}:${endMinutes}`;
          }
          
          return `${startPart} ~ ${endPart}`;
        } catch (error) {
          console.error('格式化时间范围失败:', error, startStr, endStr);
          return `${formatDateTime(startStr)} ~ ${formatDateTime(endStr)}`;
        }
      };

      // 确保 data 是数组
      const safeData = Array.isArray(data) ? data : [];
      
      const overtimeList = safeData.map(ot => {
        // 确保 ot 不是 null
        if (!ot || typeof ot !== 'object') {
          return null;
        }
        return {
          ...ot,
          timeRange: formatTimeRange(ot.start_time, ot.end_time), // 使用智能格式化时间范围
          startTime: formatDateTime(ot.start_time),
          endTime: formatDateTime(ot.end_time)
        };
      }).filter(item => item !== null);

      this.setData({ 
        overtimeList,
        overtimeCount: safeData.length
      });
    } catch (error) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      console.error('加载待审批加班失败:', error);
    } finally {
      wx.hideLoading();
    }
  },

  // 查看请假详情
  async viewLeaveDetail(e) {
    const leaveId = e.currentTarget.dataset.id;
    
    wx.showLoading({ title: '加载中...' });
    
    try {
      const leave = await app.request({
        url: `/leave/${leaveId}`
      });
      
      // 格式化日期时间
      const formatDateTime = (dateStr) => {
        if (!dateStr) return '-';
        try {
          const date = new Date(dateStr);
          // 手动格式化日期时间为中文格式，避免安卓微信显示英文
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const day = date.getDate();
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${year}年${month}月${day}日 ${hours}:${minutes}`;
        } catch (error) {
          console.error('格式化日期时间失败:', error, dateStr);
          return dateStr;
        }
      };
      
      const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
          const date = new Date(dateStr);
          // 手动格式化日期为中文格式，避免安卓微信显示英文
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const day = date.getDate();
          return `${year}年${month}月${day}日`;
        } catch (error) {
          console.error('格式化日期失败:', error, dateStr);
          return dateStr;
        }
      };
      
      const getStatusName = (status) => {
        const statusMap = {
          'pending': '待审批',
          'dept_approved': '部门已批',
          'vp_approved': '副总已批',
          'approved': '已批准',
          'rejected': '已拒绝',
          'cancelled': '已取消'
        };
        return statusMap[status] || status;
      };
      
      // 构建详情内容
      let content = `状态: ${getStatusName(leave.status)}\n`;
      content += `申请人: ${leave.applicant_name || `用户${leave.user_id}`}\n`;
      content += `开始日期: ${formatDate(leave.start_date)}\n`;
      content += `结束日期: ${formatDate(leave.end_date)}\n`;
      content += `天数: ${leave.days}天\n`;
      content += `原因: ${leave.reason}\n`;
      
      // 添加审批信息
      if (leave.dept_approver_name) {
        content += `\n部门审批:\n`;
        content += `审批人: ${leave.dept_approver_name}\n`;
        content += `时间: ${leave.dept_approved_at ? formatDateTime(leave.dept_approved_at) : '-'}\n`;
        content += `意见: ${leave.dept_comment || '无'}\n`;
      }
      
      if (leave.vp_approver_name) {
        content += `\n副总审批:\n`;
        content += `审批人: ${leave.vp_approver_name}\n`;
        content += `时间: ${leave.vp_approved_at ? formatDateTime(leave.vp_approved_at) : '-'}\n`;
        content += `意见: ${leave.vp_comment || '无'}\n`;
      }
      
      if (leave.gm_approver_name) {
        content += `\n总经理审批:\n`;
        content += `审批人: ${leave.gm_approver_name}\n`;
        content += `时间: ${leave.gm_approved_at ? formatDateTime(leave.gm_approved_at) : '-'}\n`;
        content += `意见: ${leave.gm_comment || '无'}\n`;
      }
      
      wx.hideLoading();
      
      // 显示详情弹窗
      this.setData({
        showDetailModal: true,
        detailTitle: '请假详情',
        detailType: 'leave',
        detailData: {
          status: getStatusName(leave.status),
          applicant: leave.applicant_name || `用户${leave.user_id}`,
          timeRange: formatTimeRange(leave.start_date, leave.end_date), // 使用智能格式化时间范围
          startDate: formatDate(leave.start_date),
          endDate: formatDate(leave.end_date),
          days: `${leave.days}天`,
          reason: leave.reason,
          leaveType: leave.leave_type_name || '普通请假',
          deptApprover: leave.dept_approver_name,
          deptApprovedAt: leave.dept_approved_at ? formatDateTime(leave.dept_approved_at) : null,
          deptComment: leave.dept_comment,
          vpApprover: leave.vp_approver_name,
          vpApprovedAt: leave.vp_approved_at ? formatDateTime(leave.vp_approved_at) : null,
          vpComment: leave.vp_comment,
          gmApprover: leave.gm_approver_name,
          gmApprovedAt: leave.gm_approved_at ? formatDateTime(leave.gm_approved_at) : null,
          gmComment: leave.gm_comment
        }
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '加载详情失败',
        icon: 'none'
      });
      console.error('加载请假详情失败:', error);
    }
  },

  // 查看加班详情
  async viewOvertimeDetail(e) {
    const overtimeId = e.currentTarget.dataset.id;
    
    wx.showLoading({ title: '加载中...' });
    
    try {
      const overtime = await app.request({
        url: `/overtime/${overtimeId}`
      });
      
      // 格式化日期时间
      const formatDateTime = (dateStr) => {
        if (!dateStr) return '-';
        try {
          const date = new Date(dateStr);
          // 手动格式化日期时间为中文格式，避免安卓微信显示英文
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const day = date.getDate();
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${year}年${month}月${day}日 ${hours}:${minutes}`;
        } catch (error) {
          console.error('格式化日期时间失败:', error, dateStr);
          return dateStr;
        }
      };

      // 格式化时间范围（智能省略重复的年份和日期）
      const formatTimeRange = (startStr, endStr) => {
        if (!startStr || !endStr) return '';
        try {
          // 处理时区问题：确保日期字符串格式正确
          const normalizeDateStr = (dateStr) => {
            if (!dateStr) return '';
            // 如果包含 'T'，直接使用；否则添加 'T00:00:00'
            if (dateStr.includes('T')) {
              return dateStr.split('.')[0]; // 移除毫秒部分
            }
            return dateStr + 'T00:00:00';
          };
          
          const normalizedStartStr = normalizeDateStr(startStr);
          const normalizedEndStr = normalizeDateStr(endStr);
          
          const startDate = new Date(normalizedStartStr);
          const endDate = new Date(normalizedEndStr);
          
          // 使用本地方法获取日期组件
          const startYear = startDate.getFullYear();
          const startMonth = startDate.getMonth() + 1;
          const startDay = startDate.getDate();
          const startHours = String(startDate.getHours()).padStart(2, '0');
          const startMinutes = String(startDate.getMinutes()).padStart(2, '0');
          
          const endYear = endDate.getFullYear();
          const endMonth = endDate.getMonth() + 1;
          const endDay = endDate.getDate();
          const endHours = String(endDate.getHours()).padStart(2, '0');
          const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
          
          let startPart = `${startYear}/${String(startMonth).padStart(2, '0')}/${String(startDay).padStart(2, '0')} ${startHours}:${startMinutes}`;
          let endPart = '';
          
          // 如果年份相同
          if (startYear === endYear) {
            // 如果日期也相同
            if (startMonth === endMonth && startDay === endDay) {
              // 只显示时间
              endPart = `${endHours}:${endMinutes}`;
            } else {
              // 只省略年份
              endPart = `${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')} ${endHours}:${endMinutes}`;
            }
          } else {
            // 年份不同，显示完整日期时间
            endPart = `${endYear}/${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')} ${endHours}:${endMinutes}`;
          }
          
          return `${startPart} ~ ${endPart}`;
        } catch (error) {
          console.error('格式化时间范围失败:', error, startStr, endStr);
          return `${formatDateTime(startStr)} ~ ${formatDateTime(endStr)}`;
        }
      };
      
      const getStatusName = (status) => {
        const statusMap = {
          'pending': '待审批',
          'approved': '已批准',
          'rejected': '已拒绝',
          'cancelled': '已取消'
        };
        return statusMap[status] || status;
      };
      
      // 构建详情内容
      let content = `状态: ${getStatusName(overtime.status)}\n`;
      content += `申请人: ${overtime.applicant_name || `用户${overtime.user_id}`}\n`;
      content += `开始时间: ${formatDateTime(overtime.start_time)}\n`;
      content += `结束时间: ${formatDateTime(overtime.end_time)}\n`;
      content += `天数: ${overtime.days}天\n`;
      content += `原因: ${overtime.reason}\n`;
      
      // 添加审批信息
      if (overtime.approver_name) {
        content += `\n审批信息:\n`;
        content += `审批人: ${overtime.approver_name}\n`;
        content += `时间: ${overtime.approved_at ? formatDateTime(overtime.approved_at) : '-'}\n`;
        content += `意见: ${overtime.comment || '无'}\n`;
      }
      
      wx.hideLoading();
      
      // 显示详情弹窗
      this.setData({
        showDetailModal: true,
        detailTitle: '加班详情',
        detailType: 'overtime',
        detailData: {
          status: getStatusName(overtime.status),
          applicant: overtime.applicant_name || `用户${overtime.user_id}`,
          timeRange: formatTimeRange(overtime.start_time, overtime.end_time), // 使用智能格式化时间范围
          startTime: formatDateTime(overtime.start_time),
          endTime: formatDateTime(overtime.end_time),
          days: `${overtime.days}天`,
          reason: overtime.reason,
          approver: overtime.approver_name,
          approvedAt: overtime.approved_at ? formatDateTime(overtime.approved_at) : null,
          comment: overtime.comment
        }
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '加载详情失败',
        icon: 'none'
      });
      console.error('加载加班详情失败:', error);
    }
  },

  // 审批请假
  async approveLeave(e) {
    const { id, approved } = e.currentTarget.dataset;
    
    const title = approved ? '批准请假申请' : '拒绝请假申请';
    const placeholder = approved ? '请输入批准意见（可选）' : '请输入拒绝理由（必填）';
    
    wx.showModal({
      title: title,
      editable: true,
      placeholderText: placeholder,
      success: async (res) => {
        if (res.confirm) {
          const comment = res.content || '';
          
          if (!approved && !comment.trim()) {
            wx.showToast({
              title: '拒绝时必须填写理由',
              icon: 'none'
            });
            return;
          }

          wx.showLoading({ title: '处理中...' });
          
          try {
            await app.request({
              url: `/leave/${id}/approve`,
              method: 'POST',
              data: {
                approved: approved,
                comment: comment
              }
            });

            wx.showToast({
              title: approved ? '已批准' : '已拒绝',
              icon: 'success'
            });

            this.loadPendingLeaves();
            this.loadPendingCount();
          } catch (error) {
            wx.showToast({
              title: error.message || '操作失败',
              icon: 'none'
            });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 审批加班
  async approveOvertime(e) {
    const { id, approved } = e.currentTarget.dataset;
    
    const title = approved ? '批准加班申请' : '拒绝加班申请';
    const placeholder = approved ? '请输入批准意见（可选）' : '请输入拒绝理由（必填）';
    
    wx.showModal({
      title: title,
      editable: true,
      placeholderText: placeholder,
      success: async (res) => {
        if (res.confirm) {
          const comment = res.content || '';
          
          if (!approved && !comment.trim()) {
            wx.showToast({
              title: '拒绝时必须填写理由',
              icon: 'none'
            });
            return;
          }

          wx.showLoading({ title: '处理中...' });
          
          try {
            await app.request({
              url: `/overtime/${id}/approve`,
              method: 'POST',
              data: {
                approved: approved,
                comment: comment
              }
            });

            wx.showToast({
              title: approved ? '已批准' : '已拒绝',
              icon: 'success'
            });

            this.loadPendingOvertimes();
            this.loadPendingCount();
          } catch (error) {
            wx.showToast({
              title: error.message || '操作失败',
              icon: 'none'
            });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 关闭详情弹窗
  closeDetailModal() {
    this.setData({
      showDetailModal: false,
      detailTitle: '',
      detailData: null,
      detailType: ''
    });
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 空函数，用于阻止点击弹窗内容时关闭弹窗
  }
});

