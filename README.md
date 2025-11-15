# 考勤与请假管理系统

一个功能完整的考勤与请假管理系统，包含管理后台、移动端前端和微信小程序客户端。

> **📢 重要更新（2024-11-15）**：加班统计已改为按天数计算！请查看 [升级指南](./UPGRADE_GUIDE.md) 了解如何升级。

## 系统特性

### 核心功能

1. **考勤管理**
   - 上下班打卡（支持地理位置定位）
   - **工作日限制**（智能识别周末、法定节假日、调休日）[详情](./FEATURE_WORKDAY_CHECK.md)
   - **节假日管理**（支持配置法定节假日和调休工作日，已预置2025年数据）
   - 打卡策略配置（上下班时间、允许打卡时段）
   - 每周差异化规则（支持每周不同日期设置不同的下班时间）
   - 迟到早退自动判定
   - 工作时长统计

2. **请假管理**
   - 多级审批流程
     - 1天以内：部门主任审批
     - 1-3天：部门主任 → 副总
     - 3天以上：部门主任 → 副总 → 总经理
   - 请假申请、撤回
   - 待审批状态可撤回
   - 审批历史记录

3. **加班管理**
   - 加班申请（半天/整天/自定义）
   - 部门主任审批
   - 待审批状态可撤回
   - 加班天数统计
     - 半天 = 0.5 天
     - 整天 = 1 天
     - 自定义 = x.5 天（如 1.5、2.5）

4. **统计分析**
   - **按月统计**：快速选择月份统计整月数据（如：2025年11月）
   - **自定义日期范围**：灵活筛选任意时间段
   - **智能应出勤计算**：自动计算实际工作日天数（排除周末和法定节假日，包含调休工作日）[详情](./FEATURE_WORKDAY_STATISTICS.md)
   - **总统计**：总员工数、出勤率、总请假天数、总加班天数
   - **出勤统计**：详细的员工考勤数据（应出勤、实际出勤、迟到、早退、缺勤、工时）
   - **请假统计**：请假天数、次数、占比分析，按请假天数排序
   - **加班统计**：加班天数、次数统计，按加班天数排序
   - 标签页切换，数据清晰分类
   - 智能筛选（自动过滤无记录员工）

5. **权限管理**
   - 五级用户角色
     - 系统管理员
     - 总经理
     - 副总
     - 部门主任
     - 普通员工
   - 基于角色的权限控制
   - **审批权限控制**
     - 普通员工：只能提交和查看自己的申请，不显示审批入口
     - 部门主任及以上：可以访问审批功能，查看并审批相关申请
     - 多层权限验证（前端 + 后端双重保护）

6. **部门管理**
   - 部门信息维护
   - 员工部门分配
   - 部门主任设置

## 技术栈

### 后端
- **FastAPI** - 现代化、高性能的Python Web框架
- **SQLite** - 轻量级数据库，适合中小规模部署
- **SQLAlchemy** - ORM框架
- **Pydantic** - 数据验证
- **JWT** - 用户认证

### 前端
- **管理后台** - 原生HTML/CSS/JavaScript，苹果现代化设计风格
- **移动端** - 响应式设计，适配手机浏览器
- **微信小程序** - 原生小程序开发

## 项目结构

```
Attendance/
├── backend/                # 后端代码
│   ├── main.py            # FastAPI应用入口
│   ├── config.py          # 配置文件
│   ├── database.py        # 数据库连接
│   ├── models.py          # 数据模型
│   ├── schemas.py         # Pydantic schemas
│   ├── security.py        # 认证和安全
│   └── routers/           # API路由
│       ├── auth.py        # 认证相关
│       ├── users.py       # 用户管理
│       ├── departments.py # 部门管理
│       ├── attendance.py  # 考勤管理
│       ├── leave.py       # 请假管理
│       ├── overtime.py    # 加班管理
│       └── statistics.py  # 统计分析
├── frontend/              # 前端代码
│   ├── admin/            # 管理后台
│   │   ├── index.html
│   │   ├── style.css
│   │   └── app.js
│   └── mobile/           # 移动端
│       ├── index.html
│       ├── style.css
│       └── app.js
├── miniprogram/          # 微信小程序
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   └── pages/
├── init_db.py            # 数据库初始化脚本
├── run.py                # 应用启动脚本
├── requirements.txt      # Python依赖
└── README.md            # 项目说明
```

## 📚 文档

