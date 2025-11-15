# 微信小程序调试指南

## 一、开发环境准备

### 1. 安装微信开发者工具
- 下载地址：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
- 选择稳定版（Stable Build）下载安装

### 2. 导入项目
1. 打开微信开发者工具
2. 选择"导入项目"
3. 选择 `miniprogram` 目录作为项目目录
4. 填写 AppID：
   - **测试开发**：选择"测试号"或"不校验合法域名"
   - **正式发布**：需要注册小程序并获取 AppID

### 3. 配置后端API地址
修改 `app.js` 中的 `apiBaseUrl`：
```javascript
globalData: {
  apiBaseUrl: 'http://localhost:8000/api'  // 本地开发
  // apiBaseUrl: 'https://your-domain.com/api'  // 生产环境
}
```

**注意**：小程序正式版要求使用 HTTPS，且需要在微信公众平台配置合法域名。

## 二、调试工具使用

### 1. 控制台调试（Console）

#### 查看日志
- 打开微信开发者工具
- 点击底部"调试器"标签
- 选择"Console"面板
- 查看 `console.log()`、`console.error()`、`console.warn()` 输出

#### 常用调试代码
```javascript
// 在页面或组件中添加
console.log('变量值:', variable);
console.log('对象:', JSON.stringify(obj, null, 2));
console.error('错误信息:', error);
console.warn('警告信息:', warning);

// 查看全局数据
console.log('用户信息:', getApp().globalData.userInfo);
console.log('Token:', getApp().globalData.token);
```

#### 示例：在 `pages/index/index.js` 中添加调试
```javascript
onShow() {
  console.log('首页显示，Token:', app.globalData.token);
  console.log('用户信息:', app.globalData.userInfo);
  
  if (!app.globalData.token) {
    console.warn('未登录，跳转到登录页');
    wx.redirectTo({
      url: '/pages/login/login'
    });
    return;
  }
  
  this.loadTodayAttendance();
}
```

### 2. 网络请求调试（Network）

#### 查看网络请求
1. 打开"调试器" → "Network" 面板
2. 刷新页面或执行操作
3. 查看所有网络请求：
   - **Request**：请求详情（URL、方法、参数、Headers）
   - **Response**：响应数据
   - **Timing**：请求耗时

#### 常见问题排查
- **请求失败**：检查 URL 是否正确、网络是否连通
- **401 错误**：Token 过期或无效，需要重新登录
- **404 错误**：API 路径错误
- **CORS 错误**：后端未配置跨域（小程序不受 CORS 限制，但需要配置合法域名）

#### 添加请求日志
在 `app.js` 的 `request` 方法中添加：
```javascript
request(options) {
  return new Promise((resolve, reject) => {
    const { url, method = 'GET', data = {} } = options;
    
    // 添加请求日志
    console.log('📤 请求:', method, url, data);
    
    wx.request({
      url: `${this.globalData.apiBaseUrl}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': this.globalData.token ? `Bearer ${this.globalData.token}` : ''
      },
      success: (res) => {
        console.log('✅ 响应:', res.statusCode, res.data);
        
        if (res.statusCode === 401) {
          this.logout();
          reject({ message: '未授权，请重新登录' });
        } else if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(res.data);
        } else {
          console.error('❌ 错误响应:', res);
          reject(res.data);
        }
      },
      fail: (err) => {
        console.error('❌ 请求失败:', err);
        reject(err);
      }
    });
  });
}
```

### 3. 存储调试（Storage）

#### 查看本地存储
1. 打开"调试器" → "Storage" 面板
2. 查看 `localStorage` 中的数据
3. 可以手动修改或删除数据

#### 常用存储操作
```javascript
// 查看存储
console.log('Token:', wx.getStorageSync('token'));

// 清除存储（调试用）
wx.clearStorageSync();

