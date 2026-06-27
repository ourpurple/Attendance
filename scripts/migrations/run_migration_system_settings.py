#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库迁移脚本：创建 system_settings 表并初始化 auto_approve_gm_level 开关
跨平台脚本，支持 Windows 和 Linux 系统
"""
import os
import sys
import sqlite3
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


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
    migration_path = str(PROJECT_ROOT / 'backend' / 'migrations' / 'add_system_settings.sql')

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

        print('✅ 数据库迁移执行成功')

        # 验证表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='system_settings'")
        table_exists = cursor.fetchone() is not None
        if not table_exists:
            print('❌ 未找到 system_settings 表')
            conn.close()
            return False

        # 验证默认开关记录
        cursor.execute(
            "SELECT value FROM system_settings WHERE key = ?",
            ('auto_approve_gm_level',)
        )
        row = cursor.fetchone()

        if row is None:
            print('⚠️  未找到 auto_approve_gm_level 默认配置，正在补写...')
            cursor.execute(
                """
                INSERT INTO system_settings (key, value, description)
                VALUES (?, ?, ?)
                """,
                (
                    'auto_approve_gm_level',
                    'false',
                    '开启后，任何流转到总经理审批节点的申请将自动批准'
                )
            )
            conn.commit()
            setting_value = 'false'
        else:
            setting_value = str(row[0])

        cursor.execute('SELECT COUNT(*) FROM system_settings')
        total_settings = cursor.fetchone()[0]

        print('\n📊 验证结果:')
        print(f"   system_settings 表: 已存在")
        print(f"   auto_approve_gm_level: {setting_value}")
        print(f"   设置项总数: {total_settings}")

        conn.close()
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
    print('数据库迁移：创建 system_settings 表并初始化自动审批开关')
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
