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
    this.checkApprovalPermission();
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
      leaveList: this.data.leaveList || [],
      overtimeList: this.data.overtimeList || [],
      leaveCount: this.data.leaveCount || 0,
      overtimeCount: this.data.overtimeCount || 0
    });
    
    if (this.data.hasApprovalPermission) {
      this.loadPendingCount();
      this.loadPendingLeaves();
    }
  },

  // 检查审批权限
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
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
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
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
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
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
      };
      
      const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
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
          startDate: formatDate(leave.start_date),
          endDate: formatDate(leave.end_date),
          days: `${leave.days}天`,
          reason: leave.reason,
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
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
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

