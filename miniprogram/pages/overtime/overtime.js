// pages/overtime/overtime.js
const app = getApp();

Page({
  data: {
    overtimeList: [],
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
      overtimeList: this.data.overtimeList || []
    });
    
    this.loadOvertimeList();
  },

  // 加载加班列表
  async loadOvertimeList() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const data = await app.request({
        url: '/overtime/my'
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

      const getStatusName = (status) => {
        const statusMap = {
          'pending': '待审批',
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
      
      const overtimeList = safeData.map(ot => {
        // 确保 ot 不是 null
        if (!ot || typeof ot !== 'object') {
          return null;
        }
        
        // 获取待审批人信息
        let pendingApprover = '';
        if (ot.status === 'pending') {
          pendingApprover = ot.assigned_approver_name ? `待审批: ${ot.assigned_approver_name}` : '待审批: 审批人';
        }
        
        return {
          ...ot,
          startTime: formatDateTime(ot.start_time),
          endTime: formatDateTime(ot.end_time),
          createdAt: formatDateTime(ot.created_at),
          statusName: getStatusName(ot.status),
          statusClass: getStatusClass(ot.status),
          canCancel: ot.status === 'pending',
          canView: ['approved', 'rejected'].includes(ot.status),
          canDelete: ot.status === 'cancelled',
          pendingApprover: pendingApprover
        };
      }).filter(item => item !== null);

      this.setData({ overtimeList });
    } catch (error) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      console.error('加载加班列表失败:', error);
    } finally {
      wx.hideLoading();
    }
  },

  // 申请加班
  goToApply() {
    wx.navigateTo({
      url: '/pages/overtime/apply/apply'
    });
  },

  // 撤回申请
  async cancelOvertime(e) {
    const overtimeId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认撤回',
      content: '确定要撤回这个加班申请吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          try {
            await app.request({
              url: `/overtime/${overtimeId}/cancel`,
              method: 'POST'
            });
            
            wx.showToast({
              title: '已撤回',
              icon: 'success'
            });
            
            this.loadOvertimeList();
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
  async deleteOvertime(e) {
    const overtimeId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个已取消的加班申请吗？删除后无法恢复！',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          try {
            await app.request({
              url: `/overtime/${overtimeId}/delete`,
              method: 'DELETE'
            });
            
            wx.showToast({
              title: '已删除',
              icon: 'success'
            });
            
            this.loadOvertimeList();
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
          minute: '2-digit'
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
      
      wx.hideLoading();
      
      // 显示详情弹窗
      this.setData({
        showDetailModal: true,
        detailTitle: '加班详情',
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

