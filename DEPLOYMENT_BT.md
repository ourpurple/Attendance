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
git clone https://github.com/ourpurple/Attendance.git attendance-system
git pull https://github.com/ourpurple/Attendance attendance-system
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
- **启动方式**: 选择 **命令行启动**（推荐）或 **gunicorn**

**启动方式选择：**

#### 方案1：命令行启动（推荐，最简单）

1. **启动方式**: 选择 **命令行启动**
2. **启动文件/启动命令**: 填写完整命令：
   ```bash
   uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```

#### 方案2：Gunicorn（适合生产环境，性能更好）

1. **启动方式**: 选择 **gunicorn**
2. **启动文件**: `backend.main:app`
3. **绑定地址**: `0.0.0.0:8000`
4. **进程数**: `4`（根据服务器配置调整，建议CPU核心数×2）
5. **Worker类型**: `uvicorn.workers.UvicornWorker`

**注意**: 如果使用Gunicorn，需要先安装gunicorn：
```bash
cd /www/wwwroot/attendance-system
pip3 install gunicorn
```

#### 方案3：uWSGI（不推荐，主要用于Django）

本项目使用FastAPI，不推荐使用uWSGI。

**依赖安装：**
在项目路径下执行：
```bash
cd /www/wwwroot/attendance-system
pip3 install -r requirements.txt

# 如果使用Gunicorn方案，还需要安装：
pip3 install gunicorn
```

**重要提示：bcrypt版本兼容性**

如果安装依赖时遇到bcrypt版本兼容性问题（如 `AttributeError: module 'bcrypt' has no attribute '__about__'`），请执行：

```bash
# 卸载旧版本bcrypt
pip3 uninstall bcrypt -y

# 安装兼容版本
pip3 install bcrypt==3.2.0
```

`requirements.txt` 中已固定bcrypt版本为3.2.0，与passlib 1.7.4兼容。

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
3. **备注**: `考勤系统（Mobile + Admin）`
4. **根目录**: `/www/wwwroot/attendance-system/frontend/mobile`（默认根目录，实际通过 location 配置同时服务 mobile 和 admin）
5. **PHP版本**: 选择 **纯静态**（不需要PHP）

**说明**：
- 根目录设置为 `mobile`，但通过 Nginx 配置可以同时访问：
  - Mobile前端：`/` 或 `/mobile/`
  - Admin后台：`/admin/`
  - API接口：`/api/`

### 2. 配置Nginx

点击网站右侧的 **设置** → **配置文件**，修改为以下配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 修改为实际域名或IP
    index index.html index.htm;
    root /www/wwwroot/attendance-system/frontend/mobile;

    # SSL 配置标识（宝塔自动配置 SSL 时需要）
    #error_page 404/404.html;
    #error_page 502/502.html;
    #error_page 503/503.html;
    #CERT-APPLY-CHECK--START
    # 注意：请勿删除或修改下一行带注释的过期规则，否则脚本无法正常续期
    # 过期规则会自动添加在下面
    #CERT-APPLY-CHECK--END

    # 日志
    access_log /www/wwwlogs/attendance-access.log;
    error_log /www/wwwlogs/attendance-error.log;

    # 客户端最大上传大小
    client_max_body_size 10M;

    # API代理到后端（重要：必须在其他location之前）
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
        
        # CORS 头（如果需要）
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
        
        # 处理 OPTIONS 请求
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # Admin管理后台 - 使用正则匹配所有 /admin 开头的路径（优先级最高）
    location ~ ^/admin {
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

    # Mobile 静态文件缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
        root /www/wwwroot/attendance-system/frontend/mobile;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 禁止访问隐藏文件
    location ~ /\. {
        deny all;
    }
}
```

**重要提示：**
- `location /api` 必须在其他 location 之前，否则 API 请求会被前端路由拦截
- `location /admin` 必须在 `location /` 之前，否则 admin 请求会被 mobile 路由拦截
- 如果使用 IP 访问，将 `server_name` 改为服务器 IP 或使用 `_`（匹配所有域名）
- 访问地址：
  - Mobile前端：`http://your-domain.com/` 或 `http://your-domain.com/mobile/`
  - Admin后台：`http://your-domain.com/admin/`
  - API接口：`http://your-domain.com/api/`

**当前配置说明：**

