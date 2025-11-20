// pages/overtime/apply/apply.js
const app = getApp();

Page({
  data: {
    overtimeType: 'single', // 'single' 单日 或 'multi' 多日，默认为单日
    overtimeTypeIndex: 0,
    overtimeTypeText: '单日',
    
    // 加班类型相关
    overtimeClassOptions: [
      { value: 'active', name: '主动加班' },
      { value: 'passive', name: '被动加班' }
    ],
    overtimeClassIndex: -1,  // 默认不选中任何选项
    selectedOvertimeClass: '',
    selectedOvertimeClassName: '',
    
    // 单日相关
    date: '',
    startTimeNodeIndex: -1,
    startTimeNodeLabel: '',
    startTimeNode: '',
    endTimeNodeIndex: -1,
    endTimeNodeLabel: '',
    endTimeNode: '',
    
    // 多日相关
    startDate: '',
    startDateTimeNodeIndex: -1,
    startDateTimeNodeLabel: '',
    startDateTimeNode: '',
    endDate: '',
    endDateTimeNodeIndex: -1,
    endDateTimeNodeLabel: '',
    endDateTimeNode: '',
    
    // 起点时间节点选项（只可选：9:00, 14:00, 17:30）
    startTimeNodes: [
      { value: '09:00', label: '09:00' },
      { value: '14:00', label: '14:00' },
      { value: '17:30', label: '17:30' }
    ],
    
    // 终点时间节点选项（可选：12:00, 17:30, 20:00, 22:00）
    endTimeNodes: [
      { value: '12:00', label: '12:00' },
      { value: '17:30', label: '17:30' },
      { value: '20:00', label: '20:00' },
      { value: '22:00', label: '22:00' }
    ],
    
    calculatedDays: '0', // 计算出的加班天数（显示值）
    autoCalculatedDays: '0', // 自动计算的加班天数（用于显示）
    manualDays: '', // 手动调节的加班天数（多日加班）
    useManualDays: false, // 是否使用手动调节的天数
    reason: '',
    approverOptions: [{ id: '', name: '系统自动分配' }],
    approverIndex: 0,
    assignedApproverId: ''
  },

  async onLoad() {
    // 设置默认日期为今天（使用本地时间）
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    
    this.setData({
      date: today,
      startDate: today,
      endDate: today
    });
    
    // 默认显示单日表单并设置默认节点
    this.setDefaultSingleNodes();
    this.setDefaultMultiNodes();
    
    // 由于默认选择单日，计算单日加班天数
    this.calculateSingleDay();
    
    // 加载审批人列表
    await this.loadApprovers();
  },

  // 加载审批人列表（仅副总需要）
  async loadApprovers() {
    try {
      const userRes = await app.request({
        url: '/users/me',
        method: 'GET'
      });
      
      const currentUser = userRes.data || userRes;
      const userRole = currentUser.role;
      const isVicePresident = userRole === 'vice_president';
      
      if (!isVicePresident) {
        this.setData({
          approverOptions: [{ id: '', name: '系统自动分配' }],
          showApproverSelector: false
        });
        return;
      }
      
      const res = await app.request({
        url: '/users/approvers',
        method: 'GET'
      });
      
      const approvers = res.data || res;
      const vps = approvers.filter(u => u.role === 'vice_president');
      
      const defaultVpIndex = vps.findIndex(vp => vp.id === currentUser.id);
      const approverOptions = [{ id: '', name: '默认本人审批' }, ...vps.map(vp => ({ id: vp.id, name: vp.real_name }))];
      
      this.setData({
        approverOptions,
        approverIndex: defaultVpIndex >= 0 ? defaultVpIndex + 1 : 0,
        assignedApproverId: defaultVpIndex >= 0 ? currentUser.id : '',
        showApproverSelector: true
      });
    } catch (error) {
      console.error('加载审批人列表失败:', error);
    }
  },

  // 审批人选择改变
  onApproverChange(e) {
    const index = parseInt(e.detail.value);
    const approver = this.data.approverOptions[index];
    this.setData({
      approverIndex: index,
      assignedApproverId: approver.id || ''
    });
  },

  // 加班类型选择改变
  onOvertimeClassChange(e) {
    const index = parseInt(e.detail.value);
    const selected = this.data.overtimeClassOptions[index];
    this.setData({
      overtimeClassIndex: index,
      selectedOvertimeClass: selected.value,
      selectedOvertimeClassName: selected.name
    });
  },

  // 加班类型改变
  onTypeChange(e) {
    const index = parseInt(e.detail.value);
    const types = ['single', 'multi'];
    const typeTexts = ['单日', '多日'];
    const type = types[index];
    
    this.setData({
      overtimeType: type,
      overtimeTypeIndex: index,
      overtimeTypeText: typeTexts[index],
      calculatedDays: '0'
    }, () => {
      if (type === 'single') {
        this.setDefaultSingleNodes();
      } else if (type === 'multi') {
        this.setDefaultMultiNodes();
      }
    });
  },

  // 单日：日期改变
  onDateChange(e) {
    this.setData({ date: e.detail.value });
    this.calculateSingleDay();
  },

  // 单日：开始时间节点改变
  onStartTimeNodeChange(e) {
    const index = parseInt(e.detail.value);
    const node = this.data.startTimeNodes[index];
    this.setData({
      startTimeNodeIndex: index,
      startTimeNodeLabel: node.label,
      startTimeNode: node.value
    });
    this.calculateSingleDay();
  },

  // 单日：结束时间节点改变
  onEndTimeNodeChange(e) {
    const index = parseInt(e.detail.value);
    const node = this.data.endTimeNodes[index];
    this.setData({
      endTimeNodeIndex: index,
      endTimeNodeLabel: node.label,
      endTimeNode: node.value
    });
    this.calculateSingleDay();
  },

  // 多日：开始日期改变
  onStartDateChange(e) {
    const newStartDate = e.detail.value;
    this.setData({
      startDate: newStartDate,
      endDate: newStartDate  // 结束日期自动调整为相同日期
    });
    this.calculateMultiDay();
  },

  // 多日：开始日期时间节点改变
  onStartDateTimeNodeChange(e) {
    const index = parseInt(e.detail.value);
    const node = this.data.startTimeNodes[index];
    this.setData({
      startDateTimeNodeIndex: index,
      startDateTimeNodeLabel: node.label,
      startDateTimeNode: node.value
    });
    this.calculateMultiDay();
  },

  // 多日：结束日期改变
  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
    this.calculateMultiDay();
  },

  // 多日：结束日期时间节点改变
  onEndDateTimeNodeChange(e) {
    const index = parseInt(e.detail.value);
    const node = this.data.endTimeNodes[index];
    this.setData({
      endDateTimeNodeIndex: index,
      endDateTimeNodeLabel: node.label,
      endDateTimeNode: node.value
    });
    this.calculateMultiDay();
  },

  // 原因改变
  onReasonInput(e) {
    this.setData({ reason: e.detail.value });
  },

  // 切换是否使用手动调节天数
  onUseManualDaysChange(e) {
    const useManual = e.detail.value;
    this.setData({ 
      useManualDays: useManual,
      manualDays: useManual ? this.data.calculatedDays : ''
    });
    if (useManual) {
      // 如果启用手动调节，使用当前计算值作为初始值
      this.calculateMultiDay();
    } else {
      // 如果禁用手动调节，重新计算
      this.calculateMultiDay();
    }
  },

  // 手动调节天数改变
  onManualDaysInput(e) {
    const value = e.detail.value;
    // 只允许数字和小数点
    let numValue = value.replace(/[^\d.]/g, '');
    
    // 如果输入了值，验证是否符合规则（整数或x.5）
    if (numValue && numValue !== '') {
      const num = parseFloat(numValue);
      if (!isNaN(num) && num > 0) {
        // 检查是否为整数或x.5（即0.5的倍数）
        const remainder = num % 0.5;
        if (remainder !== 0 && Math.abs(remainder - 0.5) > 0.001) {
          // 不是0.5的倍数，自动修正为最接近的0.5倍数
          const rounded = Math.round(num * 2) / 2;
          numValue = rounded.toFixed(1);
          wx.showToast({
            title: '加班天数只能是整数或x.5天，已自动修正',
            icon: 'none',
            duration: 2000
          });
        }
      }
    }
    
    this.setData({ manualDays: numValue }, () => {
      if (this.data.useManualDays) {
        // 如果启用手动调节，更新显示的天数
        this.setData({ calculatedDays: parseFloat(numValue || '0').toFixed(1) });
      }
    });
  },

  setDefaultSingleNodes() {
    const updates = {};
    const { startTimeNodes, endTimeNodes, startTimeNodeIndex, endTimeNodeIndex } = this.data;
    
    if (startTimeNodeIndex < 0 && startTimeNodes.length > 0) {
      updates.startTimeNodeIndex = 0;
      updates.startTimeNodeLabel = startTimeNodes[0].label;
      updates.startTimeNode = startTimeNodes[0].value;
    }
    
    if (endTimeNodeIndex < 0 && endTimeNodes.length > 0) {
      const defaultEndIndex = endTimeNodes.findIndex(node => node.value === '17:30');
      const endIndex = defaultEndIndex >= 0 ? defaultEndIndex : 0;
      updates.endTimeNodeIndex = endIndex;
      updates.endTimeNodeLabel = endTimeNodes[endIndex].label;
      updates.endTimeNode = endTimeNodes[endIndex].value;
    }
    
    if (Object.keys(updates).length > 0) {
      this.setData(updates, () => {
        if (this.data.overtimeType === 'single') {
          this.calculateSingleDay();
        }
      });
    }
  },

  setDefaultMultiNodes() {
    const updates = {};
    const { startTimeNodes, endTimeNodes, startDateTimeNodeIndex, endDateTimeNodeIndex } = this.data;
    
    if (startDateTimeNodeIndex < 0 && startTimeNodes.length > 0) {
      const defaultStartIndex = startTimeNodes.findIndex(node => node.value === '09:00');
      const startIndex = defaultStartIndex >= 0 ? defaultStartIndex : 0;
      updates.startDateTimeNodeIndex = startIndex;
      updates.startDateTimeNodeLabel = startTimeNodes[startIndex].label;
      updates.startDateTimeNode = startTimeNodes[startIndex].value;
    }
    
    if (endDateTimeNodeIndex < 0 && endTimeNodes.length > 0) {
      const defaultEndIndex = endTimeNodes.findIndex(node => node.value === '17:30');
      const endIndex = defaultEndIndex >= 0 ? defaultEndIndex : 0;
      updates.endDateTimeNodeIndex = endIndex;
      updates.endDateTimeNodeLabel = endTimeNodes[endIndex].label;
      updates.endDateTimeNode = endTimeNodes[endIndex].value;
    }
    
    if (Object.keys(updates).length > 0) {
      this.setData(updates, () => {
        if (this.data.overtimeType === 'multi') {
          this.calculateMultiDay();
        }
      });
    }
  },

  // 计算单日加班天数
  calculateSingleDay() {
    const { date, startTimeNode, endTimeNode } = this.data;
    
    if (!date || !startTimeNode || !endTimeNode) {
      this.setData({ calculatedDays: '0' });
      return;
    }

    const days = this.calculateOvertimeDays(date, startTimeNode, date, endTimeNode);
    this.setData({ calculatedDays: days.toString() });
  },

  // 计算多日加班天数
  calculateMultiDay() {
    const { startDate, startDateTimeNode, endDate, endDateTimeNode, useManualDays, manualDays } = this.data;
    
    if (!startDate || !startDateTimeNode || !endDate || !endDateTimeNode) {
      this.setData({ calculatedDays: '0' });
      return;
    }

    // 确保日期格式正确（YYYY-MM-DD）
    const normalizedStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    const normalizedEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;
    
    const startDateObj = new Date(normalizedStartDate + 'T00:00:00');
    const endDateObj = new Date(normalizedEndDate + 'T00:00:00');
    
    if (endDateObj < startDateObj) {
      this.setData({ calculatedDays: '0', autoCalculatedDays: '0' });
      return;
    }

    // 先计算自动计算的天数
    const autoCalculatedDays = this.calculateOvertimeDays(normalizedStartDate, startDateTimeNode, normalizedEndDate, endDateTimeNode);
    
    // 如果使用手动调节的天数，显示手动输入的值
    if (useManualDays && manualDays && parseFloat(manualDays) > 0) {
      this.setData({ 
        calculatedDays: parseFloat(manualDays).toFixed(1),
        autoCalculatedDays: autoCalculatedDays.toFixed(1) // 保存自动计算的值用于显示
      });
    } else {
      // 否则显示自动计算的值
      this.setData({ calculatedDays: autoCalculatedDays.toFixed(1) });
    }
  },

  // 根据规则计算加班天数
  calculateOvertimeDays(startDate, startTime, endDate, endTime) {
    // 定义时间段规则
    const morningStart = '09:00';
    const morningEnd = '12:00';
    const afternoonStart = '14:00';
    const afternoonEnd = '17:30';
    const eveningShortStart = '17:30';
    const eveningShortEnd = '20:00';
    const eveningLongStart = '17:30';
    const eveningLongEnd = '22:00';

    const startDateTime = new Date(`${startDate}T${startTime}:00`);
    const endDateTime = new Date(`${endDate}T${endTime}:00`);

    if (endDateTime <= startDateTime) {
      return 0;
    }

    // 确保日期格式正确（YYYY-MM-DD）
    const normalizedStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    const normalizedEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;
    
    // 如果是同一天
    if (normalizedStartDate === normalizedEndDate) {
      return this.calculateSingleDayOvertime(startTime, endTime);
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
        // 9点开始算加班的，起始日算一天
        // 14点开始算加班的，算半天
        // 17:30开始算加班的，也算半天
        let firstDayDays = 0;
        if (startTime === '09:00') {
          firstDayDays = 1.0;
        } else if (startTime === '14:00') {
          firstDayDays = 0.5;
        } else if (startTime === '17:30') {
          firstDayDays = 0.5;
        }
        totalDays += firstDayDays;
      } else if (currentDateStr === endDateStr) {
        // 结尾日：根据结束时间节点计算
        // 到12点的算半天
        // 到5点半（17:30）的算一天
        // 到20点的算1.5天
        // 到22点的算2天
        let lastDayDays = 0;
        if (endTime === '12:00') {
          lastDayDays = 0.5;
        } else if (endTime === '17:30') {
          lastDayDays = 1.0;
        } else if (endTime === '20:00') {
          lastDayDays = 1.5;
        } else if (endTime === '22:00') {
          lastDayDays = 2.0;
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

  // 计算单一天的加班天数
  calculateSingleDayOvertime(startTime, endTime) {
    // 定义时间段
    const morningStart = { hour: 9, minute: 0 };
    const morningEnd = { hour: 12, minute: 0 };
    const afternoonStart = { hour: 14, minute: 0 };
    const afternoonEnd = { hour: 17, minute: 30 };
    const eveningFirstStart = { hour: 17, minute: 30 };
    const eveningFirstEnd = { hour: 20, minute: 0 };
    const eveningSecondStart = { hour: 20, minute: 0 };
    const eveningSecondEnd = { hour: 22, minute: 0 };

    // 解析时间
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (endMinutes <= startMinutes) {
      return 0;
    }

    let days = 0;

    // 检查上午时段（09:00-12:00）
    const morningStartMin = morningStart.hour * 60 + morningStart.minute;
    const morningEndMin = morningEnd.hour * 60 + morningEnd.minute;
    const morningOverlap = this.calculateTimeOverlap(
      startMinutes, endMinutes, morningStartMin, morningEndMin
    );
    if (morningOverlap >= 120) { // 2小时 = 120分钟
      days += 0.5;
    }

    // 检查下午时段（14:00-17:30）
    const afternoonStartMin = afternoonStart.hour * 60 + afternoonStart.minute;
    const afternoonEndMin = afternoonEnd.hour * 60 + afternoonEnd.minute;
    const afternoonOverlap = this.calculateTimeOverlap(
      startMinutes, endMinutes, afternoonStartMin, afternoonEndMin
    );
    if (afternoonOverlap >= 150) { // 2.5小时 = 150分钟
      days += 0.5;
    }

    // 检查晚上第一段（17:30-20:00）
    const eveningFirstStartMin = eveningFirstStart.hour * 60 + eveningFirstStart.minute;
    const eveningFirstEndMin = eveningFirstEnd.hour * 60 + eveningFirstEnd.minute;
    const eveningFirstOverlap = this.calculateTimeOverlap(
      startMinutes, endMinutes, eveningFirstStartMin, eveningFirstEndMin
    );
    if (eveningFirstOverlap >= 90) { // 1.5小时 = 90分钟
      days += 0.5;
    }

    // 检查晚上第二段（20:00-22:00）
    const eveningSecondStartMin = eveningSecondStart.hour * 60 + eveningSecondStart.minute;
    const eveningSecondEndMin = eveningSecondEnd.hour * 60 + eveningSecondEnd.minute;
    const eveningSecondOverlap = this.calculateTimeOverlap(
      startMinutes, endMinutes, eveningSecondStartMin, eveningSecondEndMin
    );
    if (eveningSecondOverlap >= 90) { // 1.5小时 = 90分钟
      days += 0.5;
    }

    return Math.round(days * 10) / 10;
  },

  // 计算时间重叠（分钟）
  calculateTimeOverlap(start1, end1, start2, end2) {
    const overlapStart = Math.max(start1, start2);
    const overlapEnd = Math.min(end1, end2);
    return Math.max(0, overlapEnd - overlapStart);
  },

  // 获取实际开始时间（如果早于09:00，则从09:00开始）
  getActualStartTime(startTime) {
    const [hour, minute] = startTime.split(':').map(Number);
    const startMinutes = hour * 60 + minute;
    const earliestMinutes = 9 * 60; // 09:00
    
    if (startMinutes < earliestMinutes) {
      return '09:00';
    }
    return startTime;
  },

  // 请求订阅消息授权
  requestSubscribeMessage() {
    return app.requestSubscribeMessage();
  },

  // 提交申请
  async submitForm() {
    const { overtimeType, calculatedDays, reason, useManualDays, manualDays, selectedOvertimeClass } = this.data;

    if (!overtimeType || !reason || !selectedOvertimeClass) {
      wx.showToast({
        title: '请填写所有必填项',
        icon: 'none'
      });
      return;
    }

    // 确定最终使用的天数
    const finalDays = useManualDays && manualDays ? parseFloat(manualDays) : parseFloat(calculatedDays);

    if (finalDays <= 0) {
      wx.showToast({
        title: '请选择有效的时间节点或输入有效的加班天数',
        icon: 'none'
      });
      return;
    }

    // 提交申请前，确保已授权"审批结果通知"模板
    const authResult = await this.requestSubscribeMessage();
    
    // 如果用户拒绝了授权，提示但不阻止提交
    if (authResult && authResult.rejected > 0) {
      wx.showModal({
        title: '授权提示',
        content: '您拒绝了订阅消息授权，将无法收到审批结果通知。\n\n建议允许授权，以便及时了解审批状态。',
        showCancel: false,
        confirmText: '知道了'
      });
    }

    wx.showLoading({ title: '提交中...' });

    try {
      let startDateTime, endDateTime, hours;

      if (overtimeType === 'single') {
        const { date, startTimeNode, endTimeNode } = this.data;
        
        if (!date || !startTimeNode || !endTimeNode) {
          wx.showToast({
            title: '请填写完整的单日加班信息',
            icon: 'none'
          });
          return;
        }

        startDateTime = `${date}T${startTimeNode}:00`;
        endDateTime = `${date}T${endTimeNode}:00`;
      } else {
        const { startDate, startDateTimeNode, endDate, endDateTimeNode } = this.data;
        
        if (!startDate || !startDateTimeNode || !endDate || !endDateTimeNode) {
          wx.showToast({
            title: '请填写完整的多日加班信息',
            icon: 'none'
          });
          return;
        }

        startDateTime = `${startDate}T${startDateTimeNode}:00`;
        endDateTime = `${endDate}T${endDateTimeNode}:00`;
      }

      // 计算小时数
      const start = new Date(startDateTime);
      const end = new Date(endDateTime);
      
      // 验证日期是否有效
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        wx.showToast({
          title: '日期时间格式错误，请重新选择',
          icon: 'none'
        });
        return;
      }
      
      hours = (end - start) / (1000 * 60 * 60);
      
      // 验证小时数和天数
      if (isNaN(hours) || hours < 0) {
        wx.showToast({
          title: '计算小时数失败，请检查时间节点',
          icon: 'none'
        });
        return;
      }
      
      // 确定最终使用的天数（手动调节或自动计算）
      let finalDays;
      if (useManualDays && manualDays) {
        finalDays = parseFloat(manualDays);
        // 验证手动输入的天数是否符合规则（整数或x.5）
        if (isNaN(finalDays) || finalDays <= 0) {
          wx.showToast({
            title: '请输入有效的加班天数',
            icon: 'none'
          });
          return;
        }
        const remainder = finalDays % 0.5;
        if (remainder !== 0 && Math.abs(remainder - 0.5) > 0.001) {
          wx.showToast({
            title: '加班天数只能是整数或x.5天（如：1、1.5、2、2.5）',
            icon: 'none'
          });
          return;
        }
      } else {
        finalDays = parseFloat(calculatedDays);
        if (isNaN(finalDays) || finalDays <= 0) {
          wx.showToast({
            title: '请选择有效的时间节点',
            icon: 'none'
          });
          return;
        }
      }
      
      // 验证原因
      if (!reason || reason.trim() === '') {
        wx.showToast({
          title: '请填写加班原因',
          icon: 'none'
        });
        return;
      }
      
      // 确保日期时间格式正确（ISO 8601格式）
      const formatDateTime = (dateTimeStr) => {
        // 如果已经是正确的格式，直接返回
        if (dateTimeStr.includes('T') && dateTimeStr.length >= 16) {
          return dateTimeStr;
        }
        // 否则尝试修复格式
        const date = new Date(dateTimeStr);
        if (isNaN(date.getTime())) {
          return dateTimeStr; // 如果无法解析，返回原值
        }
        // 格式化为 ISO 8601 格式
        return date.toISOString().slice(0, 19); // 移除毫秒和时区
      };

      const requestData = {
        start_time: formatDateTime(startDateTime),
        end_time: formatDateTime(endDateTime),
        hours: parseFloat(hours.toFixed(2)), // 保留两位小数
        days: parseFloat(finalDays.toFixed(1)), // 保留一位小数
        reason: reason.trim(),
        overtime_type: this.data.selectedOvertimeClass  // 新增加班类型字段
      };

      if (this.data.assignedApproverId) {
        const approverId = parseInt(this.data.assignedApproverId);
        if (!isNaN(approverId)) {
          requestData.assigned_approver_id = approverId;
        }
      }

      await app.request({
        url: '/overtime/',
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
