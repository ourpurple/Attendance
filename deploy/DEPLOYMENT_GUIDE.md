# 考勤系统服务器部署指南

本文档提供完整的服务器部署方案，包括服务管理、日志记录等。

## 📋 目录

- [部署步骤](#部署步骤)
- [服务管理](#服务管理)
- [日志管理](#日志管理)
- [Git 代码管理](#git-代码管理)
- [日常维护](#日常维护)
- [故障排查](#故障排查)

---

## 部署步骤

### 1. 准备服务器环境

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y  # Ubuntu/Debian
# 或
sudo yum update -y  # CentOS

# 安装必要软件
sudo apt install -y python3 python3-pip python3-venv git  # Ubuntu/Debian
# 或
sudo yum install -y python3 python3-pip git  # CentOS
```

### 2. 部署代码

```bash
# 进入网站目录
cd /www/wwwroot

# 克隆代码
git clone https://github.com/ourpurple/Attendance.git attendance-system

# 进入项目目录
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

# 如果遇到 bcrypt 问题，先安装兼容版本
pip install bcrypt==3.2.0

pip install pydantic[email]
```

### 4. 配置环境变量

```bash
# 创建 .env 文件
cat > .env << EOF
# 应用配置
APP_NAME=考勤请假系统
APP_VERSION=1.0.0
DEBUG=False

# 数据库配置
DATABASE_URL=sqlite:///./attendance.db

# JWT配置（请务必修改为随机字符串）
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# CORS配置（修改为实际域名）
CORS_ORIGINS=["https://oa.ruoshui-edu.cn","http://oa.ruoshui-edu.cn"]

# 高德地图API配置（可选）
AMAP_API_KEY=your-amap-api-key

# 微信小程序配置（可选）
WECHAT_APPID=your-wechat-appid
WECHAT_SECRET=your-wechat-secret
EOF

# 设置文件权限
chmod 600 .env
```

### 5. 初始化数据库

```bash
# 确保虚拟环境已激活
source venv/bin/activate

# 初始化数据库
python3 init_db.py
```

### 6. 设置文件权限（重要！）

**必须设置正确的文件权限，否则会出现数据库只读错误：**

```bash
# 确保 www 用户存在（如果不存在，先创建）
sudo groupadd -f www
sudo useradd -r -g www -s /bin/false www 2>/dev/null || true

# 设置项目目录的所有者
sudo chown -R www:www /www/wwwroot/attendance-system

# 设置数据库文件和目录权限
sudo chmod 664 /www/wwwroot/attendance-system/attendance.db
sudo chmod 775 /www/wwwroot/attendance-system

# 确保数据库文件所在目录有写权限（SQLite 需要创建临时文件）
sudo chmod 775 /www/wwwroot/attendance-system

# 如果数据库文件不存在，创建它并设置权限
if [ ! -f /www/wwwroot/attendance-system/attendance.db ]; then
    sudo touch /www/wwwroot/attendance-system/attendance.db
    sudo chown www:www /www/wwwroot/attendance-system/attendance.db
    sudo chmod 664 /www/wwwroot/attendance-system/attendance.db
fi

# 设置日志目录权限（如果存在）
if [ -d /www/wwwroot/attendance-system/logs ]; then
    sudo chown -R www:www /www/wwwroot/attendance-system/logs
    sudo chmod 775 /www/wwwroot/attendance-system/logs
fi
```

**权限说明：**
- 数据库文件：`664` (rw-rw-r--) - 所有者和组可读写
- 项目目录：`775` (rwxrwxr-x) - 所有者和组可读写执行
- 日志目录：`775` (rwxrwxr-x) - 所有者和组可读写执行

### 7. 安装服务（两种方式）

#### 方式1：使用 systemd（推荐）

```bash
# 进入部署脚本目录
cd deploy

# 安装服务（需要 sudo）
sudo bash install.sh

# 启动服务
sudo systemctl start attendance-backend

# 检查状态
sudo systemctl status attendance-backend
```

#### 方式2：使用管理脚本（简单）

```bash
# 进入部署脚本目录
cd deploy

# 设置执行权限
chmod +x *.sh

# 启动服务
./start.sh
```

---

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

# 查看日志
sudo journalctl -u attendance-backend -f

# 查看最近100行日志
sudo journalctl -u attendance-backend -n 100

# 开机自启
sudo systemctl enable attendance-backend

# 取消开机自启
sudo systemctl disable attendance-backend
```

### 使用管理脚本

```bash
# 进入部署脚本目录
cd /www/wwwroot/attendance-system/deploy

# 启动服务
./start.sh

# 停止服务
./stop.sh

# 重启服务
./restart.sh

# 查看状态
./status.sh
```

---

## 日志管理

### systemd 日志

```bash
# 实时查看日志
sudo journalctl -u attendance-backend -f

# 查看今天的日志
sudo journalctl -u attendance-backend --since today

# 查看最近100行
sudo journalctl -u attendance-backend -n 100

# 查看错误日志
sudo journalctl -u attendance-backend -p err

# 查看指定时间段的日志
sudo journalctl -u attendance-backend --since "2024-01-01 00:00:00" --until "2024-01-01 23:59:59"

# 导出日志到文件
sudo journalctl -u attendance-backend > /tmp/attendance.log
```

### 直接启动方式的日志

如果使用管理脚本直接启动（不使用 systemd），日志文件位于：

```
/www/wwwroot/attendance-system/logs/app.log
```

```bash
# 实时查看日志
tail -f /www/wwwroot/attendance-system/logs/app.log

# 查看最近100行
tail -n 100 /www/wwwroot/attendance-system/logs/app.log

# 查看错误日志
grep -i error /www/wwwroot/attendance-system/logs/app.log

# 查看今天的日志
grep "$(date +%Y-%m-%d)" /www/wwwroot/attendance-system/logs/app.log
```

### 日志轮转配置

创建日志轮转配置（防止日志文件过大）：

```bash
sudo cat > /etc/logrotate.d/attendance << EOF
/www/wwwroot/attendance-system/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 www www
    sharedscripts
    postrotate
        systemctl reload attendance-backend > /dev/null 2>&1 || true
    endscript
}
EOF
```

---

## Git 代码管理

### 首次克隆代码

如果是第一次部署，需要从远程仓库克隆代码：

```bash
# 进入网站目录（或你希望存放代码的目录）
cd /www/wwwroot

# 克隆代码仓库
git clone https://github.com/ourpurple/Attendance.git attendance-system

https://bgithub.xyz

git clone https://bgithub.xyz/ourpurple/Attendance.git attendance-system


# 进入项目目录
cd attendance-system

# 查看当前分支
git branch

# 查看远程仓库信息
git remote -v
```

**说明：**
- `git clone <仓库地址> <本地目录名>`：克隆远程仓库到本地
- 如果不指定目录名，会使用仓库名作为目录名
- 克隆完成后会自动创建远程跟踪分支

### 更新代码（已存在的项目）

如果项目已经存在，需要更新到最新版本：

#### 方法1：使用 git pull（推荐）

```bash
# 进入项目目录
cd /www/wwwroot/attendance-system

# 停止服务（避免更新时服务运行）
sudo systemctl stop attendance-backend
# 或
./deploy/stop.sh

# 备份数据库（重要！）
cp attendance.db attendance.db.backup.$(date +%Y%m%d_%H%M%S)

# 查看当前状态
git status

# 拉取最新代码
git pull origin main

# 如果有本地修改，可能需要先提交或暂存
# 查看差异
git diff

# 如果有冲突，解决冲突后再继续
```

#### 方法2：使用 git fetch + git merge

```bash
# 进入项目目录
cd /www/wwwroot/attendance-system

# 停止服务
sudo systemctl stop attendance-backend

# 备份数据库
cp attendance.db attendance.db.backup.$(date +%Y%m%d_%H%M%S)

# 获取远程更新（不合并）
git fetch origin

# 查看远程更新内容
git log HEAD..origin/main

# 合并远程更新
git merge origin/main

# 或使用 rebase（保持提交历史更整洁）
# git rebase origin/main
```

### 处理本地修改

如果本地有未提交的修改，更新前需要处理：

```bash
# 查看本地修改
git status

# 方法1：暂存修改（推荐，保留修改）
git stash
git pull origin main
git stash pop  # 恢复修改

# 方法2：提交修改
git add .
git commit -m "本地修改说明"
git pull origin main

# 方法3：放弃本地修改（谨慎使用！）
git reset --hard HEAD
git pull origin main
```

### 切换到特定版本/标签

如果需要回退到特定版本：

```bash
# 查看所有标签
git tag

# 查看所有分支
git branch -a

# 切换到特定标签
git checkout <标签名>
# 例如：git checkout v1.0.0

# 切换到特定提交
git checkout <提交哈希>
# 例如：git checkout abc1234

# 切换回最新版本
git checkout main
git pull origin main
```

### 查看更新历史

```bash
# 查看提交历史
git log --oneline -10

# 查看远程更新
git fetch origin
git log HEAD..origin/main

# 查看文件变更
git diff HEAD~1  # 与上一个版本比较
git diff origin/main  # 与远程版本比较
```

### 常见问题处理

#### 1. 冲突解决

如果 `git pull` 出现冲突：

```bash
# 查看冲突文件
git status

# 手动编辑冲突文件，解决冲突标记
# <<<<<<< HEAD
# 本地代码
# =======
# 远程代码
# >>>>>>> origin/main

# 解决冲突后
git add <冲突文件>
git commit -m "解决合并冲突"
```

#### 2. 本地修改被覆盖

如果误操作导致本地修改丢失：

```bash
# 查看最近的操作记录
git reflog

# 恢复到指定操作
git reset --hard <操作哈希>
```

#### 3. 更新后需要重新安装依赖

```bash
# 激活虚拟环境
source venv/bin/activate

# 更新依赖
pip install -r requirements.txt

# 如果有新的依赖，可能需要升级
pip install --upgrade -r requirements.txt
```

### 完整更新流程示例

```bash
# 1. 进入项目目录
cd /www/wwwroot/attendance-system

# 2. 停止服务
sudo systemctl stop attendance-backend

# 3. 备份数据库
cp attendance.db attendance.db.backup.$(date +%Y%m%d_%H%M%S)

# 4. 查看当前状态
git status

# 5. 如果有本地修改，暂存它们
git stash

# 6. 拉取最新代码
git pull origin main

# 7. 恢复本地修改（如果有）
git stash pop

# 8. 更新依赖（如果 requirements.txt 有变化）
source venv/bin/activate
pip install -r requirements.txt

# 9. 运行数据库迁移（如果有新的迁移文件）
# python migrate_db.py  # 根据实际情况执行

# 10. 重启服务
sudo systemctl start attendance-backend

# 11. 检查服务状态
sudo systemctl status attendance-backend
```

### Git 配置（可选）

如果需要配置 Git 用户信息：

```bash
# 配置用户名和邮箱（仅用于提交记录）
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# 查看配置
git config --list

# 配置默认分支
git config --global init.defaultBranch main
```

---

## 日常维护

### 更新代码

详细的 Git 操作说明请参考 [Git 代码管理](#git-代码管理) 章节。

**快速更新流程：**

```bash
cd /www/wwwroot/attendance-system

# 停止服务
sudo systemctl stop attendance-backend
# 或
./deploy/stop.sh

# 备份数据库
cp attendance.db attendance.db.backup.$(date +%Y%m%d_%H%M%S)

# 拉取最新代码
git pull origin main

# 更新依赖（如果有变更）
source venv/bin/activate
pip install -r requirements.txt

# 重启服务
sudo systemctl start attendance-backend
# 或
./deploy/start.sh
```

**注意：** 如果遇到冲突或需要处理本地修改，请参考 [Git 代码管理](#git-代码管理) 章节的详细说明。

### 备份数据库

```bash
# 手动备份
cd /www/wwwroot/attendance-system
cp attendance.db attendance.db.backup.$(date +%Y%m%d_%H%M%S)

# 或使用备份脚本（需要先创建）
./deploy/backup.sh
```

### 查看服务状态

```bash
# 使用 systemd
sudo systemctl status attendance-backend

# 使用管理脚本
./deploy/status.sh

# 检查端口
netstat -tlnp | grep 8000
# 或
ss -tlnp | grep 8000

# 检查进程
ps aux | grep uvicorn
```

---

## 故障排查

### 服务无法启动

```bash
# 1. 查看服务状态
sudo systemctl status attendance-backend

# 2. 查看详细日志
sudo journalctl -u attendance-backend -n 50

# 3. 检查配置文件
cat /etc/systemd/system/attendance-backend.service

# 4. 检查虚拟环境
ls -la /www/wwwroot/attendance-system/venv/bin/uvicorn

# 5. 手动测试启动
cd /www/wwwroot/attendance-system
source venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### 服务频繁重启

```bash
# 查看重启原因
sudo journalctl -u attendance-backend -n 100 | grep -i error

# 检查资源使用
top
free -h
df -h

# 检查端口占用
sudo lsof -i :8000
```

### 日志文件过大

```bash
# 清理旧日志（systemd）
sudo journalctl --vacuum-time=30d

# 清理应用日志
find /www/wwwroot/attendance-system/logs -name "*.log" -mtime +30 -delete
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

### 数据库只读错误（attempt to write a readonly database）

如果遇到 `sqlite3.OperationalError: attempt to write a readonly database` 错误：

```bash
# 1. 检查数据库文件权限
ls -l /www/wwwroot/attendance-system/attendance.db

# 2. 检查目录权限
ls -ld /www/wwwroot/attendance-system

# 3. 检查服务运行用户
sudo systemctl show attendance-backend | grep User

# 4. 修复权限（确保 www 用户存在）
sudo groupadd -f www
sudo useradd -r -g www -s /bin/false www 2>/dev/null || true

# 5. 设置正确的所有者和权限
sudo chown -R www:www /www/wwwroot/attendance-system
sudo chmod 664 /www/wwwroot/attendance-system/attendance.db
sudo chmod 775 /www/wwwroot/attendance-system

# 6. 检查 SELinux（如果启用）
getenforce
# 如果返回 Enforcing，可能需要设置 SELinux 上下文
# sudo chcon -R -t httpd_sys_rw_content_t /www/wwwroot/attendance-system

# 7. 重启服务
sudo systemctl restart attendance-backend

# 8. 验证修复
sudo -u www touch /www/wwwroot/attendance-system/test_write
sudo rm /www/wwwroot/attendance-system/test_write
```

**常见原因：**
1. 数据库文件所有者不是 `www` 用户
2. 数据库文件权限不足（需要 664 或 666）
3. 项目目录权限不足（需要 775，SQLite 需要创建临时文件）
4. SELinux 限制（如果启用）

---

## 快速命令参考

```bash
# 服务管理
sudo systemctl start attendance-backend      # 启动
sudo systemctl stop attendance-backend       # 停止
sudo systemctl restart attendance-backend   # 重启
sudo systemctl status attendance-backend    # 状态

# 日志查看
sudo journalctl -u attendance-backend -f    # 实时日志
sudo journalctl -u attendance-backend -n 100 # 最近100行

# 或使用脚本
./deploy/start.sh    # 启动
./deploy/stop.sh     # 停止
./deploy/restart.sh  # 重启
./deploy/status.sh   # 状态
```

---

## 注意事项

1. **文件权限**（非常重要！）：
   - `.env` 文件权限应为 `600`
   - 数据库文件 `attendance.db` 权限应为 `664`，所有者应为 `www:www`
   - 项目目录权限应为 `775`，所有者应为 `www:www`（SQLite 需要目录写权限来创建临时文件）
   - 日志目录需要写入权限，所有者应为 `www:www`
   - **如果权限不正确，会出现 "attempt to write a readonly database" 错误**

2. **防火墙**：
   - 确保端口 8000 未被防火墙阻止
   - 如果使用 Nginx 反向代理，只需要开放 80/443

3. **资源监控**：
   - 定期检查磁盘空间
   - 监控内存和 CPU 使用情况
   - 定期清理日志文件

4. **安全建议**：
   - 定期更新系统和依赖
   - 使用强密码
   - 配置 SSL 证书
   - 定期备份数据库

---

## 支持

如遇到问题，请检查：
1. 服务日志：`sudo journalctl -u attendance-backend -n 100`
2. 应用日志：`tail -f /www/wwwroot/attendance-system/logs/app.log`
3. 系统日志：`dmesg | tail`
4. 网络连接：`curl http://localhost:8000/api/health`