当前使用的是**正则匹配 + 直接代理到后端**的方案（已验证有效）：
- 使用 `location ~ ^/admin` 正则匹配，确保所有 `/admin` 开头的路径都被捕获
- 正则匹配的优先级高于普通前缀匹配，会优先于 `location /` 匹配
- Admin 的所有请求（包括静态文件）都通过 Nginx 代理到后端 FastAPI
- 后端 FastAPI 的 `app.mount("/admin", StaticFiles(...))` 会自动处理静态文件
- 避免了 Nginx 路径映射的复杂问题

**关键点：**
- 必须使用正则匹配 `location ~ ^/admin`，不能使用 `location /admin` 或 `location /admin/`
- 正则匹配 `~` 的优先级高于普通前缀匹配，确保 `/admin/app.js` 等子路径不会被 `location /` 捕获

**紧急修复步骤（如果还是不行）：**

1. **首先测试后端是否正常**（在服务器上执行）：
   ```bash
   # 测试后端是否能正常返回 admin 页面
   curl http://127.0.0.1:8000/admin/
   
   # 测试静态文件
   curl http://127.0.0.1:8000/admin/style.css
   curl http://127.0.0.1:8000/admin/app.js
   ```
   
   如果这些命令返回 404 或错误，说明后端配置有问题，需要检查：
   - 后端服务是否运行
   - `frontend/admin/` 目录是否存在
   - 后端日志是否有错误

2. **如果后端正常，但 Nginx 还是不行，使用这个终极方案**：
   
   完全替换 Admin 相关配置为以下内容（注意：正则匹配 `~` 的优先级高于普通匹配）：
   
   ```nginx
   # Admin管理后台 - 使用正则匹配（优先级最高，匹配所有 /admin 开头的路径）
   location ~ ^/admin {
       proxy_pass http://127.0.0.1:8000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       
       proxy_connect_timeout 60s;
       proxy_send_timeout 60s;
       proxy_read_timeout 60s;
   }
   ```
   
   保存后，**测试 Nginx 配置**：
   ```bash
   nginx -t
   ```
   
   如果测试通过，重载配置：
   ```bash
   nginx -s reload
   ```
   
   或者在宝塔面板中：**网站** → **设置** → **重载配置**

3. **检查 Nginx 配置顺序**：
   
   确保配置顺序是：
   1. `location /api` （最前）
   2. `location ~ ^/admin` （正则匹配，优先级高）
   3. `location /` （最后，兜底）
   
   正则匹配 `~` 的优先级高于普通前缀匹配，所以 `location ~ ^/admin` 会优先于 `location /` 匹配。

4. **如果还是不行，查看详细日志**：
   ```bash
   # 查看 Nginx 错误日志
   tail -f /www/wwwlogs/attendance-error.log
   
   # 查看后端日志（在 Python 项目管理器中）
   ```
   
   然后访问 `http://oa.ruoshui-edu.cn/admin/`，观察日志输出。

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

1. **确保配置文件包含 SSL 标识**：
   - 在网站配置文件中，确保包含以下标识（已在配置模板中添加）：
     ```nginx
     #error_page 404/404.html;
     #CERT-APPLY-CHECK--START
     #CERT-APPLY-CHECK--END
     ```
   - 如果没有，请手动添加到 `server` 块的开头

2. **申请 SSL 证书**：
   - 点击网站右侧的 **设置** → **SSL**
   - 选择 **Let's Encrypt** → 勾选域名 → 点击 **申请**
   - 如果提示"未找到标识信息"，请先添加上述标识，保存配置后再申请

3. **启用 HTTPS**：
   - 申请成功后，勾选 **强制HTTPS**
   - 点击 **保存**

**如果自动配置失败，可以手动添加 SSL 配置**：

在 `server` 块中添加以下配置（在 `listen 80;` 之后）：

```nginx
# HTTP 重定向到 HTTPS
if ($server_port !~ 443){
    rewrite ^(/.*)$ https://$host$1 permanent;
}

# HTTPS 配置
listen 443 ssl http2;
ssl_certificate /www/server/panel/vhost/cert/your-domain.com/fullchain.pem;
ssl_certificate_key /www/server/panel/vhost/cert/your-domain.com/privkey.pem;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
```

**注意**：将 `your-domain.com` 替换为实际域名，证书路径通常在 `/www/server/panel/vhost/cert/域名/` 目录下。

### 3. 更新CORS配置

SSL配置完成后，更新 `.env` 文件中的 `CORS_ORIGINS`：

