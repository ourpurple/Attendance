@echo off
REM 考勤系统 - Windows 快速设置脚本

echo ========================================
echo 考勤系统 - 快速设置
echo ========================================
echo.

REM 检查Python是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到Python，请先安装Python 3.8+
    pause
    exit /b 1
)

echo [1/4] 检测到Python版本:
python --version
echo.

REM 创建虚拟环境
echo [2/4] 创建虚拟环境...
if exist venv (
    echo 虚拟环境已存在，跳过创建
) else (
    python -m venv venv
    if errorlevel 1 (
        echo [错误] 创建虚拟环境失败
        pause
        exit /b 1
    )
    echo 虚拟环境创建成功
)
echo.

REM 激活虚拟环境并安装依赖
echo [3/4] 安装依赖包...
call venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
    echo [错误] 安装依赖失败
    pause
    exit /b 1
)
echo 依赖安装成功
echo.

REM 初始化数据库
echo [4/4] 初始化数据库...
if exist attendance.db (
    echo 数据库已存在
    set /p choice="是否重新初始化数据库？这会删除所有现有数据 (y/N): "
    if /i "%choice%"=="y" (
        del attendance.db
        python init_db.py
    ) else (
        echo 跳过数据库初始化
    )
) else (
    python init_db.py
    if errorlevel 1 (
        echo [错误] 数据库初始化失败
        pause
        exit /b 1
    )
)
echo.

echo ========================================
echo 设置完成！
echo ========================================
echo.
echo 启动服务器:
echo   start.bat
echo.
echo 或手动启动:
echo   1. venv\Scripts\activate
echo   2. python run.py
echo.
echo 访问地址:
echo   - 管理后台: http://localhost:8000/admin
echo   - 移动端:   http://localhost:8000/mobile
echo   - API文档:  http://localhost:8000/docs
echo.
echo 默认管理员账号:
echo   用户名: admin
echo   密码:   admin123
echo.
pause



