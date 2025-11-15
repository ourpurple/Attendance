# 部署指南

本文档详细说明如何在单台服务器上部署考勤与请假管理系统。

## 服务器要求

### 最低配置
- CPU: 1核
- 内存: 1GB
- 硬盘: 10GB
- 操作系统: Ubuntu 20.04+ / CentOS 7+ / Debian 10+

### 推荐配置（50人规模）
- CPU: 2核
- 内存: 2GB
- 硬盘: 20GB
- 操作系统: Ubuntu 22.04 LTS

## 部署步骤

### 1. 准备服务器环境

#### Ubuntu/Debian

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要的软件
sudo apt install -y python3 python3-pip python3-venv nginx git

# 安装supervisor（进程管理）
sudo apt install -y supervisor
```

#### CentOS/RHEL

```bash
# 更新系统
sudo yum update -y

# 安装必要的软件
sudo yum install -y python3 python3-pip nginx git

# 安装supervisor
sudo yum install -y supervisor
```

### 2. 创建应用用户

```bash
# 创建专用用户
sudo useradd -m -s /bin/bash attendance
sudo passwd attendance  # 设置密码（可选）

# 切换到应用用户
sudo su - attendance
```

### 3. 部署应用代码

```bash
# 克隆代码或上传代码包
cd ~
# 如果使用git
# git clone <your-repo-url> attendance-system
# 或直接上传代码到此目录

cd attendance-system

# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 初始化数据库
python init_db.py
```

### 4. 配置环境变量

创建 `.env` 文件：

```bash
nano .env
```

内容：

```env
# 应用配置
APP_NAME=考勤请假系统
DEBUG=False

# 数据库
DATABASE_URL=sqlite:///./attendance.db

# JWT配置（请务必修改为随机字符串）
SECRET_KEY=change-this-to-a-random-secret-key-in-production-min-32-chars
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# CORS（修改为实际域名）
CORS_ORIGINS=["https://your-domain.com", "http://your-domain.com"]
```

生成安全的SECRET_KEY：

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 5. 配置Supervisor（进程管理）

退出attendance用户：

```bash
exit
```

创建supervisor配置文件：

```bash
sudo nano /etc/supervisor/conf.d/attendance.conf
```

内容：

```ini
[program:attendance]
command=/home/attendance/attendance-system/venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
directory=/home/attendance/attendance-system
user=attendance
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/attendance/app.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=10
environment=PATH="/home/attendance/attendance-system/venv/bin"
```

创建日志目录：

```bash
sudo mkdir -p /var/log/attendance
sudo chown attendance:attendance /var/log/attendance
```

启动服务：

```bash
# 重新加载配置
sudo supervisorctl reread
sudo supervisorctl update

# 启动服务
sudo supervisorctl start attendance

