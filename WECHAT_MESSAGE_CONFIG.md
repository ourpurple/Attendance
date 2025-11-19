# 微信小程序审批消息推送功能配置指南

## 目录
- [一、在微信公众平台配置订阅消息模板](#一在微信公众平台配置订阅消息模板)
- [二、在 .env 文件中配置模板ID](#二在-env-文件中配置模板id)
- [三、在小程序代码中替换模板ID占位符](#三在小程序代码中替换模板id占位符)
- [四、模板字段映射说明](#四模板字段映射说明)
- [五、验证配置](#五验证配置)
- [六、常见问题](#六常见问题)
- [七、配置检查清单](#七配置检查清单)

---

## 一、在微信公众平台配置订阅消息模板

### 步骤1：登录微信公众平台
1. 访问 [微信公众平台](https://mp.weixin.qq.com/)
2. 使用小程序管理员账号登录
3. 选择你的小程序

### 步骤2：进入订阅消息配置
1. 在左侧菜单中找到 **功能** → **订阅消息**
2. 点击 **公共模板库** 或 **我的模板**

### 步骤3：选择/创建审批提醒模板

在公共模板库中搜索"审批"或"待办"相关的模板，选择一个合适的模板，或者创建自定义模板。

**模板字段（待审批通知）：**
- `name1`：申请人（类型：name）
- `time2`：申请时间（类型：time，示例：2024-02-01 09:00）
- `thing4`：申请项目（类型：thing，可填写"普通请假/加班调休/年假调休/主动加班/被动加班"）
- `thing11`：事由（类型：thing，用于填写加班或请假的原因）
- `phrase16`：审核状态（类型：phrase，示例：待审批/待副总审批等）

> 系统会根据申请类型自动填充 `普通请假/加班调休/年假调休/主动加班/被动加班` 等值，你也可以在模板中自定义说明。

**模板标题示例：** `待审批通知`

**模板内容示例：**
```
申请人：{{name1.DATA}}
申请时间：{{time2.DATA}}
申请项目：{{thing4.DATA}}
事由：{{thing11.DATA}}
审核状态：{{phrase16.DATA}}
```

### 步骤4：选择/创建审批结果通知模板

同样在公共模板库中选择或创建审批结果通知模板。

**模板字段（审批结果通知）：**
- `thing14`：申请人（类型：thing，显示申请人姓名）
- `thing28`：审批事项（类型：thing，示例：普通请假/主动加班等）
- `phrase1`：审批结果（类型：phrase，示例：已通过/已拒绝）
- `name2`：审批人（类型：name，示例：李经理）
- `date3`：审批日期（类型：date，示例：2024-02-03）

> 申请事项字段同样会按照 `普通请假/加班调休/年假调休/主动加班/被动加班` 自动填充。

**模板标题示例：** `您的申请审批已完成`

**模板内容示例：**
```
申请类型：{{thing1.DATA}}
审批结果：{{thing2.DATA}}
审批人：{{thing3.DATA}}
审批意见：{{thing4.DATA}}
```

### 步骤5：获取模板ID
1. 在"我的模板"中查看已添加的模板
2. 复制每个模板的**模板ID**（格式类似：`xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`）
3. 记录两个模板ID：
   - **审批提醒模板ID**
   - **审批结果通知模板ID**

---

## 二、在 .env 文件中配置模板ID

### 步骤1：找到 .env 文件
在项目根目录找到 `.env` 文件（如果不存在，创建它）

### 步骤2：添加配置项
在 `.env` 文件中添加以下配置：

```env
# 微信小程序配置（如果已有，在下面添加模板ID）
WECHAT_APPID=your_wechat_appid
WECHAT_SECRET=your_wechat_secret

# 订阅消息模板ID配置
WECHAT_APPROVAL_TEMPLATE_ID=你的审批提醒模板ID
WECHAT_RESULT_TEMPLATE_ID=你的审批结果通知模板ID
```

**完整示例：**
```env
WECHAT_APPID=wx1234567890abcdef
WECHAT_SECRET=abcdef1234567890abcdef1234567890
WECHAT_APPROVAL_TEMPLATE_ID=abc123def456ghi789jkl012mno345pqr678
WECHAT_RESULT_TEMPLATE_ID=xyz789uvw456rst123opq890mno345klm678
```

### 步骤3：验证配置
确保：
- ✅ 模板ID没有多余的空格
- ✅ 模板ID是完整的字符串（通常32个字符）
- ✅ 文件编码为 UTF-8

---

## 三、在小程序代码中替换模板ID占位符

### 步骤1：在 `app.js` 中配置统一模板ID

打开 `miniprogram/app.js`，在 `globalData.subscribeTemplateIds` 中填入真实模板ID，并确保 `requestSubscribeMessage` 方法存在：

```javascript
App({
  globalData: {
    subscribeTemplateIds: [
      '审批提醒模板ID',
      '审批结果通知模板ID'
    ]
  },

  requestSubscribeMessage(extraTemplateIds = []) {
    const ids = extraTemplateIds.length ? extraTemplateIds : this.globalData.subscribeTemplateIds;
    // ... 统一调用 wx.requestSubscribeMessage
  }
});
```

后续所有页面直接调用 `app.requestSubscribeMessage()` 即可保证弹窗来自用户点击。

### 步骤2：`miniprogram/pages/login/login.js`

找到 `requestSubscribeMessage` 方法（约第14行），替换模板ID：

**修改前：**
```javascript
const tmplIds = [
  'YOUR_APPROVAL_TEMPLATE_ID',  // 审批提醒模板ID，需要在微信公众平台获取
  'YOUR_RESULT_TEMPLATE_ID'     // 审批结果通知模板ID，需要在微信公众平台获取
];
```

**修改后：**
```javascript
const tmplIds = [
  '你的审批提醒模板ID',      // 替换为实际的模板ID
  '你的审批结果通知模板ID'    // 替换为实际的模板ID
];
```

**完整示例：**
```javascript
const tmplIds = [
  'abc123def456ghi789jkl012mno345pqr678',  // 审批提醒模板ID
  'xyz789uvw456rst123opq890mno345klm678'   // 审批结果通知模板ID
];
```

### 步骤3：`miniprogram/pages/approval/approval.js`

找到 `requestSubscribeMessage` 方法（约第89行），同样替换：

**修改前：**
```javascript
requestSubscribeMessage() {
  return app.requestSubscribeMessage();
}
```

### 步骤4：提交/审批按钮中主动触发订阅

为确保一定弹出授权，在以下页面的按钮点击过程中已经调用 `app.requestSubscribeMessage()`：

- `miniprogram/pages/leave/apply/apply.js` → `submitForm`（提交请假时触发）
- `miniprogram/pages/overtime/apply/apply.js` → `submitForm`（提交加班时触发）
- `miniprogram/pages/approval/approval.js` → `approveLeave` / `approveOvertime`（审批前触发）

如需在其他按钮（如撤销、再次提交）中提醒，可同样调用 `await app.requestSubscribeMessage();`。

---

## 四、模板字段映射说明

### 审批提醒模板字段映射（待审批通知）

后端代码（`backend/services/wechat_message.py` → `send_approval_notification`）发送的数据：

```python
data = {
    "name1": {"value": applicant_name},           # 申请人
    "time2": {"value": application_time},         # 申请时间（例如：2024-02-01 09:30）
    "thing4": {"value": application_item},        # 申请项目（普通请假/加班调休/年假调休/主动加班/被动加班）
    "thing11": {"value": reason},                 # 事由
    "phrase16": {"value": status_text}            # 审核状态（待审批/待副总审批等）
}
```

### 审批结果通知模板字段映射

后端代码（`send_approval_result_notification`）发送的数据：

```python
data = {
    "thing14": {"value": applicant_name},     # 申请人
    "thing28": {"value": application_item},   # 审批事项
    "phrase1": {"value": result_text},        # 审批结果（已通过/已拒绝）
    "name2": {"value": approver_name},        # 审批人
    "date3": {"value": approval_date}         # 审批日期
}
```

> ⚠️ 如果模板字段名与上述不同，请在 `backend/services/wechat_message.py` 中调整对应的数据结构。

---

## 五、验证配置

### 1. 检查后端配置
```bash
# 确保 .env 文件中有模板ID配置
cat .env | grep WECHAT
```

### 2. 检查小程序配置
- 打开 `miniprogram/pages/login/login.js`
- 确认模板ID已替换（不是 `YOUR_APPROVAL_TEMPLATE_ID`）
- 打开 `miniprogram/pages/approval/approval.js`
- 确认模板ID已替换

### 3. 测试流程
1. 启动后端服务
2. 在小程序中登录（会弹出订阅消息授权）
3. 提交一个请假或加班申请
4. 检查审批人是否收到订阅消息
5. 审批后检查申请人是否收到结果通知

---

## 六、常见问题

### Q1：模板ID在哪里找？
**A：** 微信公众平台 → 功能 → 订阅消息 → 我的模板 → 查看模板ID

### Q2：模板字段名不匹配怎么办？
**A：** 修改 `backend/services/wechat_message.py` 中 `data` 字典的 key，使其与模板配置一致。

**示例：** 如果模板中使用的是 `name1`、`name2`，而不是 `thing1`、`thing2`，需要修改代码：
```python
data = {
    "name1": {"value": applicant_name},
    "name2": {"value": "请假"},
    # ...
}
```

### Q3：用户拒绝订阅消息怎么办？
**A：** 这是正常情况。代码已经处理了这种情况，不会影响主流程。用户可以在小程序设置中重新授权。

### Q4：消息发送失败怎么办？
**A：** 检查以下几点：
- ✅ 模板ID是否正确
- ✅ 用户是否已授权订阅消息
- ✅ 微信配置（APPID、SECRET）是否正确
- ✅ 查看后端日志中的错误信息

### Q5：如何查看订阅消息发送日志？
**A：** 查看后端日志，会记录：
- ✅ 成功发送的消息
- ✅ 用户拒绝的消息（errcode: 43101）
- ✅ 其他错误信息

### Q6：订阅消息授权有效期是多久？
**A：** 用户授权后，可以发送多次消息，但建议定期重新请求授权（代码已在登录时自动请求）。

### Q7：如何修改模板字段名？
**A：** 如果微信模板中的字段名与代码中的不一致，需要修改以下文件：
- `backend/services/wechat_message.py` 中的 `send_approval_notification` 函数（约第164行）
- `backend/services/wechat_message.py` 中的 `send_approval_result_notification` 函数（约第200行）

### Q8：消息推送失败会影响主流程吗？
**A：** 不会。代码中已经用 try-except 包裹了消息推送逻辑，即使推送失败也不会影响申请和审批的正常流程。

---

## 七、配置检查清单

完成以下所有步骤后，功能即可正常使用：

- [ ] 在微信公众平台创建了审批提醒模板
- [ ] 在微信公众平台创建了审批结果通知模板
- [ ] 获取了两个模板的模板ID
- [ ] 在 `.env` 文件中配置了 `WECHAT_APPROVAL_TEMPLATE_ID`
- [ ] 在 `.env` 文件中配置了 `WECHAT_RESULT_TEMPLATE_ID`
- [ ] 在 `miniprogram/pages/login/login.js` 中替换了模板ID
- [ ] 在 `miniprogram/pages/approval/approval.js` 中替换了模板ID
- [ ] 验证了模板字段名与代码中的字段名匹配
- [ ] 测试了消息推送功能

---

## 相关文件清单

### 后端文件
- `backend/config.py` - 配置文件（已添加模板ID配置项）
- `backend/services/wechat_message.py` - 消息推送服务（需要检查字段名）
- `backend/routers/leave.py` - 请假接口（已集成消息推送）
- `backend/routers/overtime.py` - 加班接口（已集成消息推送）

### 小程序文件
- `miniprogram/pages/login/login.js` - 登录页面（需要替换模板ID）
- `miniprogram/pages/approval/approval.js` - 审批页面（需要替换模板ID）

### 配置文件
- `.env` - 环境变量配置（需要添加模板ID）

---

## 功能说明

### 消息推送时机

1. **申请创建时**
   - 请假/加班申请创建后，自动给第一个审批人发送审批提醒消息

2. **审批流转时**
   - 请假申请：部门主任审批通过后，如果还需要副总审批，给副总发送消息
   - 请假申请：副总审批通过后，如果还需要总经理审批，给总经理发送消息

3. **审批完成时**
   - 审批通过或拒绝后，给申请人发送审批结果通知

### 审批流程说明

**请假申请流程：**
- 1天：部门主任 → 完成
- 1-3天：部门主任 → 副总 → 完成
- 3天以上：部门主任 → 副总 → 总经理 → 完成

**加班申请流程：**
- 所有加班：部门主任 → 完成

---

## 技术支持

如果遇到问题，请检查：
1. 微信公众平台配置是否正确
2. 模板ID是否正确配置
3. 后端日志中的错误信息
4. 小程序控制台中的错误信息

---

**最后更新：** 2024年
**版本：** 1.0



