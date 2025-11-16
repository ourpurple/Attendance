#!/bin/bash
# 重启考勤系统服务

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo "重启考勤系统后端服务"
echo "=========================================="

# 先停止
"$SCRIPT_DIR/stop.sh"

# 等待一下
sleep 2

# 再启动
"$SCRIPT_DIR/start.sh"

echo ""
echo "=========================================="
echo "✅ 重启完成"
echo "=========================================="



