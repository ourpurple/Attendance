# 考勤与请假管理系统

功能完整的考勤与请假管理系统，支持移动端网页、管理后台和微信小程序。

## 核心功能

- **考勤打卡**：上下班打卡，自动记录位置和时间，支持工作日限制和节假日管理
- **请假管理**：多级审批流程（1天以内→部门主任，1-3天→部门主任→副总，3天以上→部门主任→副总→总经理）
- **加班管理**：加班申请和审批，按天数统计（半天=0.5天，整天=1天）
- **统计分析**：按月统计或自定义日期范围，包含出勤、请假、加班统计
- **权限管理**：五级角色（系统管理员、总经理、副总、部门主任、普通员工）
- **部门管理**：部门信息维护、员工分配、部门主任设置

## 技术栈

- **后端**：FastAPI + SQLite + SQLAlchemy
- **前端**：原生HTML/CSS/JavaScript（管理后台、移动端）+ 微信小程序

## 快速开始

### 环境要求

- Python 3.8+
- pip

### 安装步骤

```bash
# 1. 创建虚拟环境
python -m venv venv

# 2. 激活虚拟环境
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 初始化数据库
python init_db.py

# 5. 启动服务
python run.py
```

### 访问系统

- **API文档**：http://localhost:8000/docs
- **管理后台**：http://localhost:8000/admin
- **移动端**：http://localhost:8000/mobile

### 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 系统管理员 | admin | admin123 |
| 总经理 | gm | gm123 |
| 副总 | vp | vp123 |
| 部门主任 | tech_head | tech123 |
| 普通员工 | employee1 | emp123 |

**首次登录后请立即修改密码！**

## 项目结构

```
Attendance/
├── backend/           # 后端代码
│   ├── main.py        # FastAPI应用入口
│   ├── routers/       # API路由
│   └── models.py      # 数据模型
├── frontend/          # 前端代码
│   ├── admin/         # 管理后台
│   └── mobile/         # 移动端
├── miniprogram/       # 微信小程序
├── deploy/            # 部署脚本
├── init_db.py         # 数据库初始化
├── run.py             # 启动脚本
└── requirements.txt   # Python依赖
```

## 配置说明

创建 `.env` 文件覆盖默认配置：

```env
# 应用配置
APP_NAME=考勤请假系统
DEBUG=False

# 数据库
DATABASE_URL=sqlite:///./attendance.db

# JWT配置（请修改为随机字符串）
SECRET_KEY=your-super-secret-key-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# CORS配置
CORS_ORIGINS=["https://your-domain.com"]

# 高德地图API（可选，用于逆地理编码）
AMAP_API_KEY=your-amap-api-key
```

## 部署

详细部署指南请参考 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

**快速部署：**

```bash
# 1. 克隆代码
git clone https://github.com/ourpurple/Attendance.git

# 2. 安装依赖
pip install -r requirements.txt

# 3. 初始化数据库
python init_db.py

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 5. 使用 systemd 部署（推荐）
cd deploy
sudo bash install.sh
sudo systemctl start attendance-backend
```

## 文档

- [部署指南](./DEPLOYMENT_GUIDE.md) - 生产环境部署说明
- [使用手册](./USER_MANUAL.md) - 用户操作指南
- [更新日志](./CHANGELOG.md) - 版本变更记录

## 常见问题

**Q: 打卡时提示"无法获取位置"？**  
A: 检查浏览器/小程序的定位权限，确保GPS已开启。

**Q: 为什么周末无法打卡？**  
A: 系统自动识别周末和法定节假日。如需周末打卡，管理员需配置为调休工作日。

**Q: 请假申请可以修改吗？**  
A: 待审批状态可以撤回后重新提交，已审批的无法修改。

**Q: 忘记密码怎么办？**  
A: 联系系统管理员在管理后台重置密码。

## 系统要求

- 适合50人以下小型企业
- 单服务器部署
- SQLite数据库（可迁移至MySQL/PostgreSQL）

## 许可证

本项目仅供学习和内部使用。
