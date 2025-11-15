// API基础URL - 自动检测当前访问的域名
// 如果当前页面是 http://oa.ruoshui-edu.cn/admin/index.html
// 则 API URL 为 http://oa.ruoshui-edu.cn/api
function getApiBaseUrl() {
    // 获取当前页面的协议和主机
    const protocol = window.location.protocol; // http: 或 https:
    const host = window.location.host; // hostname:port
    return `${protocol}//${host}/api`;
}

const API_BASE_URL = getApiBaseUrl();

// 全局状态
let currentUser = null;
let token = null;

// 工具函数
function getToken() {
    if (!token) {
        token = localStorage.getItem('token');
    }
    return token;
}

function setToken(newToken) {
    token = newToken;
    localStorage.setItem('token', newToken);
}

function clearToken() {
    token = null;
    localStorage.removeItem('token');
}

// API请求封装
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    const authToken = getToken();
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 401) {
            clearToken();
            showPage('login');
            throw new Error('未授权，请重新登录');
        }

        if (response.status === 204) {
            return null;
        }

        if (!response.ok) {
            try {
                const error = await response.json();
                throw new Error(error.detail || '请求失败');
            } catch (jsonError) {
                // 如果响应不是JSON格式，使用状态文本
                throw new Error(`请求失败 (${response.status}): ${response.statusText}`);
            }
        }

        return await response.json();
    } catch (error) {
        console.error('API请求错误:', error);
        throw error;
    }
}

// 页面切换
function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    if (pageName === 'login') {
        document.getElementById('login-page').classList.add('active');
    } else {
        document.getElementById('main-page').classList.add('active');
    }
}

// 内容区切换
function showContent(contentName) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${contentName}-content`).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-page="${contentName}"]`).classList.add('active');
}

// 登录
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');

    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        setToken(data.access_token);
        
        // 获取当前用户信息
        currentUser = await apiRequest('/users/me');
        
        // 检查用户角色，只有ADMIN才能登录admin后台
        // role可能是字符串 "admin" 或枚举对象，统一转换为字符串比较
        const userRole = String(currentUser.role || '').toLowerCase();
        if (userRole !== 'admin') {
            clearToken();
            errorEl.textContent = '权限不足：只有系统管理员可以登录管理后台';
            return;
        }
        
        document.getElementById('current-user-name').textContent = currentUser.real_name;

        showPage('main');
        loadDashboard();
    } catch (error) {
        errorEl.textContent = error.message;
    }
});

// 退出登录
document.getElementById('logout-btn').addEventListener('click', () => {
    clearToken();
    currentUser = null;
    showPage('login');
    document.getElementById('login-form').reset();
    document.getElementById('login-error').textContent = '';
});

// 导航切换
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        showContent(page);
        loadPageData(page);
    });
});

// 加载页面数据
function loadPageData(page) {
    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'users':
            loadUsers();
            break;
        case 'departments':
            loadDepartments();
            break;
        case 'attendance':
            loadAttendanceUserList();
            initAttendanceQuery();
            loadAttendanceRecords();
            break;
        case 'leave':
            loadLeaveUserList();
            initLeaveQuery();
            loadLeaveApplications();
            break;
        case 'overtime':
            loadOvertimeUserList();
            initOvertimeQuery();
            loadOvertimeApplications();
            break;
        case 'policies':
            loadPolicies();
            break;
        case 'holidays':
            loadHolidays();
            break;
        case 'statistics':
            // 初始化日期选择器
            toggleDateType();
            loadAllStatistics();
            break;
    }
}

// 加载仪表盘
async function loadDashboard() {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // 加载统计数据
        const users = await apiRequest('/users/');
        document.getElementById('total-users').textContent = users.length;

        const attendances = await apiRequest(`/attendance/?start_date=${today}&end_date=${today}`);
        document.getElementById('today-attendance').textContent = attendances.length;

        const leaves = await apiRequest('/leave/pending');
        document.getElementById('pending-leaves').textContent = leaves.length;

        const overtimes = await apiRequest('/overtime/pending');
        document.getElementById('pending-overtimes').textContent = overtimes.length;
    } catch (error) {
        console.error('加载仪表盘失败:', error);
    }
}

// 加载用户列表
async function loadUsers() {
    try {
        const users = await apiRequest('/users/');
        const departments = await apiRequest('/departments/');
        const deptMap = {};
        departments.forEach(d => deptMap[d.id] = d.name);

        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.real_name}</td>
                <td>${user.email || '-'}</td>
                <td>${getRoleName(user.role)}</td>
                <td>${user.department_id ? deptMap[user.department_id] : '-'}</td>
                <td><span class="status-badge ${user.is_active ? 'status-active' : 'status-inactive'}">
                    ${user.is_active ? '激活' : '禁用'}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-small btn-primary" onclick="editUser(${user.id})">编辑</button>
                        <button class="btn btn-small btn-danger" onclick="deleteUser(${user.id})">删除</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('加载用户失败:', error);
    }
}

