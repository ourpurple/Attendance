/**
 * 位置工具模块
 * 提供位置获取和地理编码功能
 */
import { reverseGeocode as apiReverseGeocode } from '../api/attendance.js';

/**
 * 地理编码：将经纬度转换为地址文本
 */
export async function reverseGeocode(latitude, longitude) {
    try {
        const response = await apiReverseGeocode(latitude, longitude);
        if (response && response.address) {
            return response.address;
        }
        // 如果获取失败，返回坐标
        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    } catch (error) {
        console.error('地理编码失败:', error);
        // 如果地理编码失败，返回坐标
        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
}

/**
 * 获取当前位置（优化版，支持手机定位，带重试机制）
 */
export async function getCurrentLocation(retryCount = 0) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('浏览器不支持地理定位，请使用支持定位的浏览器（如Chrome、Safari）'));
            return;
        }

        // 优化定位选项
        const options = {
            enableHighAccuracy: retryCount === 0,  // 第一次启用高精度，重试时降低精度
            timeout: retryCount === 0 ? 20000 : 10000,  // 第一次20秒，重试10秒
            maximumAge: 0  // 不使用缓存，每次都获取最新位置
        };

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude, accuracy } = position.coords;
                    
                    // 检查定位精度（如果精度太差，给出警告但继续）
                    if (accuracy > 100) {
                        console.warn(`定位精度较低: ${accuracy}米，但继续打卡`);
                    }
                    
                    // 验证坐标有效性
                    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
                        throw new Error('获取的位置坐标无效');
                    }
                    
                    // 调用地理编码API获取地址文本（不阻塞，失败时使用坐标）
                    let address = null;
                    try {
                        address = await reverseGeocode(latitude, longitude);
                    } catch (geocodeError) {
                        console.warn('地理编码失败，使用坐标:', geocodeError);
                        // 地理编码失败不影响打卡，使用坐标
                    }
                    
                    const location = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                    
                    resolve({
                        location,  // 保留坐标字符串用于兼容（必需字段）
                        address: address || location,  // 地址文本，失败时使用坐标
                        latitude: latitude,  // 纬度（可选）
                        longitude: longitude  // 经度（可选）
                    });
                } catch (error) {
                    reject(new Error('处理位置信息失败: ' + error.message));
                }
            },
            async (error) => {
                // 详细的错误信息
                let errorMessage = '无法获取位置信息';
                let shouldRetry = false;
                
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = '定位权限被拒绝\n\n解决方法：\n1. 点击浏览器地址栏左侧的锁图标\n2. 选择"位置"权限\n3. 设置为"允许"\n4. 刷新页面重试';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        if (retryCount === 0) {
                            shouldRetry = true;
                            errorMessage = 'GPS信号弱，正在尝试使用网络定位...';
                        } else {
                            errorMessage = '位置信息不可用\n\n解决方法：\n1. 检查GPS是否开启\n2. 移动到信号较好的位置\n3. 确保网络连接正常';
                        }
                        break;
                    case error.TIMEOUT:
                        if (retryCount === 0) {
                            shouldRetry = true;
                            errorMessage = '获取位置超时，正在重试...';
                        } else {
                            errorMessage = '获取位置超时\n\n解决方法：\n1. 检查网络连接\n2. 移动到信号较好的位置\n3. 确保GPS已开启\n4. 稍后重试';
                        }
                        break;
                    default:
                        errorMessage = `获取位置失败: ${error.message || '未知错误'}`;
                        break;
                }
                
                // 如果应该重试且未超过重试次数
                if (shouldRetry && retryCount < 1) {
                    console.log('定位失败，尝试降低精度重试...');
                    // 等待1秒后重试
                    setTimeout(() => {
                        getCurrentLocation(retryCount + 1)
                            .then(resolve)
                            .catch(reject);
                    }, 1000);
                } else {
                    reject(new Error(errorMessage));
                }
            },
            options
        );
    });
}

