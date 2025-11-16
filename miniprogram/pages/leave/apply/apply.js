// pages/leave/apply/apply.js
const app = getApp();

Page({
  data: {
    startDate: '',
    endDate: '',
    days: '',
    reason: '',
    vpOptions: [{ id: '', name: '系统自动分配' }],
    gmOptions: [{ id: '', name: '系统自动分配' }],
    vpIndex: 0,
    gmIndex: 0,
    assignedVpId: '',
    assignedGmId: '',
    showVpSelector: false,
    showGmSelector: false
  },

  async onLoad() {
    // 设置默认日期为今天
    const today = new Date().toISOString().split('T')[0];
    this.setData({
      startDate: today,
      endDate: today
    });
    
    // 加载审批人列表
    await this.loadApprovers();
  },

  // 加载审批人列表（仅副总需要）
  async loadApprovers() {
    try {
      // 获取当前用户信息
      const userRes = await app.request({
        url: '/users/me',
        method: 'GET'
      });
      
      const currentUser = userRes.data || userRes;
      const userRole = currentUser.role;
      const isVicePresident = userRole === 'vice_president';
      
      // 只有副总需要显示审批人选择器
      if (!isVicePresident) {
        this.setData({
          showVpSelector: false,
          showGmSelector: false
        });
        return;
      }
      
      const res = await app.request({
        url: '/users/approvers',
        method: 'GET'
      });
      
      const approvers = res.data || res;
      const vps = approvers.filter(u => u.role === 'vice_president');
      const gms = approvers.filter(u => u.role === 'general_manager');
      
      // 默认选择本人
      const defaultVpIndex = vps.findIndex(vp => vp.id === currentUser.id);
      const vpOptions = [{ id: '', name: '默认本人审批' }, ...vps.map(vp => ({ id: vp.id, name: vp.real_name }))];
      const gmOptions = [{ id: '', name: '系统自动分配' }, ...gms.map(gm => ({ id: gm.id, name: gm.real_name }))];
      
      this.setData({
        vpOptions,
        gmOptions,
        vpIndex: defaultVpIndex >= 0 ? defaultVpIndex + 1 : 0,
        assignedVpId: defaultVpIndex >= 0 ? currentUser.id : '',
        showVpSelector: true
      });
    } catch (error) {
      console.error('加载审批人列表失败:', error);
    }
  },

  // 开始日期改变
  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
    this.calculateDays();
  },

  // 结束日期改变
  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
    this.calculateDays();
  },

  // 天数改变
  onDaysInput(e) {
    const days = parseFloat(e.detail.value) || 0;
    // 只有副总才显示审批人选择器，且3天以上需要总经理审批
    const showGmSelector = this.data.showVpSelector && days > 3;
    this.setData({ 
      days: e.detail.value,
      showGmSelector: showGmSelector
    });
  },

  // 副总选择改变
  onVpChange(e) {
    const index = parseInt(e.detail.value);
    const vp = this.data.vpOptions[index];
    this.setData({
      vpIndex: index,
      assignedVpId: vp.id || ''
    });
  },

  // 总经理选择改变
  onGmChange(e) {
    const index = parseInt(e.detail.value);
    const gm = this.data.gmOptions[index];
    this.setData({
      gmIndex: index,
      assignedGmId: gm.id || ''
    });
  },

  // 原因改变
  onReasonInput(e) {
    this.setData({ reason: e.detail.value });
  },

  // 计算天数
  calculateDays() {
    const { startDate, endDate } = this.data;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end >= start) {
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        this.setData({ days: diffDays.toString() });
      }
    }
  },

  // 提交申请
  async submitForm() {
    const { startDate, endDate, days, reason } = this.data;

    if (!startDate || !endDate || !days || !reason) {
      wx.showToast({
        title: '请填写所有必填项',
        icon: 'none'
      });
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      wx.showToast({
        title: '结束日期不能早于开始日期',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    try {
      const requestData = {
        start_date: startDate + 'T00:00:00',
        end_date: endDate + 'T23:59:59',
        days: parseFloat(days),
        reason: reason
      };
      
      // 如果指定了审批人，添加到请求中
      if (this.data.assignedVpId) {
        requestData.assigned_vp_id = parseInt(this.data.assignedVpId);
      }
      if (this.data.assignedGmId) {
        requestData.assigned_gm_id = parseInt(this.data.assignedGmId);
      }
      
      await app.request({
        url: '/leave/',
        method: 'POST',
        data: requestData
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

