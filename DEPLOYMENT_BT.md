# 宝塔面板部署指南

本文档详细说明如何在宝塔面板上部署考勤与请假管理系统（后端 + Mobile前端）。

## 📋 目录

- [服务器要求](#服务器要求)
- [宝塔面板安装](#宝塔面板安装)
- [环境准备](#环境准备)
- [部署后端](#部署后端)
- [部署Mobile前端](#部署mobile前端)
- [配置域名和SSL](#配置域名和ssl)
- [进程守护](#进程守护)
- [数据库备份](#数据库备份)
- [常见问题](#常见问题)

---

## 服务器要求

### 最低配置
- CPU: 1核
- 内存: 1GB
- 硬盘: 20GB
- 操作系统: CentOS 7+ / Ubuntu 18.04+ / Debian 9+

### 推荐配置（50人规模）
- CPU: 2核
- 内存: 2GB
- 硬盘: 40GB
- 操作系统: CentOS 7.6+ / Ubuntu 20.04+

---

## 宝塔面板安装

### 1. 安装宝塔面板

访问 [宝塔官网](https://www.bt.cn/) 获取安装命令：

**CentOS:**
```bash
yum install -y wget && wget -O install.sh http://download.bt.cn/install/install_6.0.sh && sh install.sh
```

**Ubuntu/Debian:**
```bash
wget -O install.sh http://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh
```

安装完成后，记录面板地址、用户名和密码。

### 2. 登录宝塔面板

在浏览器中访问面板地址，使用安装时显示的账号密码登录。

### 3. 安装必要软件

在宝塔面板中，点击 **软件商店**，安装以下软件：

- **Nginx** (推荐 1.20+)
- **Python项目管理器** (或 **PM2管理器**)
- **MySQL** (可选，如果使用SQLite可跳过)

---

## 环境准备

### 1. 创建网站目录

在宝塔面板中：

1. 点击 **文件** → 进入 `/www/wwwroot/` 目录
2. 创建新目录：`attendance-system`
3. 上传项目文件到此目录，或使用Git克隆：

```bash
# 在终端中执行（或使用宝塔终端）
cd /www/wwwroot/
git clone <your-repo-url> attendance-system
# 或直接上传代码压缩包并解压
```

### 2. 安装Python依赖

在宝塔面板中：

1. 点击 **软件商店** → 搜索 **Python项目管理器** → 安装
2. 打开 **Python项目管理器**
3. 点击 **添加Python项目**

**配置信息：**
- **项目名称**: `attendance-backend`
- **项目路径**: `/www/wwwroot/attendance-system`
- **Python版本**: 选择 Python 3.8+ (推荐 3.9 或 3.10)
- **框架**: `其他`
- **启动文件**: `backend/main:app`
- **端口**: `8000`
- **启动方式**: `uvicorn`

**启动命令：**
```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

**依赖安装：**
在项目路径下执行：
```bash
cd /www/wwwroot/attendance-system
pip3 install -r requirements.txt
```

---

## 部署后端

### 1. 配置环境变量

在宝塔面板中：

1. 进入 **文件** → `/www/wwwroot/attendance-system/`
2. 创建 `.env` 文件
3. 编辑 `.env` 文件，添加以下内容：

```env
# 应用配置
APP_NAME=考勤请假系统
APP_VERSION=1.0.0
DEBUG=False

# 数据库配置
DATABASE_URL=sqlite:///./attendance.db

# JWT配置（请务必修改为随机字符串）
SECRET_KEY=your-secret-key-change-this-to-random-string-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# CORS配置（修改为实际域名）
CORS_ORIGINS=["https://your-domain.com","http://your-domain.com"]

# 高德地图API配置（可选）
AMAP_API_KEY=your-amap-api-key

# 微信小程序配置（可选）
WECHAT_APPID=your-wechat-appid
WECHAT_SECRET=your-wechat-secret
```

**生成安全的SECRET_KEY：**
在宝塔终端中执行：
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 2. 初始化数据库

在宝塔终端中执行：

```bash
cd /www/wwwroot/attendance-system
python3 init_db.py
```

### 3. 设置文件权限

在宝塔面板中：

1. 进入 **文件** → `/www/wwwroot/attendance-system/`
2. 选中 `attendance.db` 文件
3. 点击 **权限** → 设置为 `644` 或 `666`（确保应用可读写）

---

## 部署Mobile前端

### 1. 创建网站

在宝塔面板中：

1. 点击 **网站** → **添加站点**
2. **域名**: 填写你的域名（如 `attendance.yourdomain.com`）
3. **备注**: `考勤系统Mobile端`
4. **根目录**: `/www/wwwroot/attendance-system/frontend/mobile`
5. **PHP版本**: 选择 **纯静态**（不需要PHP）

### 2. 配置Nginx

点击网站右侧的 **设置** → **配置文件**，修改为以下配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 修改为实际域名
    index index.html index.htm;
    root /www/wwwroot/attendance-system/frontend/mobile;

    # 日志
    access_log /www/wwwlogs/attendance-access.log;
    error_log /www/wwwlogs/attendance-error.log;

    # 客户端最大上传大小
    client_max_body_size 10M;

    # API代理到后端
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Mobile前端
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态文件缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 禁止访问隐藏文件
    location ~ /\. {
        deny all;
    }
}
```

### 3. 保存并重载Nginx

1. 点击 **保存**
2. 点击 **重载配置**

---

## 配置域名和SSL

### 1. 域名解析

在域名服务商处添加A记录：
- **主机记录**: `@` 或 `attendance`（根据你的需求）
- **记录类型**: `A`
- **记录值**: 服务器IP地址
- **TTL**: `600` 或默认

### 2. 配置SSL证书

在宝塔面板中：

1. 点击网站右侧的 **设置** → **SSL**
2. 选择 **Let's Encrypt** → 勾选域名 → 点击 **申请**
3. 申请成功后，勾选 **强制HTTPS**

### 3. 更新CORS配置

SSL配置完成后，更新 `.env` 文件中的 `CORS_ORIGINS`：

```env
CORS_ORIGINS=["https://your-domain.com","http://your-domain.com"]
```

然后重启Python项目。

---

## 进程守护

### 方法1：使用Python项目管理器（推荐）

在宝塔面板中：

1. 打开 **Python项目管理器**
2. 找到 `attendance-backend` 项目
3. 确保项目状态为 **运行中**
4. 点击 **设置** → 勾选 **开机自启**

### 方法2：使用PM2管理器

1. 安装 **PM2管理器**
2. 创建启动脚本 `/www/wwwroot/attendance-system/start.sh`：

```bash
#!/bin/bash
cd /www/wwwroot/attendance-system
source /www/server/python_manager/venv/attendance-backend/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

3. 设置执行权限：
```bash
chmod +x /www/wwwroot/attendance-system/start.sh
```

4. 在PM2管理器中添加项目：
   - **名称**: `attendance-backend`
   - **启动文件**: `/www/wwwroot/attendance-system/start.sh`
   - **运行目录**: `/www/wwwroot/attendance-system`

### 方法3：使用Supervisor（命令行）

如果宝塔面板没有Python项目管理器，可以使用Supervisor：

```bash
# 安装Supervisor
yum install supervisor -y  # CentOS
# 或
apt install supervisor -y  # Ubuntu/Debian

# 创建配置文件
cat > /etc/supervisor/conf.d/attendance.conf << EOF
[program:attendance]
command=/www/server/python_manager/venv/attendance-backend/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
directory=/www/wwwroot/attendance-system
user=www
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/www/wwwlogs/attendance-backend.log
environment=PATH="/www/server/python_manager/venv/attendance-backend/bin"
EOF

# 启动服务
supervisorctl reread
supervisorctl update
supervisorctl start attendance
```

---

## 数据库备份

### 1. 使用宝塔计划任务

在宝塔面板中：

1. 点击 **计划任务**
2. 点击 **添加任务**
3. **任务类型**: 选择 **Shell脚本**
4. **任务名称**: `备份考勤数据库`
5. **执行周期**: 选择 **每天** 或 **每周**
6. **脚本内容**:

```bash
#!/bin/bash
# 备份目录
BACKUP_DIR="/www/backup/attendance"
APP_DIR="/www/wwwroot/attendance-system"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
cp $APP_DIR/attendance.db $BACKUP_DIR/attendance_$DATE.db

# 压缩备份（可选）
cd $BACKUP_DIR
tar -czf attendance_$DATE.db.tar.gz attendance_$DATE.db
rm -f attendance_$DATE.db

# 保留最近30天的备份
find $BACKUP_DIR -name "attendance_*.tar.gz" -mtime +30 -delete

echo "Backup completed: attendance_$DATE.db.tar.gz"
```

7. 点击 **添加任务**

### 2. 手动备份

在宝塔面板中：

1. 进入 **文件** → `/www/wwwroot/attendance-system/`
2. 选中 `attendance.db` 文件
3. 点击 **下载** 或 **压缩** → **下载**

---

## 常见问题

### 1. 后端无法启动

**检查步骤：**

1. 查看Python项目管理器中的日志
2. 检查 `.env` 文件是否存在且配置正确
3. 检查端口8000是否被占用：
   ```bash
   netstat -tlnp | grep 8000
   ```
4. 手动测试启动：
   ```bash
   cd /www/wwwroot/attendance-system
   source /www/server/python_manager/venv/attendance-backend/bin/activate
   python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```

### 2. 502 Bad Gateway

**可能原因：**
- 后端服务未启动
- 端口配置错误
- Nginx配置错误

**解决方法：**

1. 检查后端服务状态（Python项目管理器）
2. 检查Nginx配置中的 `proxy_pass` 地址是否为 `http://127.0.0.1:8000`
3. 查看Nginx错误日志：`/www/wwwlogs/attendance-error.log`

### 3. API请求失败（CORS错误）

**解决方法：**

1. 检查 `.env` 文件中的 `CORS_ORIGINS` 是否包含实际访问的域名
2. 确保域名格式正确（包含协议 `https://` 或 `http://`）
3. 重启Python项目

### 4. 数据库锁定错误

**解决方法：**

1. 重启Python项目
2. 如果频繁出现，考虑迁移到MySQL或PostgreSQL

### 5. 静态文件404

**解决方法：**

1. 检查Nginx配置中的 `root` 路径是否正确
2. 检查文件权限（确保Nginx用户可读）
3. 检查文件是否存在

### 6. 无法访问Mobile前端

**检查步骤：**

1. 检查域名解析是否正确
2. 检查防火墙是否开放80/443端口
3. 检查Nginx是否正常运行：
   ```bash
   systemctl status nginx
   ```
4. 查看Nginx访问日志：`/www/wwwlogs/attendance-access.log`

---

## 维护操作

### 查看日志

**后端日志：**
- Python项目管理器 → 点击项目 → 查看日志
- 或文件路径：`/www/wwwlogs/attendance-backend.log`

**Nginx日志：**
- 网站 → 设置 → 日志
- 或文件路径：
  - 访问日志：`/www/wwwlogs/attendance-access.log`
  - 错误日志：`/www/wwwlogs/attendance-error.log`

### 重启服务

**重启后端：**
- Python项目管理器 → 点击项目 → 重启

**重启Nginx：**
- 网站 → 设置 → 重载配置
- 或点击 **软件商店** → Nginx → 重启

### 更新应用

1. 备份数据库（使用计划任务或手动备份）
2. 在宝塔终端中执行：
   ```bash
   cd /www/wwwroot/attendance-system
   git pull  # 或上传新代码
   ```
3. 更新依赖（如有变更）：
   ```bash
   pip3 install -r requirements.txt
   ```
4. 重启Python项目

---

## 安全建议

1. **修改默认密码**: 部署后立即修改所有默认账号密码
2. **使用HTTPS**: 配置SSL证书（Let's Encrypt免费）
3. **定期备份**: 设置自动备份计划任务
4. **更新系统**: 定期在宝塔面板中更新系统和软件
5. **防火墙设置**: 在宝塔面板的 **安全** 中配置防火墙规则
6. **文件权限**: 确保敏感文件权限正确（`.env` 建议设置为 `600`）

---

## 性能优化

### 1. 启用Gzip压缩

在Nginx配置中添加：

```nginx
# Gzip压缩
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;
```

### 2. 静态文件缓存

已在配置中添加，确保以下配置存在：

```nginx
location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

### 3. 数据库优化

如果用户量增长，考虑迁移到MySQL：

1. 在宝塔面板中安装MySQL
2. 创建数据库和用户
3. 修改 `.env` 中的 `DATABASE_URL`：
   ```env
   DATABASE_URL=mysql://username:password@localhost:3306/attendance
   ```
4. 安装MySQL驱动：
   ```bash
   pip3 install pymysql
   ```
5. 重新初始化数据库

---

## 微信小程序配置

### 1. 修改小程序API地址

编辑 `miniprogram/app.js`，修改 `apiBaseUrl`：

```javascript
globalData: {
    apiBaseUrl: 'https://your-domain.com/api'  // 改为实际域名
}
```

### 2. 微信公众平台配置

1. 登录[微信公众平台](https://mp.weixin.qq.com/)
2. 进入 **开发** → **开发设置**
3. 配置服务器域名：
   - **request合法域名**: `https://your-domain.com`
   - **uploadFile合法域名**: `https://your-domain.com`
   - **downloadFile合法域名**: `https://your-domain.com`

### 3. 配置微信登录

在 `.env` 文件中配置：

```env
WECHAT_APPID=your-wechat-appid
WECHAT_SECRET=your-wechat-secret
```

---

## 快速检查清单

部署完成后，请检查以下项目：

- [ ] 后端服务正常运行（Python项目管理器显示"运行中"）
- [ ] 可以访问 `https://your-domain.com` 看到Mobile前端
- [ ] API请求正常（打开浏览器开发者工具，检查Network）
- [ ] 登录功能正常
- [ ] SSL证书已配置并强制HTTPS
- [ ] 数据库备份计划任务已设置
- [ ] 文件权限正确（`.env` 为 `600`，其他文件为 `644`）
- [ ] 防火墙规则已配置（开放80、443端口）

---

## 技术支持

如遇到问题，请检查：

1. **后端日志**: Python项目管理器 → 日志
2. **Nginx日志**: 网站 → 设置 → 日志
3. **系统日志**: 宝塔面板 → 日志
4. **防火墙**: 宝塔面板 → 安全

---

**提示**: 本指南针对宝塔面板优化，适合快速部署和维护。建议在生产环境使用前进行充分测试。