// 加载部门列表
async function loadDepartments() {
    try {
        const departments = await apiRequest('/departments/');
        const users = await apiRequest('/users/');
        const userMap = {};
        users.forEach(u => userMap[u.id] = u.real_name);

        const tbody = document.getElementById('departments-tbody');
        tbody.innerHTML = departments.map(dept => `
            <tr>
                <td>${dept.id}</td>
                <td>${dept.name}</td>
                <td>${dept.description || '-'}</td>
                <td>${dept.head_id ? userMap[dept.head_id] : '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-small btn-primary" onclick="editDepartment(${dept.id})">编辑</button>
                        <button class="btn btn-small btn-danger" onclick="deleteDepartment(${dept.id})">删除</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('加载部门失败:', error);
    }
}

// 解析坐标字符串为经纬度
function parseLocation(locationStr) {
    if (!locationStr || locationStr === '-') return null;
    
    // 尝试解析坐标格式 "lat, lon" 或 "lat,lon"
    const parts = locationStr.split(',');
    if (parts.length === 2) {
        const lat = parseFloat(parts[0].trim());
        const lon = parseFloat(parts[1].trim());
        if (!isNaN(lat) && !isNaN(lon)) {
            return { latitude: lat, longitude: lon };
        }
    }
    return null;
}

// 异步加载地址信息
async function loadAddressesAsync(attendances) {
    // 收集所有需要转换的坐标
    const locationsToConvert = [];
    const locationMap = new Map(); // 用于快速查找
    
    attendances.forEach((att, index) => {
        // 检查上班位置
        if (att.checkin_location && att.checkin_location !== '-') {
            const coords = parseLocation(att.checkin_location);
            if (coords) {
                const key = `${coords.latitude},${coords.longitude}`;
                if (!locationMap.has(key)) {
                    locationMap.set(key, []);
                    locationsToConvert.push(coords);
                }
                locationMap.get(key).push({ type: 'checkin', index });
            }
        }
        
        // 检查下班位置
        if (att.checkout_location && att.checkout_location !== '-') {
            const coords = parseLocation(att.checkout_location);
            if (coords) {
                const key = `${coords.latitude},${coords.longitude}`;
                if (!locationMap.has(key)) {
                    locationMap.set(key, []);
                    locationsToConvert.push(coords);
                }
                locationMap.get(key).push({ type: 'checkout', index });
            }
        }
    });
    
    if (locationsToConvert.length === 0) {
        return; // 没有需要转换的坐标
    }
    
    try {
        // 调用批量地址转换接口
        const response = await apiRequest('/attendance/geocode/batch', {
            method: 'POST',
            body: JSON.stringify({
                locations: locationsToConvert
            })
        });
        
        if (response && response.results) {
            // 创建地址映射
            const addressMap = new Map();
            response.results.forEach(result => {
                if (result.address) {
                    const key = `${result.latitude},${result.longitude}`;
                    addressMap.set(key, result.address);
                }
            });
            
            // 更新表格中的地址显示
            const tbody = document.getElementById('attendance-tbody');
            const rows = tbody.querySelectorAll('tr');
            
            addressMap.forEach((address, key) => {
                const positions = locationMap.get(key);
                if (positions) {
                    positions.forEach(({ type, index }) => {
                        if (rows[index]) {
                            const cells = rows[index].querySelectorAll('td');
                            if (type === 'checkin' && cells[3]) {
                                cells[3].textContent = address;
                                cells[3].style.color = '#333';
                            } else if (type === 'checkout' && cells[5]) {
                                cells[5].textContent = address;
                                cells[5].style.color = '#333';
                            }
                        }
                    });
                }
            });
        }
    } catch (error) {
        console.error('异步加载地址失败:', error);
        // 失败不影响主流程，保持显示坐标
    }
}

// 切换考勤记录查询类型
function toggleAttendanceQueryType() {
    const queryType = document.querySelector('input[name="attendance-query-type"]:checked').value;
    const monthFilter = document.getElementById('attendance-month-filter');
    const dateFilter = document.getElementById('attendance-date-filter');
    
    if (queryType === 'month') {
        monthFilter.style.display = 'flex';
        dateFilter.style.display = 'none';
        // 设置默认月份为当前月
        if (!document.getElementById('attendance-month').value) {
            const now = new Date();
            const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            document.getElementById('attendance-month').value = monthStr;
        }
    } else {
        monthFilter.style.display = 'none';
        dateFilter.style.display = 'flex';
        // 设置默认日期为最近7天
        if (!document.getElementById('attendance-start-date').value) {
            const today = new Date().toISOString().split('T')[0];
            const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            document.getElementById('attendance-start-date').value = lastWeek;
            document.getElementById('attendance-end-date').value = today;
        }
    }
}

// 初始化考勤记录查询
function initAttendanceQuery() {
    toggleAttendanceQueryType();
}

// 加载考勤记录员工列表
async function loadAttendanceUserList() {
    try {
        const users = await apiRequest('/users/');
        const userFilter = document.getElementById('attendance-user-filter');
        const userFilterCustom = document.getElementById('attendance-user-filter-custom');
        
        // 保存当前选中的值
        const currentValue = userFilter.value;
        const currentValueCustom = userFilterCustom ? userFilterCustom.value : '';
        
        // 清空并添加"全部员工"选项
        userFilter.innerHTML = '<option value="">全部员工</option>';
        if (userFilterCustom) {
            userFilterCustom.innerHTML = '<option value="">全部员工</option>';
        }
        
        // 添加所有员工
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.real_name;
            userFilter.appendChild(option);
            
            if (userFilterCustom) {
                const optionCustom = option.cloneNode(true);
                userFilterCustom.appendChild(optionCustom);
            }
        });
        
        // 恢复之前选中的值
        if (currentValue) {
            userFilter.value = currentValue;
        }
        if (userFilterCustom && currentValueCustom) {
            userFilterCustom.value = currentValueCustom;
        }
    } catch (error) {
        console.error('加载员工列表失败:', error);
    }
}

// 获取月份日期范围
function getMonthDateRange(monthStr) {
    if (!monthStr) return { start: null, end: null };
    
    const [year, month] = monthStr.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // 获取该月最后一天
    
    return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
    };
}

// 加载考勤记录
async function loadAttendanceRecords() {
    const queryType = document.querySelector('input[name="attendance-query-type"]:checked').value;
    let userId;
    
    if (queryType === 'month') {
        userId = document.getElementById('attendance-user-filter').value;
    } else {
        userId = document.getElementById('attendance-user-filter-custom').value;
    }
    
    let startDate, endDate;
    
    if (queryType === 'month') {
        // 按月查询
        const monthStr = document.getElementById('attendance-month').value;
        if (!monthStr) {
            alert('请选择月份');
            return;
        }
        const dateRange = getMonthDateRange(monthStr);
        startDate = dateRange.start;
        endDate = dateRange.end;
    } else {
        // 自定义日期查询
        startDate = document.getElementById('attendance-start-date').value;
        endDate = document.getElementById('attendance-end-date').value;
        
        if (!startDate || !endDate) {
            alert('请选择开始日期和结束日期');
            return;
        }
    }

    try {
        // 构建API请求URL
        let url = `/attendance/?start_date=${startDate}&end_date=${endDate}`;
        if (userId) {
            url += `&user_id=${userId}`;
        }
        
        const attendances = await apiRequest(url);
        const users = await apiRequest('/users/');
        const userMap = {};
        users.forEach(u => userMap[u.id] = u.real_name);

        const tbody = document.getElementById('attendance-tbody');
        tbody.innerHTML = attendances.map(att => {
            // 判断位置是否为坐标格式
            const checkinLoc = att.checkin_location || '-';
            const checkoutLoc = att.checkout_location || '-';
            const isCheckinCoord = checkinLoc !== '-' && /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(checkinLoc);
            const isCheckoutCoord = checkoutLoc !== '-' && /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(checkoutLoc);
            
            return `
            <tr>
                <td>${formatDate(att.date)}</td>
                <td>${userMap[att.user_id]}</td>
                <td>${att.checkin_time ? formatTime(att.checkin_time) : '-'}</td>
                <td style="max-width: 200px; word-break: break-all; font-size: 0.9em; color: ${isCheckinCoord ? '#999' : '#666'};" data-location="${checkinLoc}">
                    ${checkinLoc}
                </td>
                <td>${att.checkout_time ? formatTime(att.checkout_time) : '-'}</td>
                <td style="max-width: 200px; word-break: break-all; font-size: 0.9em; color: ${isCheckoutCoord ? '#999' : '#666'};" data-location="${checkoutLoc}">
                    ${checkoutLoc}
                </td>
                <td>${att.work_hours ? att.work_hours.toFixed(1) + 'h' : '-'}</td>
                <td>${att.is_late ? '<span style="color: #FF3B30; font-weight: 500;">是</span>' : '否'}</td>
                <td>${att.is_early_leave ? '<span style="color: #FF3B30; font-weight: 500;">是</span>' : '否'}</td>
            </tr>
        `;
        }).join('');
        
        // 异步加载地址信息（不阻塞主流程）
        loadAddressesAsync(attendances).catch(err => {
            console.error('异步加载地址失败:', err);
        });
    } catch (error) {
        console.error('加载考勤记录失败:', error);
    }
}

// 切换请假管理查询类型
function toggleLeaveQueryType() {
    const queryType = document.querySelector('input[name="leave-query-type"]:checked').value;
    const monthFilter = document.getElementById('leave-month-filter');
    const dateFilter = document.getElementById('leave-date-filter');
    
    if (queryType === 'month') {
        monthFilter.style.display = 'flex';
        dateFilter.style.display = 'none';
        // 设置默认月份为当前月
        if (!document.getElementById('leave-month').value) {
            const now = new Date();
            const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            document.getElementById('leave-month').value = monthStr;
        }
    } else {
        monthFilter.style.display = 'none';
        dateFilter.style.display = 'flex';
        dateFilter.style.gap = '10px';
        dateFilter.style.alignItems = 'center';
        // 设置默认日期为最近7天
        if (!document.getElementById('leave-start-date').value) {
            const today = new Date().toISOString().split('T')[0];
            const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            document.getElementById('leave-start-date').value = lastWeek;
            document.getElementById('leave-end-date').value = today;
        }
    }
}

// 初始化请假管理查询
function initLeaveQuery() {
    toggleLeaveQueryType();
}

// 加载请假管理员工列表
async function loadLeaveUserList() {
    try {
        const users = await apiRequest('/users/');
        const userFilter = document.getElementById('leave-user-filter');
        const userFilterCustom = document.getElementById('leave-user-filter-custom');
        
        // 保存当前选中的值
        const currentValue = userFilter ? userFilter.value : '';
        const currentValueCustom = userFilterCustom ? userFilterCustom.value : '';
        
        // 清空并添加"全部员工"选项
        if (userFilter) {
            userFilter.innerHTML = '<option value="">全部员工</option>';
        }
        if (userFilterCustom) {
            userFilterCustom.innerHTML = '<option value="">全部员工</option>';
        }
        
        // 添加所有员工
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.real_name;
            if (userFilter) {
                userFilter.appendChild(option);
            }
            if (userFilterCustom) {
                const optionCustom = option.cloneNode(true);
                userFilterCustom.appendChild(optionCustom);
            }
        });
        
        // 恢复之前选中的值
        if (userFilter && currentValue) {
            userFilter.value = currentValue;
        }
        if (userFilterCustom && currentValueCustom) {
            userFilterCustom.value = currentValueCustom;
        }
    } catch (error) {
        console.error('加载员工列表失败:', error);
    }
}

// 加载请假申请
async function loadLeaveApplications() {
    const queryType = document.querySelector('input[name="leave-query-type"]:checked').value;
    let userId;
    
    if (queryType === 'month') {
        userId = document.getElementById('leave-user-filter').value;
    } else {
        userId = document.getElementById('leave-user-filter-custom').value;
    }
    
    let startDate, endDate;
    
    if (queryType === 'month') {
        // 按月查询
        const monthStr = document.getElementById('leave-month').value;
        if (!monthStr) {
            alert('请选择月份');
            return;
        }
        const dateRange = getMonthDateRange(monthStr);
        startDate = dateRange.start;
        endDate = dateRange.end;
    } else {
        // 自定义日期查询
        startDate = document.getElementById('leave-start-date').value;
        endDate = document.getElementById('leave-end-date').value;
        
        if (!startDate || !endDate) {
            alert('请选择开始日期和结束日期');
            return;
        }
    }
    
    try {
        // 构建API请求URL
        let url = `/leave/?start_date=${startDate}&end_date=${endDate}`;
        if (userId) {
            url += `&user_id=${userId}`;
        }
        
        const leaves = await apiRequest(url);
        const users = await apiRequest('/users/');
        const userMap = {};
        users.forEach(u => userMap[u.id] = u.real_name);

        const tbody = document.getElementById('leave-tbody');
        tbody.innerHTML = leaves.map(leave => {
            // 获取最后审批人信息
            let approverName = '-';
            let approvedTime = '-';
            
            if (leave.status === 'approved' || leave.status === 'rejected') {
                // 根据状态获取对应的审批人
                if (leave.gm_approver_id) {
                    approverName = userMap[leave.gm_approver_id] || '-';
                    approvedTime = leave.gm_approved_at ? formatDateTime(leave.gm_approved_at) : '-';
                } else if (leave.vp_approver_id) {
                    approverName = userMap[leave.vp_approver_id] || '-';
                    approvedTime = leave.vp_approved_at ? formatDateTime(leave.vp_approved_at) : '-';
                } else if (leave.dept_approver_id) {
                    approverName = userMap[leave.dept_approver_id] || '-';
                    approvedTime = leave.dept_approved_at ? formatDateTime(leave.dept_approved_at) : '-';
                }
            } else if (leave.status === 'vp_approved') {
                // 等待总经理审批，显示副总审批信息
                approverName = userMap[leave.vp_approver_id] || '-';
                approvedTime = leave.vp_approved_at ? formatDateTime(leave.vp_approved_at) : '-';
            } else if (leave.status === 'dept_approved') {
                // 等待副总审批，显示部门主任审批信息
                approverName = userMap[leave.dept_approver_id] || '-';
                approvedTime = leave.dept_approved_at ? formatDateTime(leave.dept_approved_at) : '-';
            }
            
            return `
                <tr>
                    <td>${userMap[leave.user_id]}</td>
                    <td>${formatDate(leave.start_date)}</td>
                    <td>${formatDate(leave.end_date)}</td>
                    <td>${leave.days}</td>
                    <td>${leave.reason}</td>
                    <td>${formatDateTime(leave.created_at)}</td>
                    <td><span class="status-badge status-${getLeaveStatusClass(leave.status)}">
                        ${getLeaveStatusName(leave.status)}</span></td>
                    <td>${approverName}</td>
                    <td>${approvedTime}</td>
                    <td>
                        <button class="btn btn-small btn-primary" onclick="viewLeaveDetail(${leave.id})">详情</button>
                        ${leave.status === 'cancelled' ? `
                            <button class="btn btn-small btn-danger" onclick="deleteLeaveApplication(${leave.id})" style="margin-left: 5px;">删除</button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('加载请假申请失败:', error);
    }
}

// 切换加班管理查询类型
function toggleOvertimeQueryType() {
    const queryType = document.querySelector('input[name="overtime-query-type"]:checked').value;
    const monthFilter = document.getElementById('overtime-month-filter');
    const dateFilter = document.getElementById('overtime-date-filter');
    
    if (queryType === 'month') {
        monthFilter.style.display = 'flex';
        dateFilter.style.display = 'none';
        // 设置默认月份为当前月
        if (!document.getElementById('overtime-month').value) {
            const now = new Date();
            const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            document.getElementById('overtime-month').value = monthStr;
        }
    } else {
        monthFilter.style.display = 'none';
        dateFilter.style.display = 'flex';
        dateFilter.style.gap = '10px';
        dateFilter.style.alignItems = 'center';
        // 设置默认日期为最近7天
        if (!document.getElementById('overtime-start-date').value) {
            const today = new Date().toISOString().split('T')[0];
            const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            document.getElementById('overtime-start-date').value = lastWeek;
            document.getElementById('overtime-end-date').value = today;
        }
    }
}

// 初始化加班管理查询
function initOvertimeQuery() {
    toggleOvertimeQueryType();
}

// 加载加班管理员工列表
async function loadOvertimeUserList() {
    try {
        const users = await apiRequest('/users/');
        const userFilter = document.getElementById('overtime-user-filter');
        const userFilterCustom = document.getElementById('overtime-user-filter-custom');
        
        // 保存当前选中的值
        const currentValue = userFilter ? userFilter.value : '';
        const currentValueCustom = userFilterCustom ? userFilterCustom.value : '';
        
        // 清空并添加"全部员工"选项
        if (userFilter) {
            userFilter.innerHTML = '<option value="">全部员工</option>';
        }
        if (userFilterCustom) {
            userFilterCustom.innerHTML = '<option value="">全部员工</option>';
        }
        
        // 添加所有员工
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.real_name;
            if (userFilter) {
                userFilter.appendChild(option);
            }
            if (userFilterCustom) {
                const optionCustom = option.cloneNode(true);
                userFilterCustom.appendChild(optionCustom);
            }
        });
        
        // 恢复之前选中的值
        if (userFilter && currentValue) {
            userFilter.value = currentValue;
        }
        if (userFilterCustom && currentValueCustom) {
            userFilterCustom.value = currentValueCustom;
        }
    } catch (error) {
        console.error('加载员工列表失败:', error);
    }
}

// 加载加班申请
async function loadOvertimeApplications() {
    const queryType = document.querySelector('input[name="overtime-query-type"]:checked').value;
    let userId;
    
    if (queryType === 'month') {
        userId = document.getElementById('overtime-user-filter').value;
    } else {
        userId = document.getElementById('overtime-user-filter-custom').value;
    }
    
    let startDate, endDate;
    
    if (queryType === 'month') {
        // 按月查询
        const monthStr = document.getElementById('overtime-month').value;
        if (!monthStr) {
            alert('请选择月份');
            return;
        }
        const dateRange = getMonthDateRange(monthStr);
        startDate = dateRange.start;
        endDate = dateRange.end;
    } else {
        // 自定义日期查询
        startDate = document.getElementById('overtime-start-date').value;
        endDate = document.getElementById('overtime-end-date').value;
        
        if (!startDate || !endDate) {
            alert('请选择开始日期和结束日期');
            return;
        }
    }
    
    try {
        // 构建API请求URL
        let url = `/overtime/?start_date=${startDate}&end_date=${endDate}`;
        if (userId) {
            url += `&user_id=${userId}`;
        }
        
        const overtimes = await apiRequest(url);
        const users = await apiRequest('/users/');
        const userMap = {};
        users.forEach(u => userMap[u.id] = u.real_name);

        const tbody = document.getElementById('overtime-tbody');
        tbody.innerHTML = overtimes.map(ot => {
            // 获取审批人信息
            let approverName = '-';
            let approvedTime = '-';
            
            if (ot.approver_id) {
                approverName = userMap[ot.approver_id] || '-';
                approvedTime = ot.approved_at ? formatDateTime(ot.approved_at) : '-';
            }
            
            return `
                <tr>
                    <td>${userMap[ot.user_id]}</td>
                    <td>${formatDateTime(ot.start_time)}</td>
                    <td>${formatDateTime(ot.end_time)}</td>
                    <td>${ot.days}天</td>
                    <td>${ot.reason}</td>
                    <td>${formatDateTime(ot.created_at)}</td>
                    <td><span class="status-badge status-${ot.status}">
                        ${getOvertimeStatusName(ot.status)}</span></td>
                    <td>${approverName}</td>
                    <td>${approvedTime}</td>
                    <td>
                        <button class="btn btn-small btn-primary" onclick="viewOvertimeDetail(${ot.id})">详情</button>
                        ${ot.status === 'cancelled' ? `
                            <button class="btn btn-small btn-danger" onclick="deleteOvertimeApplication(${ot.id})" style="margin-left: 5px;">删除</button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('加载加班申请失败:', error);
    }
}

// 加载打卡策略
async function loadPolicies() {
    try {
        const policies = await apiRequest('/attendance/policies');

        const tbody = document.getElementById('policies-tbody');
        tbody.innerHTML = policies.map(policy => `
            <tr>
                <td>${policy.name}</td>
                <td>${policy.work_start_time}</td>
                <td>${policy.work_end_time}</td>
                <td>${policy.checkin_start_time} - ${policy.checkin_end_time}<br>
                    ${policy.checkout_start_time} - ${policy.checkout_end_time}</td>
                <td><span class="status-badge ${policy.is_active ? 'status-active' : 'status-inactive'}">
                    ${policy.is_active ? '启用' : '禁用'}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-small btn-primary" onclick="editPolicy(${policy.id})">编辑</button>
                        <button class="btn btn-small btn-danger" onclick="deletePolicy(${policy.id})">删除</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('加载策略失败:', error);
    }
}

// 加载统计数据
// 全局变量存储统计数据
let statisticsData = [];

// 切换统计标签页
function switchStatsTab(tab) {
    // 切换标签按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // 切换内容显示
    document.querySelectorAll('.stats-tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tab}-stats`).classList.add('active');
}

// 切换日期类型
function toggleDateType() {
    const dateType = document.querySelector('input[name="date-type"]:checked').value;
    const monthSelector = document.getElementById('month-selector');
    const dateSelector = document.getElementById('date-selector');
    
    if (dateType === 'month') {
        monthSelector.style.display = 'flex';
        dateSelector.style.display = 'none';
        
        // 设置默认为当前月份
        const now = new Date();
        const currentMonth = now.toISOString().substr(0, 7);
        document.getElementById('stats-month').value = currentMonth;
    } else {
        monthSelector.style.display = 'none';
        dateSelector.style.display = 'flex';
    }
}

// 根据月份获取开始和结束日期
function getMonthDateRange(monthValue) {
    // monthValue 格式: "2025-11"
    const [year, month] = monthValue.split('-').map(Number);
    
    // 该月第一天
    const startDate = new Date(year, month - 1, 1);
    
    // 该月最后一天
    const endDate = new Date(year, month, 0);
    
    return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
    };
}

// 全局变量：保存当前统计的日期范围
let currentStatsDateRange = { startDate: '', endDate: '' };

// 加载所有统计数据
async function loadAllStatistics() {
    const dateType = document.querySelector('input[name="date-type"]:checked').value;
    let startDate, endDate;
    
    if (dateType === 'month') {
        // 按月统计
        const monthValue = document.getElementById('stats-month').value;
        if (!monthValue) {
            alert('请选择月份');
            return;
        }
        const dateRange = getMonthDateRange(monthValue);
        startDate = dateRange.start;
        endDate = dateRange.end;
    } else {
        // 自定义日期
        startDate = document.getElementById('stats-start-date').value || 
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        endDate = document.getElementById('stats-end-date').value || 
            new Date().toISOString().split('T')[0];
    }
    
    // 保存日期范围供详情查看使用
    currentStatsDateRange.startDate = startDate;
    currentStatsDateRange.endDate = endDate;

    try {
        // 获取考勤统计数据
        statisticsData = await apiRequest(`/statistics/attendance?start_date=${startDate}&end_date=${endDate}`);
        
        // 获取周期统计数据
        const periodStats = await apiRequest(`/statistics/period?start_date=${startDate}&end_date=${endDate}`);
        
        // 加载各个统计视图
        loadOverallStats(periodStats);
        loadAttendanceStats();
        loadLeaveStats();
        loadOvertimeStats();
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// 加载总统计
function loadOverallStats(periodStats) {
    console.log('loadOverallStats - periodStats:', periodStats);
    console.log('total_users:', periodStats.total_users, typeof periodStats.total_users);
    const statsTotalUsersEl = document.getElementById('stats-total-users');
    if (statsTotalUsersEl) {
        statsTotalUsersEl.textContent = periodStats.total_users || 0;
    }
    document.getElementById('total-attendance-rate').textContent = `${periodStats.attendance_rate || 0}%`;
    document.getElementById('total-leave-days').textContent = (periodStats.total_leave_days || 0).toFixed(1);
    document.getElementById('total-overtime-days').textContent = (periodStats.total_overtime_days || 0).toFixed(1);
}

// 加载出勤统计
function loadAttendanceStats() {
    const tbody = document.getElementById('attendance-stats-tbody');
    tbody.innerHTML = statisticsData.map(stat => `
        <tr>
            <td>${stat.user_name}</td>
            <td>${stat.department || '-'}</td>
            <td>${stat.total_days}</td>
            <td>${stat.present_days}</td>
            <td>${stat.late_days}</td>
            <td>${stat.early_leave_days}</td>
            <td>${stat.absence_days}</td>
            <td>${stat.work_hours.toFixed(1)}</td>
        </tr>
    `).join('');
}

// 加载请假统计
function loadLeaveStats() {
    const tbody = document.getElementById('leave-stats-tbody');
    
    // 过滤出有请假记录的员工（只统计已批准的）
    const leaveData = statisticsData
        .filter(stat => stat.leave_days > 0)
        .map(stat => ({
            ...stat,
            leave_count: stat.leave_count || 0 // 使用后端返回的真实次数
        }))
        .sort((a, b) => b.leave_days - a.leave_days);
    
    if (leaveData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #999;">暂无请假记录</td></tr>';
        return;
    }
    
    tbody.innerHTML = leaveData.map((stat, index) => `
        <tr>
            <td>${stat.user_name}</td>
            <td>${stat.department || '-'}</td>
            <td>${stat.leave_days.toFixed(1)}</td>
            <td>${stat.leave_count}</td>
            <td>
                <button class="btn btn-small btn-primary" data-user-id="${stat.user_id}" data-user-name="${stat.user_name.replace(/"/g, '&quot;')}" data-action="leave-details">详情</button>
            </td>
        </tr>
    `).join('');
    
    // 绑定事件监听器
    tbody.querySelectorAll('button[data-action="leave-details"]').forEach(btn => {
        btn.addEventListener('click', function() {
            const userId = parseInt(this.getAttribute('data-user-id'));
            const userName = this.getAttribute('data-user-name');
            showLeaveDetails(userId, userName);
        });
    });
}

// 加载加班统计
function loadOvertimeStats() {
    const tbody = document.getElementById('overtime-stats-tbody');
    
    // 过滤出有加班记录的员工（只统计已批准的）
    const overtimeData = statisticsData
        .filter(stat => stat.overtime_days > 0)
        .map(stat => ({
            ...stat,
            overtime_count: stat.overtime_count || 0 // 使用后端返回的真实次数
        }))
        .sort((a, b) => b.overtime_days - a.overtime_days);
    
    if (overtimeData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #999;">暂无加班记录</td></tr>';
        return;
    }
    
    tbody.innerHTML = overtimeData.map((stat, index) => `
        <tr>
            <td>${stat.user_name}</td>
            <td>${stat.department || '-'}</td>
            <td>${stat.overtime_days.toFixed(1)}</td>
            <td>${stat.overtime_count}</td>
            <td>
                <button class="btn btn-small btn-primary" data-user-id="${stat.user_id}" data-user-name="${stat.user_name.replace(/"/g, '&quot;')}" data-action="overtime-details">详情</button>
            </td>
        </tr>
    `).join('');
    
    // 绑定事件监听器
    tbody.querySelectorAll('button[data-action="overtime-details"]').forEach(btn => {
        btn.addEventListener('click', function() {
            const userId = parseInt(this.getAttribute('data-user-id'));
            const userName = this.getAttribute('data-user-name');
            showOvertimeDetails(userId, userName);
        });
    });
}

// 显示请假明细（全局函数）
window.showLeaveDetails = async function(userId, userName) {
    console.log('showLeaveDetails called:', userId, userName);
    console.log('currentStatsDateRange:', currentStatsDateRange);
    
    if (!currentStatsDateRange.startDate || !currentStatsDateRange.endDate) {
        alert('请先加载统计数据');
        return;
    }
    
    try {
        const url = `/statistics/user/${userId}/leave-details?start_date=${currentStatsDateRange.startDate}&end_date=${currentStatsDateRange.endDate}`;
        console.log('Requesting URL:', url);
        
        const leaves = await apiRequest(url);
        console.log('Received leaves:', leaves);
        
        if (!leaves || !Array.isArray(leaves)) {
            console.error('Invalid response:', leaves);
            alert('获取数据格式错误');
            return;
        }
        
        if (leaves.length === 0) {
            alert(`${userName} 在选定时间段内没有已批准的请假记录`);
            return;
        }
        
        // 创建明细弹窗
        const modalHtml = `
            <div class="modal-overlay" onclick="closeDetailModal(event)">
                <div class="modal" style="max-width: 800px; max-height: 80vh;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>${userName} - 请假明细</h3>
                        <button class="modal-close" onclick="closeDetailModal()">×</button>
                    </div>
                    <div class="modal-content" style="overflow-y: auto; max-height: 60vh;">
                        <table class="table" style="width: 100%;">
                            <thead>
                                <tr>
                                    <th>开始日期</th>
                                    <th>结束日期</th>
                                    <th>天数</th>
                                    <th>原因</th>
                                    <th>申请时间</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${leaves.map(leave => `
                                    <tr>
                                        <td>${formatDate(leave.start_date)}</td>
                                        <td>${formatDate(leave.end_date)}</td>
                                        <td>${leave.days}</td>
                                        <td>${leave.reason || '-'}</td>
                                        <td>${formatDateTime(leave.created_at)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        
        const modalContainer = document.getElementById('modal-container');
        if (!modalContainer) {
            console.error('modal-container not found');
            alert('页面元素未找到，请刷新页面重试');
            return;
        }
        
        modalContainer.innerHTML = modalHtml;
        console.log('Modal displayed');
    } catch (error) {
        console.error('加载请假明细失败:', error);
        alert('加载请假明细失败: ' + (error.message || '未知错误'));
    }
}

// 显示加班明细（全局函数）
window.showOvertimeDetails = async function(userId, userName) {
    console.log('showOvertimeDetails called:', userId, userName);
    console.log('currentStatsDateRange:', currentStatsDateRange);
    
    if (!currentStatsDateRange.startDate || !currentStatsDateRange.endDate) {
        alert('请先加载统计数据');
        return;
    }
    
    try {
        const url = `/statistics/user/${userId}/overtime-details?start_date=${currentStatsDateRange.startDate}&end_date=${currentStatsDateRange.endDate}`;
        console.log('Requesting URL:', url);
        
        const overtimes = await apiRequest(url, { method: 'GET' });
        console.log('Received overtimes:', overtimes);
        
        if (!overtimes || !Array.isArray(overtimes)) {
            console.error('Invalid response:', overtimes);
            alert('获取数据格式错误');
            return;
        }
        
        if (overtimes.length === 0) {
            alert(`${userName} 在选定时间段内没有已批准的加班记录`);
            return;
        }
        
        // 创建明细弹窗
        const modalHtml = `
            <div class="modal-overlay" onclick="closeDetailModal(event)">
                <div class="modal" style="max-width: 800px; max-height: 80vh;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>${userName} - 加班明细</h3>
                        <button class="modal-close" onclick="closeDetailModal()">×</button>
                    </div>
                    <div class="modal-content" style="overflow-y: auto; max-height: 60vh;">
                        <table class="table" style="width: 100%;">
                            <thead>
                                <tr>
                                    <th>开始时间</th>
                                    <th>结束时间</th>
                                    <th>天数</th>
                                    <th>原因</th>
                                    <th>申请时间</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${overtimes.map(ot => `
                                    <tr>
                                        <td>${formatDateTime(ot.start_time)}</td>
                                        <td>${formatDateTime(ot.end_time)}</td>
                                        <td>${ot.days}</td>
                                        <td>${ot.reason || '-'}</td>
                                        <td>${formatDateTime(ot.created_at)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        
        const modalContainer = document.getElementById('modal-container');
        if (!modalContainer) {
            console.error('modal-container not found');
            alert('页面元素未找到，请刷新页面重试');
            return;
        }
        
        modalContainer.innerHTML = modalHtml;
        console.log('Modal displayed');
    } catch (error) {
        console.error('加载加班明细失败:', error);
        alert('加载加班明细失败: ' + (error.message || '未知错误'));
    }
}

// 关闭明细弹窗（全局函数）
window.closeDetailModal = function(event) {
    if (event && !event.target.classList.contains('modal-overlay')) return;
    document.getElementById('modal-container').innerHTML = '';
}

// 辅助函数
function getRoleName(role) {
    const names = {
        'admin': '管理员',
        'general_manager': '总经理',
        'vice_president': '副总',
        'department_head': '部门主任',
        'employee': '员工'
    };
    return names[role] || role;
}

function getLeaveStatusName(status) {
    const names = {
        'pending': '待审批',
        'dept_approved': '部门已批',
        'vp_approved': '副总已批',
        'approved': '已批准',
        'rejected': '已拒绝',
        'cancelled': '已取消'
    };
    return names[status] || status;
}

function getLeaveStatusClass(status) {
    if (status === 'approved') return 'approved';
    if (status === 'rejected') return 'rejected';
    if (status === 'cancelled') return 'inactive';
    return 'pending';
}

function getOvertimeStatusName(status) {
    const names = {
        'pending': '待审批',
        'approved': '已批准',
        'rejected': '已拒绝',
        'cancelled': '已取消'
    };
    return names[status] || status;
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('zh-CN');
}

function formatDateTime(dateStr) {
    return new Date(dateStr).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==================== 模态框工具函数 ====================
function showModal(title, content, onConfirm) {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <h3>${title}</h3>
                <div class="modal-content">
                    ${content}
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
                    <button class="btn btn-primary" onclick="handleModalConfirm()" id="modal-confirm-btn">确定</button>
                </div>
            </div>
        </div>
    `;
    
    // 保存确认回调
    window.currentModalCallback = onConfirm;
}

function closeModal(event) {
    if (event && event.target.classList.contains('modal')) return;
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
        modalContainer.innerHTML = '';
        modalContainer.style.display = 'none';
    }
    window.currentModalCallback = null;
}

function handleModalConfirm() {
    if (window.currentModalCallback) {
        window.currentModalCallback();
    }
    closeModal();
}

// ==================== 自定义确认对话框 ====================
function showConfirmDialog(title, message, onConfirm, onCancel) {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeConfirmDialog()">
            <div class="confirm-dialog" onclick="event.stopPropagation()">
                <div class="confirm-dialog-header">
                    <h3>${title}</h3>
                </div>
                <div class="confirm-dialog-content">
                    <div class="confirm-icon">⚠️</div>
                    <p>${message}</p>
                </div>
                <div class="confirm-dialog-actions">
                    <button class="btn btn-secondary" onclick="closeConfirmDialog()">取消</button>
                    <button class="btn btn-danger" onclick="handleConfirmDialog()">确定</button>
                </div>
            </div>
        </div>
    `;
    modalContainer.style.display = 'flex';
    
    // 保存回调
    window.currentConfirmCallback = onConfirm;
    window.currentCancelCallback = onCancel;
}

function closeConfirmDialog() {
    if (window.currentCancelCallback) {
        window.currentCancelCallback();
    }
    window.currentConfirmCallback = null;
    window.currentCancelCallback = null;
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
        modalContainer.innerHTML = '';
        modalContainer.style.display = 'none';
    }
}

function handleConfirmDialog() {
    if (window.currentConfirmCallback) {
        window.currentConfirmCallback();
    }
    closeConfirmDialog();
}

// ==================== 自定义Toast提示 ====================
function showToast(message, type = 'info') {
    // 移除已存在的toast
    const existingToast = document.querySelector('.custom-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `custom-toast custom-toast-${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // 触发动画
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // 自动关闭
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// ==================== 用户管理 ====================
async function showAddUserModal() {
    const departments = await apiRequest('/departments/');
    const deptOptions = departments.map(d => 
        `<option value="${d.id}">${d.name}</option>`
    ).join('');
    
    const content = `
        <div class="form-group">
            <label>用户名 *</label>
            <input type="text" id="modal-username" class="form-input" required>
        </div>
        <div class="form-group">
            <label>姓名 *</label>
            <input type="text" id="modal-realname" class="form-input" required>
        </div>
        <div class="form-group">
            <label>密码 *</label>
            <input type="password" id="modal-password" class="form-input" required>
        </div>
        <div class="form-group">
            <label>邮箱</label>
            <input type="email" id="modal-email" class="form-input">
        </div>
        <div class="form-group">
            <label>手机号</label>
            <input type="text" id="modal-phone" class="form-input">
        </div>
        <div class="form-group">
            <label>角色 *</label>
            <select id="modal-role" class="form-input">
                <option value="employee">员工</option>
                <option value="department_head">部门主任</option>
                <option value="vice_president">副总</option>
                <option value="general_manager">总经理</option>
                <option value="admin">管理员</option>
            </select>
        </div>
        <div class="form-group">
            <label>部门</label>
            <select id="modal-department" class="form-input">
                <option value="">无</option>
                ${deptOptions}
            </select>
        </div>
    `;
    
    showModal('添加用户', content, async () => {
        const username = document.getElementById('modal-username').value;
        const realname = document.getElementById('modal-realname').value;
        const password = document.getElementById('modal-password').value;
        const email = document.getElementById('modal-email').value;
        const phone = document.getElementById('modal-phone').value;
        const role = document.getElementById('modal-role').value;
        const department = document.getElementById('modal-department').value;
        
        if (!username || !realname || !password) {
            alert('请填写必填项');
            return;
        }
        
        try {
            await apiRequest('/users/', {
                method: 'POST',
                body: JSON.stringify({
                    username,
                    real_name: realname,
                    password,
                    email: email || null,
                    phone: phone || null,
                    role,
                    department_id: department ? parseInt(department) : null
                })
            });
            
            closeModal();
            alert('添加成功');
            loadUsers();
        } catch (error) {
            alert('添加失败: ' + error.message);
        }
    });
}

async function editUser(id) {
    const user = await apiRequest(`/users/${id}`);
    const departments = await apiRequest('/departments/');
    const deptOptions = departments.map(d => 
        `<option value="${d.id}" ${d.id === user.department_id ? 'selected' : ''}>${d.name}</option>`
    ).join('');
    
    const content = `
        <div class="form-group">
            <label>用户名</label>
            <input type="text" value="${user.username}" class="form-input" disabled>
        </div>
        <div class="form-group">
            <label>姓名 *</label>
            <input type="text" id="modal-realname" class="form-input" value="${user.real_name}" required>
        </div>
        <div class="form-group">
            <label>新密码（留空则不修改）</label>
            <input type="password" id="modal-password" class="form-input">
        </div>
        <div class="form-group">
            <label>邮箱</label>
            <input type="email" id="modal-email" class="form-input" value="${user.email || ''}">
        </div>
        <div class="form-group">
            <label>手机号</label>
            <input type="text" id="modal-phone" class="form-input" value="${user.phone || ''}">
        </div>
        <div class="form-group">
            <label>角色 *</label>
            <select id="modal-role" class="form-input">
                <option value="employee" ${user.role === 'employee' ? 'selected' : ''}>员工</option>
                <option value="department_head" ${user.role === 'department_head' ? 'selected' : ''}>部门主任</option>
                <option value="vice_president" ${user.role === 'vice_president' ? 'selected' : ''}>副总</option>
                <option value="general_manager" ${user.role === 'general_manager' ? 'selected' : ''}>总经理</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理员</option>
            </select>
        </div>
        <div class="form-group">
            <label>部门</label>
            <select id="modal-department" class="form-input">
                <option value="">无</option>
                ${deptOptions}
            </select>
        </div>
        <div class="form-group">
            <label>状态</label>
            <select id="modal-active" class="form-input">
                <option value="true" ${user.is_active ? 'selected' : ''}>激活</option>
                <option value="false" ${!user.is_active ? 'selected' : ''}>禁用</option>
            </select>
        </div>
    `;
    
    showModal('编辑用户', content, async () => {
        const realname = document.getElementById('modal-realname').value;
        const password = document.getElementById('modal-password').value;
        const email = document.getElementById('modal-email').value;
        const phone = document.getElementById('modal-phone').value;
        const role = document.getElementById('modal-role').value;
        const department = document.getElementById('modal-department').value;
        const isActive = document.getElementById('modal-active').value === 'true';
        
        if (!realname) {
            alert('请填写姓名');
            return;
        }
        
        const updateData = {
            real_name: realname,
            email: email || null,
            phone: phone || null,
            role,
            department_id: department ? parseInt(department) : null,
            is_active: isActive
        };
        
        if (password) {
            updateData.password = password;
        }
        
        try {
            await apiRequest(`/users/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
            
            closeModal();
            alert('更新成功');
            loadUsers();
        } catch (error) {
            alert('更新失败: ' + error.message);
        }
    });
}

function deleteUser(id) {
    if (confirm('确定要删除该用户吗？')) {
        apiRequest(`/users/${id}`, { method: 'DELETE' })
            .then(() => {
                alert('删除成功');
                loadUsers();
            })
            .catch(error => alert('删除失败: ' + error.message));
    }
}

// ==================== 部门管理 ====================
async function showAddDepartmentModal() {
    const users = await apiRequest('/users/');
    const userOptions = users.map(u => 
        `<option value="${u.id}">${u.real_name}</option>`
    ).join('');
    
    const content = `
        <div class="form-group">
            <label>部门名称 *</label>
            <input type="text" id="modal-dept-name" class="form-input" required>
        </div>
        <div class="form-group">
            <label>描述</label>
            <textarea id="modal-dept-desc" class="form-input" rows="3"></textarea>
        </div>
        <div class="form-group">
            <label>部门主任</label>
            <select id="modal-dept-head" class="form-input">
                <option value="">无</option>
                ${userOptions}
            </select>
        </div>
    `;
    
    showModal('添加部门', content, async () => {
        const name = document.getElementById('modal-dept-name').value;
        const description = document.getElementById('modal-dept-desc').value;
        const headId = document.getElementById('modal-dept-head').value;
        
        if (!name) {
            alert('请填写部门名称');
            return;
        }
        
        try {
            await apiRequest('/departments/', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    description: description || null,
                    head_id: headId ? parseInt(headId) : null
                })
            });
            
            closeModal();
            alert('添加成功');
            loadDepartments();
        } catch (error) {
            alert('添加失败: ' + error.message);
        }
    });
}

async function editDepartment(id) {
    const dept = await apiRequest(`/departments/${id}`);
    const users = await apiRequest('/users/');
    const userOptions = users.map(u => 
        `<option value="${u.id}" ${u.id === dept.head_id ? 'selected' : ''}>${u.real_name}</option>`
    ).join('');
    
    const content = `
        <div class="form-group">
            <label>部门名称 *</label>
            <input type="text" id="modal-dept-name" class="form-input" value="${dept.name}" required>
        </div>
        <div class="form-group">
            <label>描述</label>
            <textarea id="modal-dept-desc" class="form-input" rows="3">${dept.description || ''}</textarea>
        </div>
        <div class="form-group">
            <label>部门主任</label>
            <select id="modal-dept-head" class="form-input">
                <option value="">无</option>
                ${userOptions}
            </select>
        </div>
    `;
    
    showModal('编辑部门', content, async () => {
        const name = document.getElementById('modal-dept-name').value;
        const description = document.getElementById('modal-dept-desc').value;
        const headId = document.getElementById('modal-dept-head').value;
        
        if (!name) {
            alert('请填写部门名称');
            return;
        }
        
        try {
            await apiRequest(`/departments/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name,
                    description: description || null,
                    head_id: headId ? parseInt(headId) : null
                })
            });
            
            closeModal();
            alert('更新成功');
            loadDepartments();
        } catch (error) {
            alert('更新失败: ' + error.message);
        }
    });
}

function deleteDepartment(id) {
    if (confirm('确定要删除该部门吗？')) {
        apiRequest(`/departments/${id}`, { method: 'DELETE' })
            .then(() => {
                alert('删除成功');
                loadDepartments();
            })
            .catch(error => alert('删除失败: ' + error.message));
    }
}

// ==================== 策略管理 ====================
function showAddPolicyModal() {
    const content = `
        <div class="form-group">
            <label>策略名称 *</label>
            <input type="text" id="modal-policy-name" class="form-input" required>
        </div>
        <div class="form-group">
            <label>上班时间 *</label>
            <input type="time" id="modal-work-start" class="form-input" value="09:00" required>
        </div>
        <div class="form-group">
            <label>下班时间 *</label>
            <input type="time" id="modal-work-end" class="form-input" value="18:00" required>
        </div>
        <div class="form-group">
            <label>上班打卡开始时间 *</label>
            <input type="time" id="modal-checkin-start" class="form-input" value="08:00" required>
        </div>
        <div class="form-group">
            <label>上班打卡结束时间 *</label>
            <input type="time" id="modal-checkin-end" class="form-input" value="09:30" required>
        </div>
        <div class="form-group">
            <label>下班打卡开始时间 *</label>
            <input type="time" id="modal-checkout-start" class="form-input" value="17:30" required>
        </div>
        <div class="form-group">
            <label>下班打卡结束时间 *</label>
            <input type="time" id="modal-checkout-end" class="form-input" value="23:59" required>
        </div>
        <div class="form-group">
            <label>迟到阈值（分钟）</label>
            <input type="number" id="modal-late-threshold" class="form-input" value="0" min="0">
        </div>
        <div class="form-group">
            <label>早退阈值（分钟）</label>
            <input type="number" id="modal-early-threshold" class="form-input" value="0" min="0">
        </div>
        <div class="form-group">
            <label>
                <input type="checkbox" id="modal-policy-active" checked>
                启用该策略
            </label>
        </div>
    `;
    
    showModal('添加打卡策略', content, async () => {
        const name = document.getElementById('modal-policy-name').value;
        const workStart = document.getElementById('modal-work-start').value;
        const workEnd = document.getElementById('modal-work-end').value;
        const checkinStart = document.getElementById('modal-checkin-start').value;
        const checkinEnd = document.getElementById('modal-checkin-end').value;
        const checkoutStart = document.getElementById('modal-checkout-start').value;
        const checkoutEnd = document.getElementById('modal-checkout-end').value;
        const lateThreshold = parseInt(document.getElementById('modal-late-threshold').value);
        const earlyThreshold = parseInt(document.getElementById('modal-early-threshold').value);
        const isActive = document.getElementById('modal-policy-active').checked;
        
        if (!name || !workStart || !workEnd) {
            alert('请填写必填项');
            return;
        }
        
        try {
            await apiRequest('/attendance/policies', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    work_start_time: workStart,
                    work_end_time: workEnd,
                    checkin_start_time: checkinStart,
                    checkin_end_time: checkinEnd,
                    checkout_start_time: checkoutStart,
                    checkout_end_time: checkoutEnd,
                    late_threshold_minutes: lateThreshold,
                    early_threshold_minutes: earlyThreshold,
                    is_active: isActive
                })
            });
            
            closeModal();
            alert('添加成功');
            loadPolicies();
        } catch (error) {
            alert('添加失败: ' + error.message);
        }
    });
}

async function editPolicy(id) {
    const policy = await apiRequest(`/attendance/policies`);
    const currentPolicy = policy.find(p => p.id === id);
    
    if (!currentPolicy) {
        alert('策略不存在');
        return;
    }
    
    // 解析每周规则
    let weeklyRules = {};
    if (currentPolicy.weekly_rules) {
        try {
            weeklyRules = JSON.parse(currentPolicy.weekly_rules);
        } catch (e) {
            console.error('解析每周规则失败:', e);
        }
    }
    
    const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const weekdayRows = weekdays.map((day, index) => {
        const dayRule = weeklyRules[index] || {};
        return `
            <tr>
                <td>
                    <label>
                        <input type="checkbox" class="weekly-enable" data-day="${index}" 
                            ${dayRule.work_end_time ? 'checked' : ''}>
                        ${day}
                    </label>
                </td>
                <td>
                    <input type="time" class="form-input weekly-work-end" data-day="${index}" 
                        value="${dayRule.work_end_time || ''}" 
                        ${dayRule.work_end_time ? '' : 'disabled'}>
                </td>
                <td>
                    <input type="time" class="form-input weekly-checkout-start" data-day="${index}" 
                        value="${dayRule.checkout_start_time || ''}" 
                        ${dayRule.checkout_start_time ? '' : 'disabled'}>
                </td>
                <td>
                    <input type="time" class="form-input weekly-checkout-end" data-day="${index}" 
                        value="${dayRule.checkout_end_time || ''}" 
                        ${dayRule.checkout_end_time ? '' : 'disabled'}>
                </td>
            </tr>
        `;
    }).join('');
    
    const content = `
        <div class="form-group">
            <label>策略名称 *</label>
            <input type="text" id="modal-policy-name" class="form-input" value="${currentPolicy.name}" required>
        </div>
        
        <h4 style="margin-top: 20px; margin-bottom: 10px; color: #333;">默认规则（适用于所有工作日）</h4>
        
        <div class="form-group">
            <label>上班时间 *</label>
            <input type="time" id="modal-work-start" class="form-input" value="${currentPolicy.work_start_time}" required>
        </div>
        <div class="form-group">
            <label>下班时间 *</label>
            <input type="time" id="modal-work-end" class="form-input" value="${currentPolicy.work_end_time}" required>
        </div>
        <div class="form-group">
            <label>上班打卡开始时间 *</label>
            <input type="time" id="modal-checkin-start" class="form-input" value="${currentPolicy.checkin_start_time}" required>
        </div>
        <div class="form-group">
            <label>上班打卡结束时间 *</label>
            <input type="time" id="modal-checkin-end" class="form-input" value="${currentPolicy.checkin_end_time}" required>
        </div>
        <div class="form-group">
            <label>下班打卡开始时间 *</label>
            <input type="time" id="modal-checkout-start" class="form-input" value="${currentPolicy.checkout_start_time}" required>
        </div>
        <div class="form-group">
            <label>下班打卡结束时间 *</label>
            <input type="time" id="modal-checkout-end" class="form-input" value="${currentPolicy.checkout_end_time}" required>
        </div>
        <div class="form-group">
            <label>迟到阈值（分钟）</label>
            <input type="number" id="modal-late-threshold" class="form-input" value="${currentPolicy.late_threshold_minutes}" min="0">
        </div>
        <div class="form-group">
            <label>早退阈值（分钟）</label>
            <input type="number" id="modal-early-threshold" class="form-input" value="${currentPolicy.early_threshold_minutes}" min="0">
        </div>
        
        <h4 style="margin-top: 20px; margin-bottom: 10px; color: #333;">每周特殊规则（可选）</h4>
        <p style="color: #666; font-size: 14px; margin-bottom: 15px;">针对特定星期设置不同的下班时间，勾选后填写即可覆盖默认规则</p>
        
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #f5f5f5;">
                    <th style="padding: 8px; text-align: left;">星期</th>
                    <th style="padding: 8px; text-align: left;">下班时间</th>
                    <th style="padding: 8px; text-align: left;">下班打卡开始</th>
                    <th style="padding: 8px; text-align: left;">下班打卡结束</th>
                </tr>
            </thead>
            <tbody>
                ${weekdayRows}
            </tbody>
        </table>
        
        <div class="form-group" style="margin-top: 20px;">
            <label>
                <input type="checkbox" id="modal-policy-active" ${currentPolicy.is_active ? 'checked' : ''}>
                启用该策略
            </label>
        </div>
    `;
    
    showModal('编辑打卡策略', content, async () => {
        const name = document.getElementById('modal-policy-name').value;
        const workStart = document.getElementById('modal-work-start').value;
        const workEnd = document.getElementById('modal-work-end').value;
        const checkinStart = document.getElementById('modal-checkin-start').value;
        const checkinEnd = document.getElementById('modal-checkin-end').value;
        const checkoutStart = document.getElementById('modal-checkout-start').value;
        const checkoutEnd = document.getElementById('modal-checkout-end').value;
        const lateThreshold = parseInt(document.getElementById('modal-late-threshold').value);
        const earlyThreshold = parseInt(document.getElementById('modal-early-threshold').value);
        const isActive = document.getElementById('modal-policy-active').checked;
        
        if (!name || !workStart || !workEnd) {
            alert('请填写必填项');
            return;
        }
        
        // 收集每周规则
        const weeklyRulesData = {};
        document.querySelectorAll('.weekly-enable:checked').forEach(checkbox => {
            const day = checkbox.getAttribute('data-day');
            const workEnd = document.querySelector(`.weekly-work-end[data-day="${day}"]`).value;
            const checkoutStart = document.querySelector(`.weekly-checkout-start[data-day="${day}"]`).value;
            const checkoutEnd = document.querySelector(`.weekly-checkout-end[data-day="${day}"]`).value;
            
            if (workEnd || checkoutStart || checkoutEnd) {
                weeklyRulesData[day] = {};
                if (workEnd) weeklyRulesData[day].work_end_time = workEnd;
                if (checkoutStart) weeklyRulesData[day].checkout_start_time = checkoutStart;
                if (checkoutEnd) weeklyRulesData[day].checkout_end_time = checkoutEnd;
            }
        });
        
        try {
            await apiRequest(`/attendance/policies/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name,
                    work_start_time: workStart,
                    work_end_time: workEnd,
                    checkin_start_time: checkinStart,
                    checkin_end_time: checkinEnd,
                    checkout_start_time: checkoutStart,
                    checkout_end_time: checkoutEnd,
                    late_threshold_minutes: lateThreshold,
                    early_threshold_minutes: earlyThreshold,
                    weekly_rules: Object.keys(weeklyRulesData).length > 0 ? JSON.stringify(weeklyRulesData) : null,
                    is_active: isActive
                })
            });
            
            closeModal();
            alert('更新成功');
            loadPolicies();
        } catch (error) {
            alert('更新失败: ' + error.message);
        }
    });
    
    // 添加事件监听器：勾选/取消勾选时启用/禁用输入框
    setTimeout(() => {
        document.querySelectorAll('.weekly-enable').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const day = this.getAttribute('data-day');
                const isEnabled = this.checked;
                document.querySelector(`.weekly-work-end[data-day="${day}"]`).disabled = !isEnabled;
                document.querySelector(`.weekly-checkout-start[data-day="${day}"]`).disabled = !isEnabled;
                document.querySelector(`.weekly-checkout-end[data-day="${day}"]`).disabled = !isEnabled;
            });
        });
    }, 100);
}

function deletePolicy(id) {
    if (confirm('确定要删除该策略吗？')) {
        apiRequest(`/attendance/policies/${id}`, { method: 'DELETE' })
            .then(() => {
                alert('删除成功');
                loadPolicies();
            })
            .catch(error => alert('删除失败: ' + error.message));
    }
}

// ==================== 请假/加班详情 ====================
window.viewLeaveDetail = async function(id) {
    const leave = await apiRequest(`/leave/${id}`);
    const users = await apiRequest('/users/');
    const userMap = {};
    users.forEach(u => userMap[u.id] = u.real_name);
    
    const content = `
        <div style="line-height: 1.8;">
            <p><strong>申请人：</strong>${userMap[leave.user_id]}</p>
            <p><strong>开始日期：</strong>${formatDate(leave.start_date)}</p>
            <p><strong>结束日期：</strong>${formatDate(leave.end_date)}</p>
            <p><strong>天数：</strong>${leave.days}天</p>
            <p><strong>原因：</strong>${leave.reason}</p>
            <p><strong>状态：</strong><span class="status-badge status-${getLeaveStatusClass(leave.status)}">${getLeaveStatusName(leave.status)}</span></p>
            <hr style="margin: 16px 0; border: none; border-top: 1px solid #E5E5EA;">
            ${leave.dept_approver_id ? `
                <p><strong>部门主任审批：</strong></p>
                <p>审批人：${userMap[leave.dept_approver_id]}</p>
                <p>时间：${formatDateTime(leave.dept_approved_at)}</p>
                <p>意见：${leave.dept_comment || '无'}</p>
            ` : ''}
            ${leave.vp_approver_id ? `
                <hr style="margin: 16px 0; border: none; border-top: 1px solid #E5E5EA;">
                <p><strong>副总审批：</strong></p>
                <p>审批人：${userMap[leave.vp_approver_id]}</p>
                <p>时间：${formatDateTime(leave.vp_approved_at)}</p>
                <p>意见：${leave.vp_comment || '无'}</p>
            ` : ''}
            ${leave.gm_approver_id ? `
                <hr style="margin: 16px 0; border: none; border-top: 1px solid #E5E5EA;">
                <p><strong>总经理审批：</strong></p>
                <p>审批人：${userMap[leave.gm_approver_id]}</p>
                <p>时间：${formatDateTime(leave.gm_approved_at)}</p>
                <p>意见：${leave.gm_comment || '无'}</p>
            ` : ''}
        </div>
    `;
    
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>请假详情</h3>
                    <button class="modal-close" onclick="closeModal()">×</button>
                </div>
                <div class="modal-content">
                    ${content}
                </div>
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="closeModal()">关闭</button>
                </div>
            </div>
        </div>
    `;
    modalContainer.style.display = 'flex';
}

window.viewOvertimeDetail = async function(id) {
    const overtime = await apiRequest(`/overtime/${id}`);
    const users = await apiRequest('/users/');
    const userMap = {};
    users.forEach(u => userMap[u.id] = u.real_name);
    
    const content = `
        <div style="line-height: 1.8;">
            <p><strong>申请人：</strong>${userMap[overtime.user_id]}</p>
            <p><strong>开始时间：</strong>${formatDateTime(overtime.start_time)}</p>
            <p><strong>结束时间：</strong>${formatDateTime(overtime.end_time)}</p>
            <p><strong>天数：</strong>${overtime.days}天</p>
            <p><strong>原因：</strong>${overtime.reason}</p>
            <p><strong>状态：</strong><span class="status-badge status-${overtime.status}">${getOvertimeStatusName(overtime.status)}</span></p>
            ${overtime.approver_id ? `
                <hr style="margin: 16px 0; border: none; border-top: 1px solid #E5E5EA;">
                <p><strong>审批信息：</strong></p>
                <p>审批人：${userMap[overtime.approver_id]}</p>
                <p>时间：${formatDateTime(overtime.approved_at)}</p>
                <p>意见：${overtime.comment || '无'}</p>
            ` : ''}
        </div>
    `;
    
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>加班详情</h3>
                    <button class="modal-close" onclick="closeModal()">×</button>
                </div>
                <div class="modal-content">
                    ${content}
                </div>
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="closeModal()">关闭</button>
                </div>
            </div>
        </div>
    `;
    modalContainer.style.display = 'flex';
}

// 初始化
window.addEventListener('DOMContentLoaded', () => {
    const savedToken = getToken();
    if (savedToken) {
        // 验证token是否有效
        apiRequest('/users/me')
            .then(user => {
                // 检查用户角色，只有ADMIN才能登录admin后台
                // role可能是字符串 "admin" 或枚举对象
                const userRole = String(user.role || '').toLowerCase();
                if (userRole !== 'admin') {
                    clearToken();
                    showPage('login');
                    return;
                }
                currentUser = user;
                document.getElementById('current-user-name').textContent = user.real_name;
                showPage('main');
                loadDashboard();
            })
            .catch(() => {
                clearToken();
                showPage('login');
            });
    } else {
        showPage('login');
    }

    // 设置默认日期
    const today = new Date().toISOString().split('T')[0];
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 考勤记录默认日期（仅在自定义日期模式下设置）
    const attendanceStartDate = document.getElementById('attendance-start-date');
    const attendanceEndDate = document.getElementById('attendance-end-date');
    if (attendanceStartDate && attendanceEndDate) {
        attendanceStartDate.value = lastWeek;
        attendanceEndDate.value = today;
    }
    
    // 设置默认月份为当前月
    const attendanceMonth = document.getElementById('attendance-month');
    if (attendanceMonth) {
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        attendanceMonth.value = monthStr;
    }
    document.getElementById('stats-start-date').value = lastMonth;
    document.getElementById('stats-end-date').value = today;
});

// ==================== 节假日管理 ====================

// 加载节假日列表
async function loadHolidays() {
    try {
        // 先获取所有节假日记录，用于提取年份
        const allHolidays = await apiRequest('/holidays/');
        
        // 从所有记录中提取年份
        const years = new Set();
        allHolidays.forEach(holiday => {
            if (holiday.date) {
                const year = holiday.date.split('-')[0];
                if (year) {
                    years.add(year);
                }
            }
        });
        
        // 将年份排序（从大到小）
        const sortedYears = Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
        
        // 更新年份下拉菜单
        const yearFilter = document.getElementById('holiday-year-filter');
        const currentValue = yearFilter.value;
        
        yearFilter.innerHTML = '<option value="">全部年份</option>';
        sortedYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = `${year}年`;
            yearFilter.appendChild(option);
        });
        
        // 恢复之前选中的年份
        if (currentValue && sortedYears.includes(currentValue)) {
            yearFilter.value = currentValue;
        } else if (sortedYears.length > 0) {
            // 如果没有选中或选中的年份不存在，默认选择第一个年份
            yearFilter.value = sortedYears[0];
        }
        
        // 按选中的年份筛选显示
        const selectedYear = yearFilter.value;
        let filteredHolidays = allHolidays;
        if (selectedYear) {
            filteredHolidays = allHolidays.filter(holiday => {
                const year = holiday.date ? holiday.date.split('-')[0] : '';
                return year === selectedYear;
            });
        }
        
        const tbody = document.getElementById('holidays-table-body');
        
        if (filteredHolidays.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px;">
                        <div style="color: #999;">暂无节假日配置</div>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = filteredHolidays.map(holiday => `
            <tr>
                <td>${holiday.id}</td>
                <td>${holiday.date}</td>
                <td>${holiday.name}</td>
                <td>
                    <span class="badge badge-${holiday.type === 'holiday' || holiday.type === 'company_holiday' ? 'danger' : 'success'}">
                        ${holiday.type === 'holiday' ? '休息日（法定节假日）' : holiday.type === 'company_holiday' ? '休息日（公司节假日）' : '调休工作日'}
                    </span>
                </td>
                <td>${holiday.description || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick='showEditHolidayModal(${JSON.stringify(holiday)})'>编辑</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteHoliday(${holiday.id})">删除</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('加载节假日失败:', error);
        alert('加载节假日失败: ' + error.message);
    }
}

// 显示添加节假日弹窗
function showAddHolidayModal() {
    const modal = document.getElementById('modal-container');
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>添加节假日</h3>
                    <button class="modal-close" onclick="closeModal()">×</button>
                </div>
                <div class="modal-content">
                    <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 8px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-bottom: 8px;">
                            <input type="radio" name="holiday-add-mode" value="single" checked onchange="toggleHolidayAddMode()">
                            <span>单个日期</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="radio" name="holiday-add-mode" value="range" onchange="toggleHolidayAddMode()">
                            <span>日期范围</span>
                        </label>
                    </div>
                    <form onsubmit="submitHolidayForm(event)" id="holiday-form">
                        <div class="form-group" id="single-date-group">
                            <label>日期 <span style="color: red;">*</span></label>
                            <input type="date" name="date" id="holiday-date" required>
                        </div>
                        <div class="form-group" id="range-date-group" style="display: none;">
                            <label>开始日期 <span style="color: red;">*</span></label>
                            <input type="date" name="start_date" id="holiday-start-date">
                        </div>
                        <div class="form-group" id="range-end-date-group" style="display: none;">
                            <label>结束日期 <span style="color: red;">*</span></label>
                            <input type="date" name="end_date" id="holiday-end-date">
                        </div>
                        <div class="form-group">
                            <label>名称 <span style="color: red;">*</span></label>
                            <input type="text" name="name" required placeholder="例如：春节、国庆节">
                        </div>
                        <div class="form-group">
                            <label>类型 <span style="color: red;">*</span></label>
                            <select name="type" required>
                                <option value="holiday">休息日（法定节假日）</option>
                                <option value="company_holiday">休息日（公司节假日）</option>
                                <option value="workday">调休工作日（周末上班）</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>说明</label>
                            <textarea name="description" rows="3" placeholder="可选"></textarea>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>
                            <button type="submit" class="btn btn-primary">保存</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

// 切换节假日添加模式（单个日期/日期范围）
window.toggleHolidayAddMode = function() {
    const mode = document.querySelector('input[name="holiday-add-mode"]:checked').value;
    const singleDateGroup = document.getElementById('single-date-group');
    const rangeDateGroup = document.getElementById('range-date-group');
    const rangeEndDateGroup = document.getElementById('range-end-date-group');
    const singleDateInput = document.getElementById('holiday-date');
    const startDateInput = document.getElementById('holiday-start-date');
    const endDateInput = document.getElementById('holiday-end-date');
    
    if (mode === 'single') {
        singleDateGroup.style.display = 'block';
        rangeDateGroup.style.display = 'none';
        rangeEndDateGroup.style.display = 'none';
        singleDateInput.required = true;
        startDateInput.required = false;
        endDateInput.required = false;
    } else {
        singleDateGroup.style.display = 'none';
        rangeDateGroup.style.display = 'block';
        rangeEndDateGroup.style.display = 'block';
        singleDateInput.required = false;
        startDateInput.required = true;
        endDateInput.required = true;
    }
}

// 显示编辑节假日弹窗
function showEditHolidayModal(holiday) {
    const modal = document.getElementById('modal-container');
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>编辑节假日</h3>
                    <button class="modal-close" onclick="closeModal()">×</button>
                </div>
                <form onsubmit="submitEditHolidayForm(event, ${holiday.id})">
                    <div class="form-group">
                        <label>日期</label>
                        <input type="text" value="${holiday.date}" disabled>
                        <small style="color: #999;">日期不可修改</small>
                    </div>
                    <div class="form-group">
                        <label>名称 *</label>
                        <input type="text" name="name" value="${holiday.name}" required>
                    </div>
                    <div class="form-group">
                        <label>类型 *</label>
                        <select name="type" required>
                            <option value="holiday" ${holiday.type === 'holiday' ? 'selected' : ''}>休息日（法定节假日）</option>
                            <option value="company_holiday" ${holiday.type === 'company_holiday' ? 'selected' : ''}>休息日（公司节假日）</option>
                            <option value="workday" ${holiday.type === 'workday' ? 'selected' : ''}>调休工作日（周末上班）</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>说明</label>
                        <textarea name="description" rows="3">${holiday.description || ''}</textarea>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>
                        <button type="submit" class="btn btn-primary">保存</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

// 提交添加节假日表单
async function submitHolidayForm(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const mode = document.querySelector('input[name="holiday-add-mode"]:checked').value;
    
    try {
        if (mode === 'single') {
            // 单个日期模式
            const data = {
                date: formData.get('date'),
                name: formData.get('name'),
                type: formData.get('type'),
                description: formData.get('description') || null
            };
            
            if (!data.date) {
                showToast('请选择日期', 'warning');
                return;
            }
            
            await apiRequest('/holidays/', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            showToast('添加成功！', 'success');
        } else {
            // 日期范围模式
            const batch = {
                start_date: formData.get('start_date'),
                end_date: formData.get('end_date'),
                name: formData.get('name'),
                type: formData.get('type'),
                description: formData.get('description') || null
            };
            
            if (!batch.start_date || !batch.end_date) {
                showToast('请选择开始日期和结束日期', 'warning');
                return;
            }
            
            if (batch.start_date > batch.end_date) {
                showToast('开始日期不能晚于结束日期', 'warning');
                return;
            }
            
            const result = await apiRequest('/holidays/batch', {
                method: 'POST',
                body: JSON.stringify(batch)
            });
            
            showToast(`成功添加 ${result.length} 个节假日！`, 'success');
        }
        
        closeModal();
        loadHolidays();
    } catch (error) {
        showToast('添加失败: ' + error.message, 'error');
    }
}

// 提交编辑节假日表单
async function submitEditHolidayForm(event, holidayId) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = {
        name: formData.get('name'),
        type: formData.get('type'),
        description: formData.get('description') || null
    };

    try {
        await apiRequest(`/holidays/${holidayId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        showToast('修改成功！', 'success');
        closeModal();
        loadHolidays();
    } catch (error) {
        showToast('修改失败: ' + error.message, 'error');
    }
}

// 删除节假日
async function deleteHoliday(holidayId) {
    showConfirmDialog(
        '删除节假日',
        '确定要删除这个节假日配置吗？删除后无法恢复。',
        async () => {
            try {
                await apiRequest(`/holidays/${holidayId}`, {
                    method: 'DELETE'
                });
                showToast('删除成功！', 'success');
                loadHolidays();
            } catch (error) {
                showToast('删除失败: ' + error.message, 'error');
            }
        }
    );
}

// 删除请假申请
async function deleteLeaveApplication(leaveId) {
    if (!confirm('确定要删除这个已取消的请假申请吗？删除后无法恢复！')) {
        return;
    }

    try {
        await apiRequest(`/leave/${leaveId}/delete`, {
            method: 'DELETE'
        });
        alert('删除成功！');
        loadLeaveApplications();
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// 删除加班申请
async function deleteOvertimeApplication(overtimeId) {
    if (!confirm('确定要删除这个已取消的加班申请吗？删除后无法恢复！')) {
        return;
    }

    try {
        await apiRequest(`/overtime/${overtimeId}/delete`, {
            method: 'DELETE'
        });
        alert('删除成功！');
        loadOvertimeApplications();
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}


