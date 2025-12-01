/**
 * 应用主入口
 * 初始化应用并加载所有模块
 */
import { API_BASE_URL, getToken, clearToken, setCurrentUser } from './config.js';
import { getCurrentUser as apiGetCurrentUser } from './api/auth.js';
import { showPage, showSection } from './pages/navigation.js';
import { showToast } from './utils/toast.js';
import { setDefaultOverviewDate, fixUsernameInputKeyboard } from './utils/dom.js';
import { startClock } from './utils/time.js';
import { handleLogin, updateUserInfo } from './pages/auth.js';

// 导出到全局，供HTML中的onclick使用
window.API_BASE_URL = API_BASE_URL;
window.showPage = showPage;
window.showSection = showSection;
window.showToast = showToast;

// 动态加载页面模块
const pageModules = {
    'home': () => import('./pages/home.js'),
    'attendance': () => import('./pages/attendance.js'),
    'attendance-overview': () => import('./pages/attendance.js'),
    'leave': () => import('./pages/leave.js'),
    'overtime': () => import('./pages/overtime.js'),
    'approval': () => import('./pages/approval.js'),
    'stats': () => import('./pages/stats.js')
};

// 加载页面数据
window.loadSectionData = async function(section) {
    const moduleLoader = pageModules[section];
    if (moduleLoader) {
        const module = await moduleLoader();
        const handlers = {
            'home': 'loadHomeData',
            'attendance': 'loadAttendanceByMonth',
            'attendance-overview': 'loadAttendanceOverview',
            'leave': 'loadMyLeaveApplications',
            'overtime': 'loadMyOvertimeApplications',
            'approval': 'loadPendingApprovals',
            'stats': 'loadMyStats'
        };
        
        const handlerName = handlers[section];
        if (handlerName && module[handlerName]) {
            module[handlerName]();
        }
    }
};

// 初始化
window.addEventListener('DOMContentLoaded', async () => {
    // 启动时钟
    startClock();
    
    // 设置默认日期
    setDefaultOverviewDate();
    
    // 修复用户名输入框
    fixUsernameInputKeyboard();
    
    // 绑定登录表单
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorEl = document.getElementById('login-error');

            try {
                await handleLogin(username, password);
                errorEl.textContent = '';
            } catch (error) {
                errorEl.textContent = error.message;
            }
        });
    }
    
    // 检查是否已登录
    const savedToken = getToken();
    if (savedToken) {
        try {
            const user = await apiGetCurrentUser();
            setCurrentUser(user);
            updateUserInfo();
            showPage('main');
            showSection('home');
        } catch (error) {
            clearToken();
            showPage('login');
        }
    } else {
        showPage('login');
    }

    // 点击其他地方关闭用户菜单
    document.addEventListener('click', (e) => {
        const userMenu = document.getElementById('user-menu');
        const userAvatar = document.querySelector('.user-avatar');
        if (userMenu && userAvatar && !userMenu.contains(e.target) && !userAvatar.contains(e.target)) {
            userMenu.classList.remove('active');
        }
    });
});

// 导出供其他模块使用
export { showPage, showSection, showToast };