# 查看状态
sudo supervisorctl status attendance
```

### 6. 配置Nginx反向代理

创建Nginx配置文件：

```bash
sudo nano /etc/nginx/sites-available/attendance
```

内容：

```nginx
upstream attendance_backend {
    server 127.0.0.1:8000;
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    # 日志
    access_log /var/log/nginx/attendance-access.log;
    error_log /var/log/nginx/attendance-error.log;

    # 客户端最大上传大小
    client_max_body_size 10M;

    # API代理
    location /api {
        proxy_pass http://attendance_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket支持（如果需要）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # 管理后台
    location /admin {
        alias /home/attendance/attendance-system/frontend/admin;
        try_files $uri $uri/ /admin/index.html;
        index index.html;
    }

    # 移动端
    location /mobile {
        alias /home/attendance/attendance-system/frontend/mobile;
        try_files $uri $uri/ /mobile/index.html;
        index index.html;
    }

    # 默认跳转到移动端
    location = / {
        return 301 /mobile/;
    }

    # 静态文件缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

启用配置：

```bash
# 测试配置
sudo nginx -t

# 创建软链接
sudo ln -s /etc/nginx/sites-available/attendance /etc/nginx/sites-enabled/

# 重启Nginx
sudo systemctl restart nginx

# 设置开机自启
sudo systemctl enable nginx
```

### 7. 配置SSL证书（推荐）

使用Let's Encrypt免费SSL证书：

```bash
# 安装certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书并自动配置Nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 测试自动续期
sudo certbot renew --dry-run
```

### 8. 配置防火墙

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# 或 firewalld (CentOS)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 9. 设置定时备份

创建备份脚本：

```bash
sudo nano /home/attendance/backup.sh
```

内容：

```bash
#!/bin/bash

# 备份目录
BACKUP_DIR="/home/attendance/backups"
APP_DIR="/home/attendance/attendance-system"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
cp $APP_DIR/attendance.db $BACKUP_DIR/attendance_$DATE.db

# 保留最近30天的备份
find $BACKUP_DIR -name "attendance_*.db" -mtime +30 -delete

echo "Backup completed: attendance_$DATE.db"
```

设置执行权限：

```bash
sudo chmod +x /home/attendance/backup.sh
sudo chown attendance:attendance /home/attendance/backup.sh
```

添加定时任务：

```bash
sudo crontab -u attendance -e
```

添加以下行（每天凌晨2点备份）：

```cron
0 2 * * * /home/attendance/backup.sh >> /var/log/attendance/backup.log 2>&1
```

## 微信小程序部署

### 1. 修改配置

编辑 `miniprogram/app.js`，修改API地址：

```javascript
globalData: {
    apiBaseUrl: 'https://your-domain.com/api'  // 改为实际域名
}
```

### 2. 微信公众平台配置

1. 登录[微信公众平台](https://mp.weixin.qq.com/)
2. 进入"开发" -> "开发设置"
3. 配置服务器域名：
   - request合法域名: `https://your-domain.com`
4. 配置业务域名（如需要）

### 3. 上传小程序

1. 使用微信开发者工具打开`miniprogram`目录
2. 点击"上传"
3. 填写版本号和备注
4. 在微信公众平台提交审核

## 维护操作

### 查看日志

```bash
# 应用日志
sudo tail -f /var/log/attendance/app.log

# Nginx访问日志
sudo tail -f /var/log/nginx/attendance-access.log

# Nginx错误日志
sudo tail -f /var/log/nginx/attendance-error.log

# 系统日志
sudo journalctl -u supervisor -f
```

### 重启服务

```bash
# 重启应用
sudo supervisorctl restart attendance

# 重启Nginx
sudo systemctl restart nginx

# 重启所有
sudo supervisorctl restart attendance && sudo systemctl restart nginx
```

### 更新应用

```bash
# 切换到应用用户
sudo su - attendance
cd attendance-system

# 激活虚拟环境
source venv/bin/activate

# 拉取最新代码
git pull  # 或上传新代码

# 更新依赖
pip install -r requirements.txt

# 退出
exit

# 重启服务
sudo supervisorctl restart attendance
```

### 数据库维护

```bash
# 备份数据库
cd /home/attendance/attendance-system
cp attendance.db attendance.db.backup.$(date +%Y%m%d)

# 恢复数据库
cp attendance.db.backup.20240101 attendance.db
sudo supervisorctl restart attendance
```

## 监控和告警

### 简单监控脚本

创建 `/home/attendance/monitor.sh`:

```bash
#!/bin/bash

# 检查服务状态
if ! systemctl is-active --quiet nginx; then
    echo "Nginx is down!" | mail -s "Alert: Nginx Down" admin@example.com
    systemctl start nginx
fi

# 检查应用状态
if ! supervisorctl status attendance | grep -q RUNNING; then
    echo "Attendance app is down!" | mail -s "Alert: App Down" admin@example.com
    supervisorctl restart attendance
fi

# 检查磁盘空间
DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "Disk usage is ${DISK_USAGE}%" | mail -s "Alert: High Disk Usage" admin@example.com
fi
```

添加到crontab（每5分钟检查一次）：

```bash
*/5 * * * * /home/attendance/monitor.sh
```

## 性能优化

### 1. 使用Gunicorn代替Uvicorn（可选）

安装Gunicorn：

```bash
source /home/attendance/attendance-system/venv/bin/activate
pip install gunicorn
```

修改supervisor配置：

```ini
command=/home/attendance/attendance-system/venv/bin/gunicorn backend.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### 2. Nginx缓存配置

在Nginx配置中添加：

```nginx
# 缓存配置
proxy_cache_path /var/cache/nginx/attendance levels=1:2 keys_zone=attendance_cache:10m max_size=100m inactive=60m;

location /api {
    # 缓存GET请求
    proxy_cache attendance_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_methods GET HEAD;
    proxy_cache_key "$scheme$request_method$host$request_uri";
    
    # 其他配置...
}
```

### 3. 数据库优化

如果用户增长，考虑迁移到PostgreSQL或MySQL：

```bash
# 安装PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# 创建数据库
sudo -u postgres createdb attendance
sudo -u postgres createuser attendance_user -P

# 修改.env
DATABASE_URL=postgresql://attendance_user:password@localhost/attendance

# 安装驱动
pip install psycopg2-binary

# 重新初始化数据库
python init_db.py
```

## 故障排查

### 应用无法启动

```bash
# 查看日志
sudo supervisorctl tail -f attendance stderr

# 手动测试启动
cd /home/attendance/attendance-system
source venv/bin/activate
python run.py
```

### 502 Bad Gateway

```bash
# 检查应用是否运行
sudo supervisorctl status attendance

# 检查端口监听
sudo netstat -tlnp | grep 8000

# 重启服务
sudo supervisorctl restart attendance
```

### 数据库锁定

```bash
# SQLite不支持高并发，考虑迁移到PostgreSQL
# 或重启应用释放锁
sudo supervisorctl restart attendance
```

## 安全建议

1. **修改默认密码**: 部署后立即修改所有默认账号密码
2. **使用HTTPS**: 配置SSL证书
3. **定期备份**: 设置自动备份
4. **更新系统**: 定期更新操作系统和依赖包
5. **限制访问**: 使用防火墙限制不必要的端口
6. **日志审计**: 定期检查访问日志
7. **权限控制**: 确保文件权限正确设置

## 扩展性考虑

当用户规模增长时，可以考虑：

1. **数据库分离**: 使用专用数据库服务器
2. **负载均衡**: 使用多台应用服务器
3. **Redis缓存**: 提高查询性能
4. **对象存储**: 使用云存储保存文件
5. **容器化**: 使用Docker部署
6. **监控系统**: Prometheus + Grafana

## 支持

如遇到部署问题，请检查：
- 应用日志
- Nginx日志
- 系统日志
- 防火墙设置
- 域名DNS配置

---

**提示**: 本指南针对单服务器部署优化，适合50人左右的小型团队使用。



