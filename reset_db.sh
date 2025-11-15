#!/bin/bash
# 重置数据库脚本

echo "========================================"
echo "重置数据库"
echo "========================================"
echo ""

# 删除现有数据库
if [ -f "attendance.db" ]; then
    echo "删除现有数据库..."
    rm attendance.db
    echo "数据库已删除"
else
    echo "数据库文件不存在"
fi
echo ""

# 激活虚拟环境
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
else
    echo "[错误] 虚拟环境不存在，请先运行 ./setup.sh"
    exit 1
fi

# 重新初始化数据库
echo "初始化数据库..."
python init_db.py

echo ""
echo "========================================"
echo "数据库重置完成！"
echo "========================================"


