
##  常用的日常维护命令

```bash
# 创建虚拟环境
python3 -m venv venv

# 确保虚拟环境已激活
source venv/bin/activate

# 初始化数据库
python3 init_db.py

# 修复sqlite数据库读写权限  
./fix_permissions.sh

# 备份数据库
cp attendance.db attendance.db.backup.$(date +%Y%m%d_%H%M%S)
```

## systemd 日志

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

##  启停命令

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

## 代码拉取与更新

```bash
# 克隆代码仓库
git clone https://github.com/ourpurple/Attendance.git attendance-system

git clone https://bgithub.xyz/ourpurple/Attendance.git attendance-system

# github 镜像
https://bgithub.xyz

# 进入项目目录
cd /www/wwwroot/attendance-system

# 停止服务（避免更新时服务运行）
sudo systemctl stop attendance-backend

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