// 查看所有存储
const info = wx.getStorageInfoSync();
console.log('存储信息:', info);
```

### 4. 页面调试（AppData）

#### 查看页面数据
1. 打开"调试器" → "AppData" 面板
2. 实时查看页面 `data` 中的数据
3. 可以手动修改数据，立即看到效果

#### 示例
在 `pages/index/index.js` 中：
```javascript
data: {
  currentTime: '00:00:00',
  checkinStatus: '未打卡',
  // ...
}
```
在 AppData 中可以实时查看和修改这些值。

### 5. WXML 调试

#### 查看元素
1. 打开"调试器" → "WXML" 面板
2. 点击页面元素，查看对应的 WXML 结构
3. 可以修改样式和属性，实时预览

## 三、真机调试

### 1. 预览调试
1. 点击工具栏"预览"按钮
2. 用微信扫码，在手机上查看
3. 手机上的操作会在开发者工具的控制台显示日志

### 2. 真机调试
1. 点击工具栏"真机调试"按钮
2. 用微信扫码连接
3. 可以在手机上查看控制台日志
4. 支持断点调试

### 3. 远程调试
1. 点击工具栏"远程调试"按钮
2. 用微信扫码连接
3. 在开发者工具中查看手机端的调试信息

## 四、常见问题排查

### 1. 无法连接后端API

**问题**：网络请求失败，提示 "request:fail" 或 "connect fail"

**解决方案**：
```javascript
// 1. 检查 API 地址是否正确
console.log('API Base URL:', app.globalData.apiBaseUrl);

// 2. 检查网络连接
wx.request({
  url: 'https://www.baidu.com',
  success: () => console.log('网络正常'),
  fail: () => console.error('网络异常')
});

// 3. 开发环境：在微信开发者工具中
// 设置 → 项目设置 → 不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书
```

### 2. 定位功能无法使用

**问题**：`wx.getLocation` 失败

**解决方案**：
```javascript
// 1. 检查权限配置
// app.json 中已配置：
// "permission": {
//   "scope.userLocation": {
//     "desc": "你的位置信息将用于打卡定位"
//   }
// }

// 2. 添加详细错误日志
wx.getLocation({
  type: 'gcj02',
  success: (res) => {
    console.log('✅ 定位成功:', res);
  },
  fail: (err) => {
    console.error('❌ 定位失败:', err);
    console.error('错误码:', err.errCode);
    console.error('错误信息:', err.errMsg);
    
    // 根据错误码处理
    if (err.errMsg.includes('auth deny')) {
      wx.showModal({
        title: '定位权限被拒绝',
        content: '请在设置中开启位置信息权限',
        showCancel: false
      });
    }
  }
});
```

### 3. 页面跳转失败

**问题**：`wx.navigateTo` 或 `wx.switchTab` 失败

**解决方案**：
```javascript
// 1. 检查页面路径是否正确
// app.json 中必须已注册该页面

// 2. switchTab 只能跳转到 tabBar 页面
wx.switchTab({
  url: '/pages/index/index'  // ✅ 正确（在 tabBar 中）
});

// 3. navigateTo 不能跳转到 tabBar 页面
wx.navigateTo({
  url: '/pages/leave/leave'  // ✅ 正确（不在 tabBar 中）
});

// 4. 添加错误处理
wx.navigateTo({
  url: '/pages/leave/leave',
  success: () => console.log('跳转成功'),
  fail: (err) => {
    console.error('跳转失败:', err);
    wx.showToast({
      title: '页面不存在',
      icon: 'none'
    });
  }
});
```

### 4. 数据不更新

**问题**：修改 `data` 后页面不刷新

**解决方案**：
```javascript
// 1. 必须使用 setData 更新数据
this.setData({
  checkinStatus: '已打卡'
});

// 2. 不能直接修改
// this.data.checkinStatus = '已打卡';  // ❌ 错误

// 3. 检查 setData 是否成功
this.setData({
  checkinStatus: '已打卡'
}, () => {
  console.log('数据更新成功:', this.data.checkinStatus);
});
```

### 5. 登录状态丢失

**问题**：刷新后需要重新登录

**解决方案**：
```javascript
// 1. 检查 token 是否保存
onLaunch() {
  const token = wx.getStorageSync('token');
  console.log('启动时 Token:', token);
  
  if (token) {
    this.globalData.token = token;
    this.checkLoginStatus();
  }
}

