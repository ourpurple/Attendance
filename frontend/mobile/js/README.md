# 前端模块化架构说明

## 目录结构

```
js/
├── app.js              # 应用主入口
├── config.js           # 配置和全局状态
├── api/                # API调用模块
│   └── client.js       # API客户端
├── utils/              # 工具函数模块
│   ├── dialog.js       # 对话框
│   ├── toast.js        # Toast提示
│   ├── format.js       # 格式化工具
│   └── date.js         # 日期工具
└── pages/              # 页面逻辑模块
    └── navigation.js   # 页面导航
```

## 模块说明

### config.js
全局配置和状态管理：
- API_BASE_URL: API基础URL
- currentUser: 当前用户
- token: 认证令牌
- 相关getter/setter函数

### api/client.js
统一的API请求封装：
- apiRequest(): 处理认证、错误、网络异常

### utils/
工具函数集合：
- **dialog.js**: 输入对话框
- **toast.js**: 消息提示
- **format.js**: 数据格式化（日期、时间等）
- **date.js**: 日期处理（CST时间、工作日判断）

### pages/navigation.js
页面导航和切换逻辑

## 使用方式

### 在其他模块中导入

```javascript
// 导入配置
import { API_BASE_URL, getToken, setCurrentUser } from './config.js';

// 导入API
import { apiRequest } from './api/client.js';

// 导入工具
import { showToast } from './utils/toast.js';
import { formatLeaveDate } from './utils/format.js';
```

### HTML中使用

由于HTML中使用onclick，需要通过window对象导出：

```javascript
// 在app.js中
window.showToast = showToast;
window.apiRequest = apiRequest;
```

然后在HTML中：
```html
<button onclick="showToast('消息', 'success')">点击</button>
```

## 迁移策略

1. **保持向后兼容**: 原app.js中的函数通过window导出
2. **逐步迁移**: 按功能模块逐步迁移代码
3. **测试验证**: 每个模块迁移后进行功能测试

## 注意事项

1. 使用ES6模块（`type="module"`）
2. 模块路径使用相对路径
3. 保持全局函数导出以兼容HTML中的onclick

