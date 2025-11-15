# 考勤系统微信小程序

## 说明

这是考勤系统的微信小程序客户端基础框架。

## 目录结构

```
miniprogram/
├── app.js              # 小程序主入口
├── app.json            # 小程序全局配置
├── app.wxss            # 小程序全局样式
├── pages/              # 页面目录
│   ├── index/          # 首页
│   ├── login/          # 登录页
│   ├── attendance/     # 考勤记录页
│   ├── leave/          # 请假管理页
│   ├── overtime/       # 加班管理页
│   ├── approval/       # 审批页
│   ├── stats/          # 统计页
│   └── mine/           # 个人中心页
├── images/             # 图片资源
└── sitemap.json        # 站点地图配置
```

## 使用说明

1. 下载并安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)

2. 打开微信开发者工具，选择"导入项目"

3. 选择 `miniprogram` 目录作为项目目录

4. 填写AppID（测试可使用测试号）

5. 修改 `app.js` 中的 `apiBaseUrl` 为实际的后端API地址

6. 点击"编译"即可预览

## 调试指南

详细的调试说明请查看 [DEBUG_GUIDE.md](./DEBUG_GUIDE.md)

### 快速开始调试

1. **开启调试模式**
   - 在微信开发者工具中：设置 → 项目设置
   - ✅ 勾选"不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书"

2. **查看控制台**
   - 打开底部"调试器"标签
   - 选择"Console"面板查看日志
   - 所有 API 请求会自动打印日志（📤 请求、✅ 响应、❌ 错误）

3. **真机调试**
   - 点击工具栏"预览"或"真机调试"按钮
   - 用微信扫码在手机上测试

4. **常见问题**
   - 网络请求失败：检查 `apiBaseUrl` 是否正确
   - 定位失败：检查权限配置和真机权限
   - 页面跳转失败：检查页面路径是否正确

## 功能特性

- ✅ 用户登录认证
- ✅ 上下班打卡（带定位）
- ✅ 考勤记录查看
- ✅ 请假申请
- ✅ 加班申请
- ✅ 审批流程
- ✅ 个人统计

## 注意事项

1. 小程序需要配置合法域名才能正式发布
2. 定位功能需要在微信公众平台配置相关权限
3. 请根据实际情况补充其他页面的实现
4. **图标资源**：tabBar 图标需要自行准备并放置在 `images/` 目录下
   - 当前配置为文字模式（无图标），可以正常使用
   - 如需添加图标，请参考 `images/README.md` 说明
   - 添加图标后，在 `app.json` 中恢复 `iconPath` 和 `selectedIconPath` 配置

## 后续开发

以下页面已创建基础结构，需要继续开发完善：
- pages/attendance/attendance - 考勤记录列表
- pages/leave/leave - 请假管理
- pages/leave/apply/apply - 请假申请表单
- pages/overtime/overtime - 加班管理
- pages/overtime/apply/apply - 加班申请表单
- pages/approval/approval - 审批列表
- pages/stats/stats - 统计分析
- pages/mine/mine - 个人中心



