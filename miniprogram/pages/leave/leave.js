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
      // 获取当前用户信息，用于判断角色
      let currentUserRole = null;
      try {
        const userRes = await app.request({
          url: '/users/me'
        });
        currentUserRole = (userRes.data || userRes).role;
      } catch (error) {
        console.error('获取用户信息失败:', error);
      }
      
      const data = await app.request({
        url: '/leave/my'
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
        
        // 获取待审批人信息
        let pendingApprover = '';
        if (leave.status === 'pending') {
          // 根据申请人角色显示不同的待审批人
          if (currentUserRole === 'vice_president') {
            // 副总申请：待副总审批
            pendingApprover = leave.pending_vp_name || leave.assigned_vp_name ? 
              `待审批: ${leave.pending_vp_name || leave.assigned_vp_name}` : '待审批: 副总';
          } else if (currentUserRole === 'general_manager') {
            // 总经理申请：待总经理审批
            pendingApprover = leave.pending_gm_name || leave.assigned_gm_name ? 
              `待审批: ${leave.pending_gm_name || leave.assigned_gm_name}` : '待审批: 总经理';
          } else {
            // 员工和部门主任申请：待部门主任审批
            pendingApprover = leave.pending_dept_head_name ? 
              `待审批: ${leave.pending_dept_head_name}` : '待审批: 部门主任';
          }
        } else if (leave.status === 'dept_approved') {
          pendingApprover = leave.assigned_vp_name ? `待审批: ${leave.assigned_vp_name}` : '待审批: 副总';
        } else if (leave.status === 'vp_approved') {
          pendingApprover = leave.assigned_gm_name ? `待审批: ${leave.assigned_gm_name}` : '待审批: 总经理';
        }
        
        return {
          ...leave,
          timeRange: formatTimeRange(leave.start_date, leave.end_date), // 使用智能格式化时间范围
          startDate: formatDate(leave.start_date),
          endDate: formatDate(leave.end_date),
          createdAt: formatDateTime(leave.created_at),
          statusName: getStatusName(leave.status),
          statusClass: getStatusClass(leave.status),
          canCancel: ['pending', 'dept_approved', 'vp_approved'].includes(leave.status),
          canView: ['approved', 'rejected'].includes(leave.status),
          canDelete: leave.status === 'cancelled',
          pendingApprover: pendingApprover
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
          timeRange: formatTimeRange(leave.start_date, leave.end_date), // 使用智能格式化时间范围
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