```env
# 如果使用域名访问
CORS_ORIGINS=["https://your-domain.com","http://your-domain.com"]

# 如果使用IP访问，也需要添加IP
CORS_ORIGINS=["https://your-domain.com","http://your-domain.com","http://your-server-ip","https://your-server-ip"]

# 或者允许所有来源（仅用于测试，生产环境不推荐）
CORS_ORIGINS=["*"]
```

**注意**：
- 如果使用 IP 访问，必须将 IP 地址添加到 `CORS_ORIGINS`
- 域名格式必须包含协议（`http://` 或 `https://`）
- 修改后需要重启 Python 项目才能生效

---

## 进程守护

### 使用Python项目管理器（推荐，已内置进程守护）

**Python项目管理器已经内置了进程守护功能**，无需额外配置。它会自动：
- 监控进程状态
- 进程崩溃时自动重启
- 支持开机自启

#### 管理项目

在宝塔面板中：

1. 打开 **Python项目管理器**
2. 找到 `attendance-backend` 项目
3. 可以执行以下操作：
   - **启动/停止**: 点击项目右侧的 **启动** 或 **停止** 按钮
   - **重启**: 点击 **重启** 按钮
   - **查看日志**: 点击 **日志** 按钮查看运行日志
   - **设置**: 点击 **设置** 按钮修改配置
   - **开机自启**: 在 **设置** 中勾选 **开机自启**

#### 不同启动方式的管理

**命令行启动方式：**
- 启动/停止/重启：直接在项目管理器中操作
- 修改启动命令：点击 **设置** → 修改 **启动文件/启动命令**

**Gunicorn启动方式：**
- 启动/停止/重启：直接在项目管理器中操作
- 修改配置：点击 **设置** → 可以修改进程数、绑定地址等
- 查看进程：Gunicorn会启动多个worker进程，可以在 **日志** 中查看

**注意事项：**
- 如果项目无法启动，请检查 **日志** 中的错误信息
- 确保端口8000未被其他程序占用
- 确保 `.env` 文件配置正确

### 其他进程守护方案（可选）

如果不想使用Python项目管理器，也可以使用以下方案：

#### 方案2：使用PM2管理器

1. 安装 **PM2管理器**（宝塔软件商店）
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

1. **查看日志**: 在Python项目管理器中点击项目的 **日志** 按钮，查看详细错误信息
2. **检查启动方式配置**:
   - 如果使用 **命令行启动**，确保启动命令完整：`uvicorn backend.main:app --host 0.0.0.0 --port 8000`
   - 如果使用 **gunicorn**，确保已安装gunicorn：`pip3 install gunicorn`
   - 确保Worker类型设置为：`uvicorn.workers.UvicornWorker`
3. **检查 `.env` 文件**: 确保文件存在且配置正确（特别是 `SECRET_KEY`）
4. **检查端口占用**:
   ```bash
   netstat -tlnp | grep 8000
   # 或使用宝塔终端执行
   ```
5. **检查依赖**: 确保所有依赖已安装：
   ```bash
   cd /www/wwwroot/attendance-system
   pip3 install -r requirements.txt
   ```
6. **手动测试启动**:
   ```bash
   cd /www/wwwroot/attendance-system
   source /www/server/python_manager/venv/attendance-backend/bin/activate
   python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```

**切换启动方式：**

如果当前启动方式有问题，可以切换到其他方式：

1. 在Python项目管理器中点击项目的 **设置**
2. 修改 **启动方式**（命令行启动 / gunicorn）
3. 根据选择的启动方式填写相应配置
4. 保存并重启项目

### 2. 502 Bad Gateway

**可能原因：**
- 后端服务未启动
- 端口配置错误
- Nginx配置错误

**解决方法：**

1. 检查后端服务状态（Python项目管理器）
2. 检查Nginx配置中的 `proxy_pass` 地址是否为 `http://127.0.0.1:8000`
3. 查看Nginx错误日志：`/www/wwwlogs/attendance-error.log`

### 3. API请求失败（CORS错误或Failed to fetch）

**错误现象：**
- 前端页面可以打开，但登录时提示 "Failed to fetch"
- 浏览器控制台显示 CORS 错误

**可能原因：**
1. 直接访问了后端 8000 端口，而不是通过 Nginx
2. Nginx API 代理配置有问题
3. CORS 配置不正确

**解决方法：**

1. **确认访问方式**：
   - ✅ 正确：通过域名访问（如 `http://your-domain.com` 或 `https://your-domain.com`）
   - ❌ 错误：直接访问后端端口（如 `http://your-ip:8000`）