// 2. 检查登录状态验证
checkLoginStatus() {
  wx.request({
    url: `${this.globalData.apiBaseUrl}/users/me`,
    header: {
      'Authorization': `Bearer ${this.globalData.token}`
    },
    success: (res) => {
      console.log('登录状态检查:', res.statusCode);
      if (res.statusCode === 200) {
        this.globalData.userInfo = res.data;
      } else {
        console.warn('Token 无效，清除登录状态');
        this.logout();
      }
    },
    fail: (err) => {
      console.error('登录状态检查失败:', err);
      this.logout();
    }
  });
}
```

## 五、调试技巧

### 1. 使用断点调试
1. 在代码行号左侧点击，设置断点
2. 执行到断点处会暂停
3. 可以查看变量值、调用栈
4. 使用 F10（单步跳过）、F11（单步进入）继续执行

### 2. 条件断点
```javascript
// 只在特定条件下暂停
if (userId === 123) {
  debugger;  // 断点
}
```

### 3. 性能分析
1. 打开"调试器" → "Performance" 面板
2. 点击"开始录制"
3. 执行操作
4. 点击"停止录制"
5. 查看性能分析报告

### 4. 内存分析
1. 打开"调试器" → "Memory" 面板
2. 点击"Take Heap Snapshot"
3. 查看内存使用情况

### 5. 代码片段
在微信开发者工具中：
1. 点击"工具" → "代码片段"
2. 创建代码片段，方便测试特定功能

## 六、调试配置

### 1. 项目设置
在微信开发者工具中：
- **设置** → **项目设置**
- ✅ 不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书（开发环境）
- ✅ 不校验安全域名和 TLS 版本（开发环境）

### 2. 编译设置
- **编译模式**：选择"普通编译"或"自定义编译"
- **编译条件**：可以设置启动页面和参数

### 3. 模拟器设置
- 可以选择不同的设备型号
- 可以模拟不同的网络环境（2G/3G/4G/WiFi）

## 七、调试清单

### 开发阶段
- [ ] 控制台无错误和警告
- [ ] 网络请求正常
- [ ] 页面跳转正常
- [ ] 数据更新正常
- [ ] 登录状态保持
- [ ] 定位功能正常

### 测试阶段
- [ ] 真机预览正常
- [ ] 真机调试正常
- [ ] 不同设备测试
- [ ] 不同网络环境测试
- [ ] 权限申请正常

### 发布前
- [ ] 移除所有 `console.log`（或使用条件编译）
- [ ] 配置合法域名
- [ ] 测试 HTTPS 连接
- [ ] 检查错误处理
- [ ] 性能优化

## 八、快速调试命令

在控制台中可以执行：
```javascript
// 查看全局数据
getApp().globalData

// 查看当前页面数据
getCurrentPages()[getCurrentPages().length - 1].data

// 清除所有存储
wx.clearStorageSync()

// 查看存储信息
wx.getStorageInfoSync()

// 手动触发页面刷新
getCurrentPages()[getCurrentPages().length - 1].onShow()
```

## 九、常见错误代码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 10001 | 系统错误 | 检查后端服务是否正常 |
| 10002 | 网络错误 | 检查网络连接和 API 地址 |
| 10003 | 参数错误 | 检查请求参数是否正确 |
| 10004 | 权限错误 | 检查用户权限和 Token |
| 10005 | 业务错误 | 查看具体错误信息 |

## 十、获取帮助

1. **微信开发者文档**：https://developers.weixin.qq.com/miniprogram/dev/framework/
2. **微信开放社区**：https://developers.weixin.qq.com/community/
3. **问题反馈**：在开发者工具中点击"帮助" → "反馈问题"

---

**提示**：开发时建议开启"不校验合法域名"，发布前记得关闭并配置正确的域名。

