#!/bin/bash
# 启动考勤系统服务

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_NAME="attendance-backend"

echo "=========================================="
echo "启动考勤系统后端服务"
echo "=========================================="

# 检查虚拟环境
if [ ! -d "$PROJECT_DIR/venv" ]; then
    echo "❌ 错误: 虚拟环境不存在，请先运行: python3 -m venv venv"
    exit 1
fi

# 激活虚拟环境
source "$PROJECT_DIR/venv/bin/activate"

# 检查依赖
if ! python3 -c "import uvicorn" 2>/dev/null; then
    echo "⚠️  警告: 依赖未安装，正在安装..."
    pip install -r "$PROJECT_DIR/requirements.txt"
fi

# 检查 .env 文件
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "⚠️  警告: .env 文件不存在，将使用默认配置"
fi

# 检查数据库
if [ ! -f "$PROJECT_DIR/attendance.db" ]; then
    echo "⚠️  警告: 数据库不存在，正在初始化..."
    cd "$PROJECT_DIR"
    python3 init_db.py
fi

# 检查服务是否已运行
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "✅ 服务已在运行中"
    systemctl status "$SERVICE_NAME" --no-pager
    exit 0
fi

# 启动服务
echo "🚀 启动服务..."
cd "$PROJECT_DIR"

# 如果 systemd 服务存在，使用 systemd
if systemctl list-unit-files | grep -q "$SERVICE_NAME.service"; then
    echo "使用 systemd 启动服务..."
    sudo systemctl start "$SERVICE_NAME"
    sudo systemctl enable "$SERVICE_NAME"
    sleep 2
    systemctl status "$SERVICE_NAME" --no-pager
else
    echo "使用直接启动方式..."
    # 创建日志目录
    mkdir -p "$PROJECT_DIR/logs"
    
    # 后台启动并记录日志
    nohup "$PROJECT_DIR/venv/bin/uvicorn" backend.main:app \
        --host 0.0.0.0 \
        --port 8000 \
        --log-level info \
        > "$PROJECT_DIR/logs/app.log" 2>&1 &
    
    echo $! > "$PROJECT_DIR/logs/app.pid"
    echo "✅ 服务已启动，PID: $(cat $PROJECT_DIR/logs/app.pid)"
    echo "📋 日志文件: $PROJECT_DIR/logs/app.log"
    echo ""
    echo "查看日志: tail -f $PROJECT_DIR/logs/app.log"
fi

echo ""
echo "=========================================="
echo "✅ 启动完成"
echo "=========================================="