2. **检查 Nginx 配置**：
   - 确保 `location /api` 的 `proxy_pass` 指向 `http://127.0.0.1:8000`
   - 确保 Nginx 配置已保存并重载

3. **检查 CORS 配置**：
   - 编辑 `.env` 文件，确保 `CORS_ORIGINS` 包含实际访问的域名：
     ```env
     CORS_ORIGINS=["https://your-domain.com","http://your-domain.com","http://your-ip"]
     ```
   - 如果使用 IP 访问，也需要添加 IP 地址

4. **测试 API 连接**：
   - 在浏览器中访问：`http://your-domain.com/api/health`
   - 应该返回：`{"status":"healthy"}`
   - 如果返回 404 或无法访问，说明 Nginx 代理配置有问题

5. **重启服务**：
   ```bash
   # 重启 Python 项目
   # 在 Python 项目管理器中点击"重启"
   
   # 重启 Nginx
   # 在宝塔面板中：网站 → 设置 → 重载配置
   ```

6. **查看错误日志**：
   - Nginx 错误日志：`/www/wwwlogs/attendance-error.log`
   - Python 项目日志：在 Python 项目管理器中点击"日志"

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

### 7. bcrypt版本兼容性错误

**错误信息：**
```
AttributeError: module 'bcrypt' has no attribute '__about__'
ValueError: password cannot be longer than 72 bytes
```

**原因：**
- bcrypt 4.0.0+版本移除了`__about__`属性，与passlib 1.7.4不兼容
- bcrypt对密码长度有72字节的限制

**解决方法：**

1. **卸载旧版本bcrypt**：
   ```bash
   cd /www/wwwroot/attendance-system
   source .venv/bin/activate  # 如果使用虚拟环境
   pip3 uninstall bcrypt -y
   ```

2. **安装兼容版本**：
   ```bash
   pip3 install bcrypt==3.2.0
   ```

3. **重新初始化数据库**：
   ```bash
   python3 init_db.py
   ```

**注意**：`requirements.txt` 中已固定bcrypt版本为3.2.0，重新安装依赖时会自动安装正确版本。

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

### 1. 使用Gunicorn提升性能（推荐生产环境）

如果当前使用 **命令行启动**，建议切换到 **Gunicorn** 以获得更好的性能：

1. 安装Gunicorn：
   ```bash
   cd /www/wwwroot/attendance-system
   pip3 install gunicorn
   ```

2. 在Python项目管理器中修改项目设置：
   - **启动方式**: 选择 **gunicorn**
   - **启动文件**: `backend.main:app`
   - **绑定地址**: `0.0.0.0:8000`
   - **进程数**: `4`（建议设置为CPU核心数×2，例如2核服务器设置为4）
   - **Worker类型**: `uvicorn.workers.UvicornWorker`

3. 保存并重启项目

**性能对比：**
- **命令行启动（uvicorn）**: 单进程，适合开发和小规模使用
- **Gunicorn**: 多进程，可以充分利用多核CPU，适合生产环境

### 2. 启用Gzip压缩

在Nginx配置中添加：

```nginx
# Gzip压缩
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;
```

### 3. 静态文件缓存

已在配置中添加，确保以下配置存在：

```nginx
location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

### 4. 数据库优化

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

### 2. 微信公众平台配置 ⚠️ **重要：必须配置，否则小程序无法登录**

1. 登录[微信公众平台](https://mp.weixin.qq.com/)
2. 进入 **开发** → **开发设置**
3. 找到 **服务器域名** 配置
4. 配置以下域名（将 `your-domain.com` 替换为实际域名，如 `oa.ruoshui-edu.cn`）：
   - **request合法域名**: `https://your-domain.com`（必须配置，否则无法登录）
   - **uploadFile合法域名**: `https://your-domain.com`（如果上传文件需要）
   - **downloadFile合法域名**: `https://your-domain.com`（如果下载文件需要）

**重要提示**：
- ✅ 必须使用 HTTPS（不能是 HTTP）
- ✅ 不需要加 `/api` 后缀
- ✅ 不需要加端口号
- ✅ 配置后需要等待几分钟生效
- ✅ 开发环境可以开启"不校验合法域名"进行测试

**如果小程序无法登录，请优先检查此项配置！**

详细排查步骤请参考：`miniprogram/LOGIN_TROUBLESHOOTING.md`

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

