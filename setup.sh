#!/bin/bash
# 考勤系统 - Linux/Mac 快速设置脚本

set -e

echo "========================================"
echo "考勤系统 - 快速设置"
echo "========================================"
echo ""

# 检查Python是否安装
if ! command -v python3 &> /dev/null; then
    echo "[错误] 未找到Python3，请先安装Python 3.8+"
    exit 1
fi

echo "[1/4] 检测到Python版本:"
python3 --version
echo ""

# 创建虚拟环境
echo "[2/4] 创建虚拟环境..."
if [ -d "venv" ]; then
    echo "虚拟环境已存在，跳过创建"
else
    python3 -m venv venv
    echo "虚拟环境创建成功"
fi
echo ""

# 激活虚拟环境并安装依赖
echo "[3/4] 安装依赖包..."
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
echo "依赖安装成功"
echo ""

# 初始化数据库
echo "[4/4] 初始化数据库..."
if [ -f "attendance.db" ]; then
    echo "数据库已存在"
    read -p "是否重新初始化数据库？这会删除所有现有数据 (y/N): " choice
    case "$choice" in 
        y|Y )
            rm attendance.db
            python init_db.py
            ;;
        * )
            echo "跳过数据库初始化"
            ;;
    esac
else
    python init_db.py
fi
echo ""

echo "========================================"
echo "设置完成！"
echo "========================================"
echo ""
echo "启动服务器:"
echo "  ./start.sh"
echo ""
echo "或手动启动:"
echo "  1. source venv/bin/activate"
echo "  2. python run.py"
echo ""
echo "访问地址:"
echo "  - 管理后台: http://localhost:8000/admin"
echo "  - 移动端:   http://localhost:8000/mobile"
echo "  - API文档:  http://localhost:8000/docs"
echo ""
echo "默认管理员账号:"
echo "  用户名: admin"
echo "  密码:   admin123"
echo ""



