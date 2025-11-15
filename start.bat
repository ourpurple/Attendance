@echo off
REM 考勤系统 - Windows 启动脚本

echo ========================================
echo 考勤系统 - 启动服务器
echo ========================================
echo.

REM 检查虚拟环境
if not exist venv (
    echo [错误] 虚拟环境不存在，请先运行 setup.bat
    pause
    exit /b 1
)

REM 激活虚拟环境
echo 激活虚拟环境...
call venv\Scripts\activate.bat

REM 启动服务器
echo.
echo 启动服务器...
echo.
echo ========================================
echo 服务器运行中
echo ========================================
echo.
echo 访问地址:
echo   - 管理后台: http://localhost:8000/admin
echo   - 移动端:   http://localhost:8000/mobile
echo   - API文档:  http://localhost:8000/docs
echo.
echo 按 Ctrl+C 停止服务器
echo ========================================
echo.

python run.py