- [快速启动指南](./QUICKSTART.md) - 5分钟快速部署
- [本地开发指南](./LOCAL_DEVELOPMENT.md) - 开发环境配置和日常开发流程
- [项目概览](./PROJECT_OVERVIEW.md) - 架构设计和技术细节
- [部署指南](./DEPLOYMENT.md) - 生产环境部署
- [升级指南](./UPGRADE_GUIDE.md) - 版本升级说明
- [申请撤回功能](./FEATURE_CANCEL.md) - 请假和加班申请撤回功能说明
- [统计分析模块](./FEATURE_STATISTICS.md) - 四大统计模块详细说明
- [按月统计功能](./FEATURE_MONTHLY_STATISTICS.md) - 按月快速统计功能说明
- [审批详情显示](./FEATURE_APPROVAL_DETAILS.md) - 请假和加班审批信息详细显示
- [审批权限控制](./FEATURE_APPROVAL_PERMISSION.md) - 基于角色的审批功能访问控制
- [用户删除保护](./FEATURE_USER_DELETE_PROTECTION.md) - 用户删除保护机制说明
- [每周打卡规则](./FEATURE_WEEKLY_ATTENDANCE_RULES.md) - 每周差异化打卡规则功能说明
- [更新日志](./CHANGELOG.md) - 版本变更记录

## 快速开始

### 1. 环境要求

- Python 3.8+
- pip

### 2. 创建虚拟环境（推荐）

```bash
# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

### 3. 安装依赖

```bash
# 确保虚拟环境已激活
pip install -r requirements.txt
```

### 4. 初始化数据库

```bash
python init_db.py
```

这将创建数据库表结构并插入初始数据，包括：
- 4个部门（管理部、技术部、市场部、财务部）
- 6个测试用户（管理员、总经理、副总、部门主任、普通员工）
- 默认打卡策略

### 5. 启动后端服务

```bash
# 确保虚拟环境已激活
python run.py
```

服务将在 `http://localhost:8000` 启动

### 6. 访问系统

- **API文档**: http://localhost:8000/docs
- **管理后台**: http://localhost:8000/admin
- **移动端（电脑）**: http://localhost:8000/mobile
- **移动端（手机）**: http://你的IP地址:8000/mobile

**手机访问说明：**
1. 查看电脑的 IP 地址：
   - Windows: 打开命令提示符，输入 `ipconfig`，查找 "IPv4 地址"
   - Linux/Mac: 打开终端，输入 `ifconfig` 或 `ip addr`
   
2. 确保手机和电脑在同一 WiFi 网络

3. 在手机浏览器中访问：`http://你的IP地址:8000/mobile`
   - 例如：`http://192.168.77.101:8000/mobile`

4. 如果无法访问，检查：
   - 防火墙是否允许 8000 端口
   - 手机和电脑是否在同一网络
   - 服务器是否正在运行（`python run.py`）

**注意**：系统已自动配置 API 地址，会根据访问的域名/IP 自动调整，无需手动配置。

### 7. 默认账号

#### 管理员
- 用户名: `admin`
- 密码: `admin123`

#### 总经理
- 用户名: `gm`
- 密码: `gm123`

#### 副总
- 用户名: `vp`
- 密码: `vp123`

#### 技术部主任
- 用户名: `tech_head`
- 密码: `tech123`

#### 普通员工
- 用户名: `employee1` / `employee2`
- 密码: `emp123`

## 部署指南

### 单服务器部署

由于系统设计为单服务器运行，部署非常简单：

#### 1. 服务器准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Python 3.8+
sudo apt install python3 python3-pip -y

# 克隆或上传代码到服务器
cd /opt
# 将代码上传到此目录
```

#### 2. 配置环境

```bash
cd /opt/Attendance

# 安装依赖
pip3 install -r requirements.txt

# 初始化数据库
python3 init_db.py
```

#### 3. 配置服务

创建 systemd 服务文件 `/etc/systemd/system/attendance.service`:

```ini
[Unit]
Description=Attendance System
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/Attendance
ExecStart=/usr/bin/python3 /opt/Attendance/run.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable attendance
sudo systemctl start attendance
sudo systemctl status attendance
```

#### 4. 配置Nginx反向代理（可选）

创建 `/etc/nginx/sites-available/attendance`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /admin {
        alias /opt/Attendance/frontend/admin;
        try_files $uri $uri/ /admin/index.html;
    }

    location /mobile {
        alias /opt/Attendance/frontend/mobile;
        try_files $uri $uri/ /mobile/index.html;
    }

    location / {
        return 301 /mobile;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/attendance /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 微信小程序部署

1. 使用微信开发者工具打开 `miniprogram` 目录
2. 修改 `app.js` 中的 `apiBaseUrl` 为实际的服务器地址
3. 配置小程序合法域名（在微信公众平台）
4. 上传代码并提交审核

## 开发说明

详细的本地开发指南请参考 [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)

主要内容包括：
- 虚拟环境的创建和管理
- 日常开发工作流
- 依赖管理
- 数据库操作
- 测试和调试技巧
- 常见问题解决

## 配置说明

### 环境变量

可以创建 `.env` 文件来覆盖默认配置：

```env
# 应用配置
APP_NAME=考勤请假系统
DEBUG=False

