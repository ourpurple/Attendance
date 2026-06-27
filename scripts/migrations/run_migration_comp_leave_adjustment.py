#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库迁移脚本：加班调休调整记录表
- 创建 comp_leave_adjustments 表（期初余额 / 人工增减），幂等可重复执行
跨平台脚本，支持 Windows 和 Linux 系统
"""
import os
import sys
import sqlite3
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Windows 控制台默认 GBK 编码，确保 emoji/中文正常输出，避免 UnicodeEncodeError
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass


def backup_database(db_path: str):
    """备份数据库"""
    if not os.path.exists(db_path):
        print(f"❌ 数据库文件不存在: {db_path}")
        return None

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = f"{db_path}.backup.{timestamp}"

    try:
        import shutil
        shutil.copy2(db_path, backup_path)
        print(f"✅ 数据库已备份到: {backup_path}")
        return backup_path
    except Exception as exc:
        print(f"⚠️  备份失败: {exc}")
        return None


def run_migration() -> bool:
    """执行数据库迁移"""
    db_path = str(PROJECT_ROOT / 'attendance.db')
    migration_path = str(PROJECT_ROOT / 'backend' / 'migrations' / 'add_comp_leave_adjustment.sql')

    if not os.path.exists(db_path):
        print(f"❌ 数据库文件不存在: {db_path}")
        print(f"   当前工作目录: {os.getcwd()}")
        return False

    if not os.path.exists(migration_path):
        print(f"❌ 迁移脚本不存在: {migration_path}")
        print(f"   当前工作目录: {os.getcwd()}")
        return False

    print('📦 正在备份数据库...')
    backup_path = backup_database(db_path)

    try:
        print('🔌 正在连接数据库...')
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        print('📖 正在读取迁移脚本...')
        with open(migration_path, 'r', encoding='utf-8') as file:
            migration_sql = file.read()
        print('⚙️  正在执行迁移...')
        cursor.executescript(migration_sql)
        conn.commit()

        # 验证表存在
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='comp_leave_adjustments'"
        )
        has_table = cursor.fetchone() is not None

        print('\n📊 验证结果:')
        print(f"   comp_leave_adjustments 表: {'已存在' if has_table else '缺失'}")

        conn.close()

        if not has_table:
            print('❌ 表创建失败')
            return False

        print('\n✅ 迁移完成！')
        if backup_path:
            print(f"💾 备份文件: {backup_path}")
        return True

    except sqlite3.OperationalError as exc:
        print(f"❌ 数据库操作失败: {exc}")
        if backup_path:
            print(f"💾 可以从备份恢复: {backup_path}")
        return False
    except Exception as exc:
        print(f"❌ 迁移执行失败: {exc}")
        import traceback
        traceback.print_exc()
        if backup_path:
            print(f"💾 可以从备份恢复: {backup_path}")
        return False


if __name__ == '__main__':
    print('=' * 72)
    print('数据库迁移：加班调休调整记录表（期初余额 / 人工增减）')
    print('跨平台脚本 - 支持 Windows 和 Linux')
    print('=' * 72)
    print()

    success = run_migration()

    print()
    if success:
        print('✅ 迁移成功完成！')
        print('   现在可启动后端服务: python run.py')
        sys.exit(0)

    print('❌ 迁移失败，请检查错误信息')
    sys.exit(1)
