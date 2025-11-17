#!/bin/bash
# 停止考勤系统服务

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_NAME="attendance-backend"

echo "=========================================="
echo "停止考勤系统后端服务"
echo "=========================================="

# 如果 systemd 服务存在，使用 systemd
if systemctl list-unit-files | grep -q "$SERVICE_NAME.service"; then
    echo "使用 systemd 停止服务..."
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        sudo systemctl stop "$SERVICE_NAME"
        echo "✅ 服务已停止"
    else
        echo "ℹ️  服务未运行"
    fi
else
    # 直接启动方式，通过 PID 文件停止
    PID_FILE="$PROJECT_DIR/logs/app.pid"
    
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "停止进程 PID: $PID"
            kill "$PID"
            
            # 等待进程结束
            for i in {1..10}; do
                if ! ps -p "$PID" > /dev/null 2>&1; then
                    break
                fi
                sleep 1
            done
            
            # 如果还在运行，强制杀死
            if ps -p "$PID" > /dev/null 2>&1; then
                echo "⚠️  进程未正常退出，强制停止..."
                kill -9 "$PID"
            fi
            
            rm -f "$PID_FILE"
            echo "✅ 服务已停止"
        else
            echo "ℹ️  进程不存在，清理 PID 文件"
            rm -f "$PID_FILE"
        fi
    else
        # 尝试通过进程名查找
        PID=$(pgrep -f "uvicorn backend.main:app")
        if [ -n "$PID" ]; then
            echo "找到进程 PID: $PID，正在停止..."
            kill "$PID"
            sleep 2
            if ps -p "$PID" > /dev/null 2>&1; then
                kill -9 "$PID"
            fi
            echo "✅ 服务已停止"
        else
            echo "ℹ️  服务未运行"
        fi
    fi
fi

echo ""
echo "=========================================="
echo "✅ 停止完成"
echo "=========================================="







