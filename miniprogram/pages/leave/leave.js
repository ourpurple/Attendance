// pages/leave/leave.js
const app = getApp();

Page({
  data: {
    leaveList: [],
    showDetailModal: false,
    detailTitle: '',
    detailData: null
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
      leaveList: this.data.leaveList || []
    });
    
    this.loadLeaveList();
  },

  // 加载请假列表
  async loadLeaveList() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const data = await app.request({
        url: '/leave/my'
      });

      const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      };

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

      const getStatusClass = (status) => {
        if (status === 'approved') return 'success';
        if (status === 'rejected') return 'danger';
        if (status === 'cancelled') return 'warning';
        return 'pending';
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
          createdAt: formatDateTime(leave.created_at),
          statusName: getStatusName(leave.status),
          statusClass: getStatusClass(leave.status),
          canCancel: ['pending', 'dept_approved', 'vp_approved'].includes(leave.status),
          canView: ['approved', 'rejected'].includes(leave.status),
          canDelete: leave.status === 'cancelled'
        };
      }).filter(item => item !== null);

      this.setData({ leaveList });
    } catch (error) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      console.error('加载请假列表失败:', error);
    } finally {
      wx.hideLoading();
    }
  },

  // 申请请假
  goToApply() {
    wx.navigateTo({
      url: '/pages/leave/apply/apply'
    });
  },

  // 撤回申请
  async cancelLeave(e) {
    const leaveId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认撤回',
      content: '确定要撤回这个请假申请吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          try {
            await app.request({
              url: `/leave/${leaveId}/cancel`,
              method: 'POST'
            });
            
            wx.showToast({
              title: '已撤回',
              icon: 'success'
            });
            
            this.loadLeaveList();
          } catch (error) {
            wx.showToast({
              title: error.message || '撤回失败',
              icon: 'none'
            });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 删除申请
  async deleteLeave(e) {
    const leaveId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个已取消的请假申请吗？删除后无法恢复！',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          try {
            await app.request({
              url: `/leave/${leaveId}/delete`,
              method: 'DELETE'
            });
            
            wx.showToast({
              title: '已删除',
              icon: 'success'
            });
            
            this.loadLeaveList();
          } catch (error) {
            wx.showToast({
              title: error.message || '删除失败',
              icon: 'none'
            });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 查看详情
  async viewDetail(e) {
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
          minute: '2-digit'
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
      
      wx.hideLoading();
      
      // 显示详情弹窗
      this.setData({
        showDetailModal: true,
        detailTitle: '请假详情',
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

  // 关闭详情弹窗
  closeDetailModal() {
    this.setData({
      showDetailModal: false,
      detailTitle: '',
      detailData: null
    });
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 空函数，用于阻止点击弹窗内容时关闭弹窗
  }
});

