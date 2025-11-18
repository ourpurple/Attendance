// pages/leave/apply/apply.js
const app = getApp();

Page({
  data: {
    startDate: '',
    startTimeNode: '09:00', // 默认9:00
    startTimeNodeIndex: 0,
    endDate: '',
    endTimeNode: '17:30', // 默认17:30
    endTimeNodeIndex: 1,
    calculatedDays: '0', // 计算出的请假天数
    reason: '',
    // 开始时间节点选项（9:00默认、14:00）
    startTimeNodes: [
      { value: '09:00', label: '09:00' },
      { value: '14:00', label: '14:00' }
    ],
    // 结束时间节点选项（12:00、17:30默认）
    endTimeNodes: [
      { value: '12:00', label: '12:00' },
      { value: '17:30', label: '17:30' }
    ],
    vpOptions: [{ id: '', name: '系统自动分配' }],
    gmOptions: [{ id: '', name: '系统自动分配' }],
    vpIndex: 0,
    gmIndex: 0,
    assignedVpId: '',
    assignedGmId: '',
    showVpSelector: false,
    showGmSelector: false,
    leaveTypes: [],
    leaveTypeIndex: 0,
    selectedLeaveTypeId: ''
  },

  async onLoad() {
    // 设置默认日期为今天（使用本地时间）
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    this.setData({
      startDate: today,
      endDate: today
    });
    
    const hasTypes = await this.loadLeaveTypes();
    if (!hasTypes) {
      return;
    }
    
    // 加载审批人列表
    await this.loadApprovers();
    
    // 初始计算请假天数
    this.calculateLeaveDays();
  },

  async loadLeaveTypes() {
    try {
      const res = await app.request({
        url: '/leave-types/',
        method: 'GET'
      });
      const types = res.data || res;
      if (!Array.isArray(types) || !types.length) {
        wx.showToast({
          title: '未配置请假类型',
          icon: 'none'
        });
        return false;
      }
      const leaveTypes = [{ id: '', name: '请选择' }, ...types];
      this.setData({
        leaveTypes,
        leaveTypeIndex: 0,
        selectedLeaveTypeId: ''
      });
      return true;
    } catch (error) {
      console.error('加载请假类型失败:', error);
      wx.showToast({
        title: '加载类型失败',
        icon: 'none'
      });
      return false;
    }
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
    this.calculateLeaveDays();
  },

  // 开始时间节点改变
  onStartTimeNodeChange(e) {
    const index = parseInt(e.detail.value);
    const node = this.data.startTimeNodes[index];
    this.setData({
      startTimeNodeIndex: index,
      startTimeNode: node.value
    });
    this.calculateLeaveDays();
  },

  // 结束日期改变
  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
    this.calculateLeaveDays();
  },

  // 结束时间节点改变
  onEndTimeNodeChange(e) {
    const index = parseInt(e.detail.value);
    const node = this.data.endTimeNodes[index];
    this.setData({
      endTimeNodeIndex: index,
      endTimeNode: node.value
    });
    this.calculateLeaveDays();
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

  // 请假类型选择
  onLeaveTypeChange(e) {
    const index = parseInt(e.detail.value);
    const type = this.data.leaveTypes[index];
    this.setData({
      leaveTypeIndex: index,
      selectedLeaveTypeId: type ? type.id : ''
    });
  },

  // 计算请假天数
  calculateLeaveDays() {
    const { startDate, startTimeNode, endDate, endTimeNode } = this.data;
    
    if (!startDate || !startTimeNode || !endDate || !endTimeNode) {
      this.setData({ calculatedDays: '0' });
      return;
    }
    
    // 确保日期格式正确
    const normalizedStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    const normalizedEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;
    
    const startDateObj = new Date(normalizedStartDate + 'T00:00:00');
    const endDateObj = new Date(normalizedEndDate + 'T00:00:00');
    
    if (endDateObj < startDateObj) {
      this.setData({ calculatedDays: '0' });
      return;
    }
    
    const days = this.calculateLeaveDaysByRules(normalizedStartDate, startTimeNode, normalizedEndDate, endTimeNode);
    this.setData({ calculatedDays: days.toFixed(1) });
    
    // 更新审批人选择器可见性
    this.updateApproverVisibility();
  },

  // 根据规则计算请假天数
  calculateLeaveDaysByRules(startDate, startTime, endDate, endTime) {
    // 确保日期格式正确（YYYY-MM-DD）
    const normalizedStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    const normalizedEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;
    
    // 如果是同一天
    if (normalizedStartDate === normalizedEndDate) {
      return this.calculateSingleDayLeave(startTime, endTime);
    }
    
    // 跨天情况
    let totalDays = 0;
    
    // 使用标准日期格式，避免时区问题
    const startDateObj = new Date(normalizedStartDate + 'T00:00:00');
    const endDateObj = new Date(normalizedEndDate + 'T00:00:00');
    const currentDate = new Date(startDateObj);
    
    // 格式化日期字符串用于比较（YYYY-MM-DD格式）
    const formatDateStr = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const startDateStr = formatDateStr(startDateObj);
    const endDateStr = formatDateStr(endDateObj);
    
    // 确保循环能正确执行
    let loopCount = 0;
    const maxLoops = 100; // 防止无限循环
    
    while (currentDate <= endDateObj && loopCount < maxLoops) {
      const currentDateStr = formatDateStr(currentDate);
      
      if (currentDateStr === startDateStr) {
        // 起始日：根据开始时间节点计算
        // 9点开始算请假的，起始日算一天
        // 14点开始算请假的，算半天
        let firstDayDays = 0;
        if (startTime === '09:00') {
          firstDayDays = 1.0;
        } else if (startTime === '14:00') {
          firstDayDays = 0.5;
        }
        totalDays += firstDayDays;
      } else if (currentDateStr === endDateStr) {
        // 结尾日：根据结束时间节点计算
        // 到12点的算半天
        // 到17:30的算一天
        let lastDayDays = 0;
        if (endTime === '12:00') {
          lastDayDays = 0.5;
        } else if (endTime === '17:30') {
          lastDayDays = 1.0;
        }
        totalDays += lastDayDays;
      } else {
        // 中间天数：每天的算一天
        totalDays += 1.0;
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      loopCount++;
    }
    
    return Math.round(totalDays * 10) / 10;
  },

  // 计算单一天的请假天数
  calculateSingleDayLeave(startTime, endTime) {
    // 单日请假规则：
    // 9:00-12:00 = 0.5天
    // 14:00-17:30 = 0.5天
    // 9:00-17:30 = 1天
    
    if (startTime === '09:00' && endTime === '12:00') {
      return 0.5;
    } else if (startTime === '14:00' && endTime === '17:30') {
      return 0.5;
    } else if (startTime === '09:00' && endTime === '17:30') {
      return 1.0;
    }
    
    return 0;
  },

  // 更新审批人选择器可见性
  updateApproverVisibility() {
    const { calculatedDays, showVpSelector } = this.data;
    const days = parseFloat(calculatedDays) || 0;
    
    // 只有副总才显示审批人选择器，且3天以上需要总经理审批
    const showGmSelector = showVpSelector && days > 3;
    this.setData({ showGmSelector });
  },

  // 提交申请
  async submitForm() {
    const { startDate, startTimeNode, endDate, endTimeNode, calculatedDays, reason, selectedLeaveTypeId } = this.data;

    if (!startDate || !startTimeNode || !endDate || !endTimeNode || !reason || !selectedLeaveTypeId) {
      wx.showToast({
        title: '请填写所有必填项',
        icon: 'none'
      });
      return;
    }

    // 确保日期格式正确
    const normalizedStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    const normalizedEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;
    
    const startDateObj = new Date(normalizedStartDate + 'T00:00:00');
    const endDateObj = new Date(normalizedEndDate + 'T00:00:00');

    if (endDateObj < startDateObj) {
      wx.showToast({
        title: '结束日期不能早于开始日期',
        icon: 'none'
      });
      return;
    }

    // 获取计算出的请假天数
    const days = parseFloat(calculatedDays) || 0;
    
    if (days <= 0) {
      wx.showToast({
        title: '请选择有效的时间节点',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    try {
      // 构建开始和结束日期时间
      const startDateTime = `${normalizedStartDate}T${startTimeNode}:00`;
      const endDateTime = `${normalizedEndDate}T${endTimeNode}:00`;
      
      const requestData = {
        start_date: startDateTime,
        end_date: endDateTime,
        days: days,
        reason: reason,
        leave_type_id: parseInt(selectedLeaveTypeId)
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

      wx.hideLoading();
      
      wx.showToast({
        title: '提交成功',
        icon: 'success'
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (error) {
      wx.hideLoading();
      
      wx.showToast({
        title: error.message || '提交失败',
        icon: 'none'
      });
    }
  }
});

