#!/bin/bash
# 安装考勤系统服务（systemd）

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_NAME="attendance-backend"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "=========================================="
echo "安装考勤系统服务 (systemd)"
echo "=========================================="

# 检查是否为 root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ 请使用 sudo 运行此脚本"
    exit 1
fi

# 检查服务文件是否存在
if [ ! -f "$SCRIPT_DIR/attendance.service" ]; then
    echo "❌ 错误: 找不到服务文件 $SCRIPT_DIR/attendance.service"
    exit 1
fi

# 替换服务文件中的路径
sed "s|/www/wwwroot/attendance-system|$PROJECT_DIR|g" \
    "$SCRIPT_DIR/attendance.service" > "$SERVICE_FILE"

echo "✅ 服务文件已创建: $SERVICE_FILE"

# 重新加载 systemd
systemctl daemon-reload
echo "✅ Systemd 配置已重新加载"

# 启用服务（开机自启）
systemctl enable "$SERVICE_NAME"
echo "✅ 服务已设置为开机自启"

echo ""
echo "=========================================="
echo "✅ 安装完成"
echo "=========================================="
echo ""
echo "使用以下命令管理服务:"
echo "  启动:   sudo systemctl start $SERVICE_NAME"
echo "  停止:   sudo systemctl stop $SERVICE_NAME"
echo "  重启:   sudo systemctl restart $SERVICE_NAME"
echo "  状态:   sudo systemctl status $SERVICE_NAME"
echo "  日志:   sudo journalctl -u $SERVICE_NAME -f"
echo ""


