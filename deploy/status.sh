#!/bin/bash
# 查看考勤系统服务状态

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_NAME="attendance-backend"

echo "=========================================="
echo "考勤系统服务状态"
echo "=========================================="

# 检查 systemd 服务
if systemctl list-unit-files | grep -q "$SERVICE_NAME.service"; then
    echo "📋 Systemd 服务状态:"
    systemctl status "$SERVICE_NAME" --no-pager -l
    echo ""
    echo "📋 最近日志:"
    journalctl -u "$SERVICE_NAME" -n 20 --no-pager
else
    # 检查直接启动的进程
    PID_FILE="$PROJECT_DIR/logs/app.pid"
    
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "✅ 服务正在运行"
            echo "   PID: $PID"
            echo "   进程信息:"
            ps -p "$PID" -o pid,ppid,cmd,etime,stat
            echo ""
            echo "📋 端口监听:"
            netstat -tlnp 2>/dev/null | grep ":8000" || ss -tlnp 2>/dev/null | grep ":8000"
            echo ""
            echo "📋 最近日志 (最后20行):"
            if [ -f "$PROJECT_DIR/logs/app.log" ]; then
                tail -n 20 "$PROJECT_DIR/logs/app.log"
            else
                echo "   日志文件不存在"
            fi
        else
            echo "❌ 服务未运行 (PID 文件存在但进程不存在)"
            rm -f "$PID_FILE"
        fi
    else
        # 尝试通过进程名查找
        PID=$(pgrep -f "uvicorn backend.main:app")
        if [ -n "$PID" ]; then
            echo "✅ 服务正在运行 (未使用 PID 文件)"
            echo "   PID: $PID"
            ps -p "$PID" -o pid,ppid,cmd,etime,stat
        else
            echo "❌ 服务未运行"
        fi
    fi
fi

echo ""
echo "=========================================="


