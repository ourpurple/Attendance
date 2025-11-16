#!/bin/bash
# 安装项目依赖脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo "安装考勤系统依赖"
echo "=========================================="

cd "$PROJECT_DIR"

# 检查 Python3
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到 python3，请先安装 Python 3.8+"
    exit 1
fi

echo "✓ Python 版本: $(python3 --version)"

# 检查虚拟环境
if [ ! -d "$PROJECT_DIR/venv" ]; then
    echo "📦 虚拟环境不存在，正在创建..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "❌ 创建虚拟环境失败"
        exit 1
    fi
    echo "✓ 虚拟环境创建成功"
else
    echo "✓ 虚拟环境已存在"
fi

# 激活虚拟环境
echo "🔧 激活虚拟环境..."
source "$PROJECT_DIR/venv/bin/activate"

# 升级 pip
echo "⬆️  升级 pip..."
pip install --upgrade pip --quiet

# 安装依赖
echo "📥 安装项目依赖..."
pip install -r "$PROJECT_DIR/requirements.txt"

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ 依赖安装完成！"
    echo "=========================================="
    echo ""
    echo "下一步："
    echo "1. 确保虚拟环境已激活（运行脚本时会自动激活）"
    echo "2. 运行数据库初始化："
    echo "   cd $PROJECT_DIR"
    echo "   source venv/bin/activate"
    echo "   python3 init_db.py"
    echo ""
    echo "或者直接运行："
    echo "   source $PROJECT_DIR/venv/bin/activate && python3 $PROJECT_DIR/init_db.py"
    echo ""
else
    echo ""
    echo "❌ 依赖安装失败，请检查错误信息"
    exit 1
fi

