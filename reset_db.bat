@echo off
REM 重置数据库脚本

echo ========================================
echo 重置数据库
echo ========================================
echo.

REM 删除现有数据库
if exist attendance.db (
    echo 删除现有数据库...
    del attendance.db
    echo 数据库已删除
) else (
    echo 数据库文件不存在
)
echo.

REM 激活虚拟环境
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
) else (
    echo [错误] 虚拟环境不存在，请先运行 setup.bat
    pause
    exit /b 1
)

REM 重新初始化数据库
echo 初始化数据库...
python init_db.py

echo.
echo ========================================
echo 数据库重置完成！
echo ========================================
pause


