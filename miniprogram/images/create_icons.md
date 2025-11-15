# 创建 TabBar 图标

## 方法1：使用在线工具（推荐）

### 步骤：
1. 打开 `generate_icons_simple.html` 文件（在浏览器中打开）
2. 点击"下载未选中"和"下载选中"按钮
3. 将下载的文件放到 `miniprogram/images/` 目录

### 注意：
- 某些浏览器可能无法正确渲染 Emoji
- 如果图标显示不正确，请使用方法2或3

## 方法2：使用 Python 脚本

### 前提条件：
```bash
pip install pillow
```

### 运行：
```bash
cd miniprogram/images
python generate_icons.py
```

### 注意：
- 需要系统支持 Emoji 字体
- macOS: `/System/Library/Fonts/Apple Color Emoji.ttc`
- Windows: `C:/Windows/Fonts/seguiemj.ttf`

## 方法3：使用在线图标库（最可靠）

### 推荐网站：
1. **IconFont** (https://www.iconfont.cn/)
   - 搜索：首页、考勤、审批、我的
   - 下载 PNG 格式，81×81px

2. **Iconfinder** (https://www.iconfinder.com/)
   - 搜索对应的图标
   - 下载 PNG 格式

3. **Flaticon** (https://www.flaticon.com/)
   - 免费图标库
   - 下载 PNG 格式

### 图标对应关系：
- `home.png` / `home-active.png` - 首页图标
- `attendance.png` / `attendance-active.png` - 考勤图标
- `approval.png` / `approval-active.png` - 审批图标
- `mine.png` / `mine-active.png` - 我的图标

### 颜色要求：
- 未选中图标：使用灰色 (#8E8E93)
- 选中图标：使用蓝色 (#007AFF)

## 方法4：使用 Emoji 转图片工具

1. 访问 https://emojipng.com/ 或类似网站
2. 搜索对应的 Emoji：
   - 🏠 (home)
   - 📝 (attendance)
   - ✅ (approval)
   - 👤 (mine)
3. 下载 PNG 格式
4. 使用图片编辑工具调整颜色和尺寸

## 图标规格

- **尺寸**：81px × 81px（推荐）
- **格式**：PNG（支持透明背景）
- **大小**：单个文件不超过 40KB
- **颜色**：
  - 未选中：灰色 (#8E8E93)
  - 选中：蓝色 (#007AFF)

## 恢复图标配置

创建图标后，在 `app.json` 中恢复配置：

```json
{
  "tabBar": {
    "list": [
      {
        "pagePath": "pages/index/index",
        "text": "首页",
        "iconPath": "images/home.png",
        "selectedIconPath": "images/home-active.png"
      },
      {
        "pagePath": "pages/attendance/attendance",
        "text": "考勤",
        "iconPath": "images/attendance.png",
        "selectedIconPath": "images/attendance-active.png"
      },
      {
        "pagePath": "pages/approval/approval",
        "text": "审批",
        "iconPath": "images/approval.png",
        "selectedIconPath": "images/approval-active.png"
      },
      {
        "pagePath": "pages/mine/mine",
        "text": "我的",
        "iconPath": "images/mine.png",
        "selectedIconPath": "images/mine-active.png"
      }
    ]
  }
}
```

