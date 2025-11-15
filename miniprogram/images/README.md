# TabBar 图标说明

## 快速开始

**最简单的方法**：在浏览器中打开 `generate_icons_simple.html`，点击下载按钮即可生成图标。

详细说明请查看 `create_icons.md`。

## 图标要求

微信小程序 tabBar 图标需要满足以下要求：

1. **格式**：PNG 格式
2. **尺寸**：建议 81px × 81px（会被自动缩放）
3. **大小**：单个文件不超过 40KB
4. **颜色**：
   - 未选中图标：使用灰色（#8E8E93）
   - 选中图标：使用主题色（#007AFF）

## 需要的图标文件

请在 `images` 目录下放置以下图标文件：

### 首页
- `home.png` - 未选中状态
- `home-active.png` - 选中状态

### 考勤
- `attendance.png` - 未选中状态
- `attendance-active.png` - 选中状态

### 审批
- `approval.png` - 未选中状态
- `approval-active.png` - 选中状态

### 我的
- `mine.png` - 未选中状态
- `mine-active.png` - 选中状态

## 图标获取方式

### 方式1：使用图标库
推荐使用以下图标库：
- [IconFont](https://www.iconfont.cn/) - 阿里巴巴图标库
- [Iconfinder](https://www.iconfinder.com/) - 图标搜索
- [Flaticon](https://www.flaticon.com/) - 免费图标

### 方式2：使用 Emoji 转图标
可以使用 Emoji 作为图标：
- 🏠 首页
- 📝 考勤
- ✅ 审批
- 👤 我的

### 方式3：使用占位图标
开发阶段可以使用简单的占位图标，正式发布前替换为正式图标。

## 图标设计建议

1. **简洁明了**：图标应该简洁，易于识别
2. **一致性**：所有图标使用相同的设计风格
3. **对比度**：确保图标在背景上有足够的对比度
4. **尺寸**：图标内容应该居中，留出适当的边距

## 临时解决方案

如果暂时没有图标，可以：
1. 修改 `app.json`，移除 `iconPath` 和 `selectedIconPath`，只使用文字
2. 或者使用在线工具生成简单的占位图标

## 图标生成工具

可以使用以下工具快速生成图标：
- [Canva](https://www.canva.com/) - 在线设计工具
- [Figma](https://www.figma.com/) - 设计工具
- [Photoshop](https://www.adobe.com/products/photoshop.html) - 专业设计工具

