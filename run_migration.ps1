# PowerShell 脚本：执行数据库迁移
# 使用方法：.\run_migration.ps1

$dbPath = "attendance.db"
$sqlFile = "backend/migrations/add_approval_assignment.sql"

Write-Host "开始执行数据库迁移..." -ForegroundColor Green
Write-Host "数据库文件: $dbPath" -ForegroundColor Yellow
Write-Host "SQL 文件: $sqlFile" -ForegroundColor Yellow

# 检查文件是否存在
if (-not (Test-Path $dbPath)) {
    Write-Host "错误: 数据库文件不存在: $dbPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $sqlFile)) {
    Write-Host "错误: SQL 文件不存在: $sqlFile" -ForegroundColor Red
    exit 1
}

# 读取 SQL 文件内容
$sqlContent = Get-Content $sqlFile -Raw -Encoding UTF8

# 检查是否安装了 sqlite3
$sqlite3Path = Get-Command sqlite3 -ErrorAction SilentlyContinue
if (-not $sqlite3Path) {
    Write-Host "错误: 未找到 sqlite3 命令" -ForegroundColor Red
    Write-Host "请安装 SQLite 或使用 Python 执行迁移" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "使用 Python 执行迁移：" -ForegroundColor Cyan
    Write-Host "python -c \"import sqlite3; conn = sqlite3.connect('$dbPath'); conn.executescript(open('$sqlFile', encoding='utf-8').read()); conn.commit(); conn.close(); print('迁移完成')\"" -ForegroundColor White
    exit 1
}

# 执行 SQL
try {
    # 将 SQL 内容写入临时文件（因为 PowerShell 管道可能有问题）
    $tempFile = [System.IO.Path]::GetTempFileName()
    $sqlContent | Out-File -FilePath $tempFile -Encoding UTF8 -NoNewline
    
    # 使用 sqlite3 执行
    $result = & sqlite3 $dbPath ".read $tempFile" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "迁移执行成功！" -ForegroundColor Green
    } else {
        Write-Host "迁移执行失败：" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
    }
    
    # 清理临时文件
    Remove-Item $tempFile -ErrorAction SilentlyContinue
} catch {
    Write-Host "执行迁移时出错: $_" -ForegroundColor Red
    exit 1
}

