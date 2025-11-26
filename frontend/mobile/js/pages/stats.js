/**
 * 统计页面模块
 */
import { getMyStatistics } from '../api/statistics.js';

/**
 * 加载我的统计信息
 */
export async function loadMyStats() {
    try {
        const monthInput = document.getElementById('stats-month');
        if (!monthInput) return;
        
        if (!monthInput.value) {
            const now = new Date();
            monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        const [year, month] = monthInput.value.split('-');
        const startDate = `${year}-${month}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        const stats = await getMyStatistics(startDate, endDate);
        const container = document.getElementById('stats-cards');

        if (!stats || stats.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><p>暂无统计数据</p></div>';
            return;
        }

        // 渲染统计卡片（简化版，实际应该从原app.js中提取完整逻辑）
        container.innerHTML = stats.map(stat => {
            return `
                <div class="stat-card">
                    <div class="stat-label">${stat.period}</div>
                    <div class="stat-value">${stat.total_days || 0}天</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载统计信息失败:', error);
        const container = document.getElementById('stats-cards');
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p>加载失败，请稍后重试</p></div>';
    }
}

// 导出到全局
window.loadMyStats = loadMyStats;

