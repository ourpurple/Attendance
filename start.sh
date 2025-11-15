#!/bin/bash
# 考勤系统 - Linux/Mac 启动脚本

set -e

echo "========================================"
echo "考勤系统 - 启动服务器"
echo "========================================"
echo ""

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "[错误] 虚拟环境不存在，请先运行 ./setup.sh"
    exit 1
fi

# 激活虚拟环境
echo "激活虚拟环境..."
source venv/bin/activate

# 启动服务器
echo ""
echo "启动服务器..."
echo ""
echo "========================================"
echo "服务器运行中"
echo "========================================"
echo ""
echo "访问地址:"
echo "  - 管理后台: http://localhost:8000/admin"
echo "  - 移动端:   http://localhost:8000/mobile"
echo "  - API文档:  http://localhost:8000/docs"
echo ""
echo "按 Ctrl+C 停止服务器"
echo "========================================"
echo ""

python run.py



