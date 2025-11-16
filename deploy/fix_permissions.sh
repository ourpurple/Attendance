#!/bin/bash
# 修复数据库权限问题

PROJECT_DIR="/www/wwwroot/attendance-system"
SERVICE_NAME="attendance-backend"

echo "=========================================="
echo "修复数据库权限问题"
echo "=========================================="

# 检查是否为 root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ 请使用 sudo 运行此脚本"
    exit 1
fi

# 检查项目目录是否存在
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ 错误: 项目目录不存在: $PROJECT_DIR"
    echo "请修改脚本中的 PROJECT_DIR 变量为正确的路径"
    exit 1
fi

# 确保 www 用户存在
echo ""
echo "检查 www 用户..."
if id "www" &>/dev/null; then
    echo "✅ www 用户已存在"
else
    echo "创建 www 用户..."
    groupadd -f www
    useradd -r -g www -s /bin/false www 2>/dev/null || true
    if id "www" &>/dev/null; then
        echo "✅ www 用户已创建"
    else
        echo "❌ 无法创建 www 用户"
        exit 1
    fi
fi

# 停止服务（如果正在运行）
echo ""
echo "停止服务..."
if systemctl is-active --quiet "$SERVICE_NAME"; then
    systemctl stop "$SERVICE_NAME"
    echo "✅ 服务已停止"
else
    echo "ℹ️  服务未运行"
fi

# 设置项目目录权限
echo ""
echo "设置项目目录权限..."
chown -R www:www "$PROJECT_DIR"
chmod 775 "$PROJECT_DIR"
echo "✅ 项目目录权限已设置: $PROJECT_DIR"

# 设置数据库文件权限
echo ""
echo "设置数据库文件权限..."
if [ -f "$PROJECT_DIR/attendance.db" ]; then
    chown www:www "$PROJECT_DIR/attendance.db"
    chmod 664 "$PROJECT_DIR/attendance.db"
    echo "✅ 数据库文件权限已设置: $PROJECT_DIR/attendance.db"
    
    # 显示当前权限
    ls -l "$PROJECT_DIR/attendance.db"
else
    echo "⚠️  数据库文件不存在，创建它..."
    touch "$PROJECT_DIR/attendance.db"
    chown www:www "$PROJECT_DIR/attendance.db"
    chmod 664 "$PROJECT_DIR/attendance.db"
    echo "✅ 数据库文件已创建并设置权限"
fi

# 设置日志目录权限
if [ -d "$PROJECT_DIR/logs" ]; then
    echo ""
    echo "设置日志目录权限..."
    chown -R www:www "$PROJECT_DIR/logs"
    chmod 775 "$PROJECT_DIR/logs"
    echo "✅ 日志目录权限已设置"
fi

# 验证权限
echo ""
echo "验证权限..."
if sudo -u www touch "$PROJECT_DIR/test_write" 2>/dev/null; then
    sudo rm "$PROJECT_DIR/test_write"
    echo "✅ 权限验证通过：www 用户可以写入文件"
else
    echo "❌ 权限验证失败：www 用户无法写入文件"
    echo "请检查 SELinux 或其他安全策略"
fi

# 检查 SELinux
if command -v getenforce &> /dev/null; then
    selinux_status=$(getenforce)
    if [ "$selinux_status" = "Enforcing" ]; then
        echo ""
        echo "⚠️  SELinux 处于强制模式，可能需要设置上下文："
        echo "   sudo chcon -R -t httpd_sys_rw_content_t $PROJECT_DIR"
    fi
fi

# 重启服务
echo ""
echo "重启服务..."
if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
    systemctl start "$SERVICE_NAME"
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo "✅ 服务已启动"
    else
        echo "❌ 服务启动失败，请检查日志："
        echo "   sudo journalctl -u $SERVICE_NAME -n 50"
    fi
else
    echo "ℹ️  服务未安装，请先运行: sudo bash install.sh"
fi

echo ""
echo "=========================================="
echo "✅ 权限修复完成"
echo "=========================================="
echo ""
echo "如果问题仍然存在，请检查："
echo "1. 服务日志: sudo journalctl -u $SERVICE_NAME -n 50"
echo "2. 文件权限: ls -l $PROJECT_DIR/attendance.db"
echo "3. 目录权限: ls -ld $PROJECT_DIR"
echo "4. SELinux 状态: getenforce"