# 数据库
DATABASE_URL=sqlite:///./attendance.db

# JWT配置
SECRET_KEY=your-super-secret-key-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# CORS
CORS_ORIGINS=["https://your-domain.com"]

# 高德地图API配置（用于逆地理编码，将经纬度转换为地址）
# 获取方式：https://console.amap.com/dev/key/app
AMAP_API_KEY=your-amap-api-key
```

### 打卡策略配置

可以在管理后台的"策略管理"中配置：
- 上下班时间
- 允许打卡的时间段
- 迟到早退判定阈值
- **每周差异化规则**：针对每周不同日期设置特殊规则
  - 例如：周一至周四 17:30 下班，周五 12:00 下班
  - 支持为每周7天单独配置下班时间和打卡时段
  - 详见 [每周打卡规则功能说明](./FEATURE_WEEKLY_ATTENDANCE_RULES.md)

### 节假日管理

在管理后台的"节假日配置"中管理法定节假日和调休工作日：

**功能特点：**
- **法定节假日配置**：配置国家法定节假日，系统自动在节假日禁用打卡
- **调休工作日配置**：配置需要上班的周末（如春节调休），系统自动启用打卡
- **智能识别**：移动端自动判断当前日期是否为工作日
- **友好提示**：根据不同情况显示对应提示信息

**使用方法：**
1. 进入管理后台 → 节假日配置
2. 点击"添加节假日"按钮
3. 选择日期、输入名称（如"春节"）
4. 选择类型：
   - **休息日（法定节假日）**：节假日期间禁用打卡
   - **调休工作日（周末上班）**：周末但需要上班的日期
5. 保存后立即生效

**预置数据：**
系统已预置 2025 年全年法定节假日数据：
- 元旦、春节、清明节、劳动节、端午节、中秋节、国庆节
- 包含所有调休工作日（如春节调休周末上班）

**移动端效果：**
- 法定节假日：打卡按钮禁用，显示"今天是XX节，无需打卡"（橙色）
- 调休工作日：打卡按钮启用，显示"今天是XX调休工作日"（蓝色）
- 普通周末：打卡按钮禁用，显示"今天是周X，非工作日无需打卡"（橙色）

详见 [工作日打卡限制功能说明](./FEATURE_WORKDAY_CHECK.md)

## API文档

启动服务后访问 http://localhost:8000/docs 查看完整的API文档（Swagger UI）

主要API端点：

- `/api/auth/login` - 用户登录
- `/api/users/` - 用户管理
- `/api/departments/` - 部门管理
- `/api/attendance/` - 考勤管理
- `/api/leave/` - 请假管理
- `/api/overtime/` - 加班管理
- `/api/holidays/` - 节假日管理
- `/api/holidays/check/{date}` - 检查指定日期是否为工作日（公开接口）
- `/api/statistics/` - 统计分析

## 数据库

系统使用SQLite数据库，数据文件为 `attendance.db`

### 数据备份

```bash
# 备份数据库
cp attendance.db attendance.db.backup.$(date +%Y%m%d)

# 恢复数据库
cp attendance.db.backup.20240101 attendance.db
```

### 数据迁移

如果需要迁移到其他数据库（如MySQL、PostgreSQL），只需：

1. 修改 `backend/config.py` 中的 `DATABASE_URL`
2. 安装对应的数据库驱动
3. 重新运行 `init_db.py`

## 开发指南

### 添加新功能

1. 在 `backend/models.py` 中定义数据模型
2. 在 `backend/schemas.py` 中定义Pydantic schemas
3. 在 `backend/routers/` 中创建新的路由文件
4. 在 `backend/main.py` 中注册路由
5. 更新前端界面

### 运行开发服务器

```bash
# 后端自动重载
python run.py

# 前端直接用浏览器打开HTML文件即可
```

## 常见问题

### 1. 打卡定位不准确

- 确保浏览器/小程序有定位权限
- 可以集成第三方地图API进行逆地理编码

### 2. 数据库锁定错误

- SQLite不适合高并发场景
- 如需支持更多用户，建议迁移到MySQL/PostgreSQL

### 3. 跨域问题

- 修改 `backend/config.py` 中的 `CORS_ORIGINS`
- 或使用Nginx反向代理

## 许可证

本项目仅供学习和内部使用。

## 贡献

欢迎提交Issue和Pull Request！

## 联系方式

如有问题，请联系系统管理员。

---

**注意**: 这是一个用于50人左右小规模公司的考勤系统，已优化为单服务器部署。对于更大规模或更高性能要求，建议：

1. 使用PostgreSQL或MySQL替代SQLite
2. 添加Redis缓存
3. 使用Gunicorn + Nginx部署
4. 考虑容器化部署（Docker）
5. 添加监控和日志系统

