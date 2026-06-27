# 部署指南

考勤系统服务器部署指南，包含服务管理、日志查看和故障排查。

## 快速部署

### 1. 环境准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要软件
sudo apt install -y python3 python3-pip python3-venv git
```

### 2. 部署代码

```bash
# 进入网站目录
cd /www/wwwroot

# 克隆代码
git clone https://github.com/ourpurple/Attendance.git attendance-system
cd attendance-system
```

### 3. 创建虚拟环境

```bash
# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 4. 配置环境变量

```bash
# 创建 .env 文件
cat > .env << EOF
APP_NAME=考勤请假系统
DEBUG=False
DATABASE_URL=sqlite:///./attendance.db
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
CORS_ORIGINS=["https://your-domain.com","http://your-domain.com"]
AMAP_API_KEY=your-amap-api-key
WECHAT_APPID=your-wechat-appid
WECHAT_SECRET=your-wechat-secret
EOF

# 设置文件权限
chmod 600 .env
```

### 5. 初始化数据库

```bash
source venv/bin/activate
python3 init_db.py
```

### 6. 设置文件权限

```bash
# 创建 www 用户（如果不存在）
sudo groupadd -f www
sudo useradd -r -g www -s /bin/false www 2>/dev/null || true

# 设置项目目录所有者
sudo chown -R www:www /www/wwwroot/attendance-system

# 设置数据库文件权限
sudo chmod 664 /www/wwwroot/attendance-system/attendance.db
sudo chmod 775 /www/wwwroot/attendance-system
```

### 7. 安装服务

```bash
cd deploy
sudo bash install.sh
sudo systemctl start attendance-backend
sudo systemctl status attendance-backend
```

## 服务管理

### 使用 systemd（推荐）

```bash
# 启动服务
sudo systemctl start attendance-backend

# 停止服务
sudo systemctl stop attendance-backend

# 重启服务
sudo systemctl restart attendance-backend

# 查看状态
sudo systemctl status attendance-backend

# 开机自启
sudo systemctl enable attendance-backend

# 查看日志
sudo journalctl -u attendance-backend -f
```

### 使用管理脚本

```bash
cd /www/wwwroot/attendance-system/deploy

./start.sh    # 启动
./stop.sh     # 停止
./restart.sh  # 重启
./status.sh   # 状态
```

## 日志管理

### 查看日志

```bash
# 实时查看日志
sudo journalctl -u attendance-backend -f

# 查看最近100行
sudo journalctl -u attendance-backend -n 100

# 查看今天的日志
sudo journalctl -u attendance-backend --since today

# 查看错误日志
sudo journalctl -u attendance-backend -p err
```

## 代码更新

```bash
cd /www/wwwroot/attendance-system

# 停止服务
sudo systemctl stop attendance-backend

# 备份数据库
cp attendance.db attendance.db.backup.$(date +%Y%m%d_%H%M%S)

# 拉取最新代码
git pull origin main

# 更新依赖（如有变更）
source venv/bin/activate
pip install -r requirements.txt

# 重启服务
sudo systemctl start attendance-backend
```

## Nginx 配置

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name your-domain.com;
    root /www/wwwroot/attendance-system/frontend/mobile;
    
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    
    # API代理
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Admin管理后台
    location ~ ^/admin {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Mobile前端
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 故障排查

### 服务无法启动

```bash
# 查看服务状态
sudo systemctl status attendance-backend

# 查看详细日志
sudo journalctl -u attendance-backend -n 50

# 手动测试启动
cd /www/wwwroot/attendance-system
source venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### 数据库只读错误

```bash
# 检查文件权限
ls -l /www/wwwroot/attendance-system/attendance.db
ls -ld /www/wwwroot/attendance-system

# 修复权限
sudo chown -R www:www /www/wwwroot/attendance-system
sudo chmod 664 /www/wwwroot/attendance-system/attendance.db
sudo chmod 775 /www/wwwroot/attendance-system

# 重启服务
sudo systemctl restart attendance-backend
```

### 端口被占用

```bash
# 查找占用端口的进程
sudo lsof -i :8000
# 或
sudo netstat -tlnp | grep 8000

# 停止占用端口的进程
sudo kill -9 <PID>
```

## 备份与恢复

### 备份数据库

```bash
# 手动备份
cd /www/wwwroot/attendance-system
cp attendance.db attendance.db.backup.$(date +%Y%m%d_%H%M%S)
```

### 恢复数据库

```bash
# 停止服务
sudo systemctl stop attendance-backend

# 恢复备份
cp attendance.db.backup.20240101 attendance.db

# 设置权限
sudo chown www:www attendance.db
sudo chmod 664 attendance.db

# 启动服务
sudo systemctl start attendance-backend
```

## 注意事项

1. **文件权限**：数据库文件权限必须为 `664`，目录权限为 `775`，所有者必须为 `www:www`
2. **防火墙**：确保端口 8000 未被阻止，或使用 Nginx 反向代理
3. **定期备份**：建议每天备份数据库
4. **资源监控**：定期检查磁盘空间和内存使用情况

## 快速命令参考

```bash
# 服务管理
sudo systemctl start attendance-backend      # 启动
sudo systemctl stop attendance-backend       # 停止
sudo systemctl restart attendance-backend      # 重启
sudo systemctl status attendance-backend    # 状态

# 日志查看
sudo journalctl -u attendance-backend -f    # 实时日志
sudo journalctl -u attendance-backend -n 100 # 最近100行
```
